-- ═══════════════════════════════════════════════════════════════════════════
-- MODULE RECRUTEMENT — Table candidats + actions
-- Date    : 2026-05-28
--
-- POURQUOI
-- Louis veut un module Recrutement intégré au CRM (pas juste un iframe Tally).
-- On stocke en BDD CRM les candidatures, leur étape dans le process Entasis,
-- les notes manager, et la timeline d'actions.
--
-- INTÉGRATION TALLY
-- Quand on aura la clé API Tally, une route serveur Lead Room
-- (/api/admin/sync-tally) viendra puller les nouvelles soumissions et
-- les insérer ici via tally_submission_id (unique pour idempotence).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper trigger pour updated_at (réutilisable)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─── Table candidats ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recruitment_candidates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tally_submission_id   TEXT UNIQUE,                     -- null si saisie manuelle
  full_name             TEXT NOT NULL,
  email                 TEXT,
  phone                 TEXT,
  position              TEXT,                            -- poste visé (libre)
  source                TEXT NOT NULL DEFAULT 'manuel',  -- 'tally' | 'linkedin' | 'cooptation' | 'wttj' | 'manuel'
  status                TEXT NOT NULL DEFAULT 'received'
                          CHECK (status IN (
                            'received',         -- Candidature reçue
                            'screening',        -- Filtrage CV/LinkedIn
                            'interview_rh',     -- Entretien RH (tel)
                            'interview_dir',    -- Entretien direction
                            'offered',          -- Proposition envoyée
                            'hired',            -- Embauché ✓
                            'rejected'          -- Refusé
                          )),
  score                 SMALLINT DEFAULT 0 CHECK (score BETWEEN 0 AND 10),
  tags                  TEXT[] DEFAULT ARRAY[]::TEXT[],
  notes                 TEXT,                            -- notes manager libres
  rejection_reason      TEXT,
  cv_url                TEXT,
  linkedin_url          TEXT,
  submission_payload    JSONB,                           -- réponses Tally brutes
  applied_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_action_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS recruitment_candidates_status_idx ON public.recruitment_candidates(status);
CREATE INDEX IF NOT EXISTS recruitment_candidates_applied_at_idx ON public.recruitment_candidates(applied_at DESC);
CREATE INDEX IF NOT EXISTS recruitment_candidates_source_idx ON public.recruitment_candidates(source);

DROP TRIGGER IF EXISTS recruitment_candidates_set_updated_at ON public.recruitment_candidates;
CREATE TRIGGER recruitment_candidates_set_updated_at
  BEFORE UPDATE ON public.recruitment_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.recruitment_candidates IS
  'Candidats au recrutement Entasis. Source principale, Tally workspace wolq6x. Ajout manuel possible.';

-- ─── Table actions (timeline) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recruitment_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  UUID NOT NULL REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  action_type   TEXT NOT NULL CHECK (action_type IN (
                  'status_change', 'note_added', 'score_updated', 'tag_added',
                  'tag_removed', 'rejected', 'hired', 'email_sent', 'interview_scheduled'
                )),
  payload       JSONB,                                   -- détails de l'action (from/to status, note text, etc)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS recruitment_actions_candidate_idx ON public.recruitment_actions(candidate_id, created_at DESC);

COMMENT ON TABLE public.recruitment_actions IS
  'Timeline des actions manager sur un candidat (changement de status, notes, email envoyé, etc.)';

-- ─── RLS — manager-only ──────────────────────────────────────────────
ALTER TABLE public.recruitment_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers full recruitment_candidates" ON public.recruitment_candidates;
CREATE POLICY "managers full recruitment_candidates"
  ON public.recruitment_candidates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'manager'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'manager'));

DROP POLICY IF EXISTS "managers full recruitment_actions" ON public.recruitment_actions;
CREATE POLICY "managers full recruitment_actions"
  ON public.recruitment_actions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'manager'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'manager'));

-- ─── Trigger auto-log dans actions au changement de status ───────────
CREATE OR REPLACE FUNCTION public.log_recruitment_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.recruitment_actions(candidate_id, action_type, payload, created_by)
    VALUES (NEW.id, 'status_change',
            jsonb_build_object('from', OLD.status, 'to', NEW.status),
            NEW.created_by);
    NEW.last_action_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recruitment_log_status_change ON public.recruitment_candidates;
CREATE TRIGGER recruitment_log_status_change
  BEFORE UPDATE ON public.recruitment_candidates
  FOR EACH ROW EXECUTE FUNCTION public.log_recruitment_status_change();
