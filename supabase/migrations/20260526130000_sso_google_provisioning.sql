-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : SSO Google — auto-provisioning + restriction de domaine (CRM)
-- Date    : 2026-05-26
--
-- POURQUOI
-- Avec le SSO Google, un nouvel utilisateur arrive directement dans
-- auth.users sans passer par le formulaire de signup React. Il faut donc
-- que le trigger handle_new_user :
--   1. Rejette les emails hors @entasis-conseil.fr (sécurité — empêche
--      qu'un parfait inconnu avec un compte Google puisse s'inscrire)
--   2. Génère automatiquement un advisor_code à partir du nom Google
--      (raw_user_meta_data.full_name), évitant que le profil reste avec
--      advisor_code=NULL et soit invisible des dropdowns co-conseiller.
--   3. Set le role='advisor' par défaut.
--
-- Les comptes existants ne sont pas touchés.
-- ═══════════════════════════════════════════════════════════════════════════

-- Domaine autorisé (modifier ici si l'entreprise change de TLD)
-- Helper inline ; pas de constante en plpgsql donc on duplique.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_advisor_code TEXT;
  v_provider TEXT;
BEGIN
  -- ─── 1. Restriction de domaine ────────────────────────────────────────
  -- Bloque tout email qui ne se termine pas par @entasis-conseil.fr.
  -- Évite qu'un compte Google externe puisse se créer un compte CRM.
  IF NEW.email IS NULL OR NEW.email !~* '@entasis-conseil\.fr$' THEN
    RAISE EXCEPTION 'SSO_DOMAIN_REFUSED: seuls les emails @entasis-conseil.fr peuvent se connecter (reçu: %)', NEW.email;
  END IF;

  -- ─── 2. Extraction du nom complet ─────────────────────────────────────
  -- Google passe le nom dans raw_user_meta_data.full_name ou .name.
  -- Fallback : la partie locale de l'email.
  v_full_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    INITCAP(REPLACE(SPLIT_PART(NEW.email, '@', 1), '.', ' '))
  );

  -- ─── 3. Génération de l'advisor_code ──────────────────────────────────
  -- Normalisation : suppression des accents, uppercase, alphanumérique
  -- seulement, max 12 caractères. Ex: "Arthur Follezou Gicquiaud" →
  -- "ARTHURFOLLEZ". Évite NULL = lead invisible des dropdowns.
  v_advisor_code := UPPER(
    REGEXP_REPLACE(
      TRANSLATE(
        v_full_name,
        'àáâãäåèéêëìíîïòóôõöùúûüýÿñçÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝŸÑÇ',
        'aaaaaaeeeeiiiiooooouuuuyync' || 'AAAAAAEEEEIIIIOOOOOUUUUYYNC'
      ),
      '[^A-Za-z0-9]', '', 'g'
    )
  );
  v_advisor_code := LEFT(v_advisor_code, 12);
  IF v_advisor_code = '' THEN
    v_advisor_code := NULL;  -- on préfère NULL à une chaîne vide
  END IF;

  -- ─── 4. Détection du provider (audit/log) ─────────────────────────────
  v_provider := COALESCE(
    NEW.raw_app_meta_data ->> 'provider',
    'email'
  );

  -- ─── 5. Upsert profile ────────────────────────────────────────────────
  INSERT INTO public.profiles (id, email, full_name, role, advisor_code, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    'advisor',
    v_advisor_code,
    TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    -- Ne pas écraser full_name/advisor_code s'ils existent déjà :
    -- un conseiller existant garde son nom officiel d'avant le SSO.
    full_name = COALESCE(profiles.full_name, EXCLUDED.full_name),
    advisor_code = COALESCE(profiles.advisor_code, EXCLUDED.advisor_code),
    is_active = TRUE;

  -- Log léger pour debug
  RAISE NOTICE 'handle_new_user: user % (%, provider=%) → advisor_code=%',
    NEW.email, NEW.id, v_provider, v_advisor_code;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user IS
  'Provisionne automatiquement un profile à chaque nouvel auth.users. Refuse les emails hors @entasis-conseil.fr. Génère advisor_code et role par défaut. Compatible signup email/password ET sign-in Google OAuth.';

-- Le trigger lui-même est déjà en place (créé dans schema.sql), pas besoin
-- de le re-déclarer.
