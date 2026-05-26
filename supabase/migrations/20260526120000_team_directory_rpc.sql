-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : RPC team_directory (annuaire interne accessible à tous)
-- Date    : 2026-05-26
--
-- Pourquoi : les RLS sur profiles peuvent bloquer un conseiller qui veut
-- lister ses collègues pour les ajouter en co-conseiller sur un deal.
-- Cette RPC bypass les RLS et retourne UNIQUEMENT les champs non-sensibles
-- nécessaires aux dropdowns (id, nom, prénom, code, rôle, actif).
--
-- Pas de salaire, pas d'email perso, pas de données confidentielles.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.team_directory()
RETURNS TABLE (
  id            UUID,
  full_name     TEXT,
  email         TEXT,
  advisor_code  TEXT,
  role          TEXT,
  is_active     BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, full_name, email, advisor_code, role, is_active
  FROM public.profiles
  WHERE is_active = true
    AND advisor_code IS NOT NULL
  ORDER BY full_name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.team_directory() TO authenticated;

COMMENT ON FUNCTION public.team_directory IS 'Annuaire interne — liste des conseillers actifs avec leur advisor_code. Bypass des RLS profiles pour que les dropdowns de co-conseiller fonctionnent pour tous les utilisateurs (managers + conseillers).';
