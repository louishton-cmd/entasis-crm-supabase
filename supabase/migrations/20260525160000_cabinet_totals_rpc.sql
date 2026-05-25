-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : Fonction RPC cabinet_totals_month
-- Date    : 2026-05-25
--
-- Permet aux conseillers de voir les TOTAUX cabinet (PP/PU signées,
-- nombre de dossiers) sans exposer les détails par conseiller.
-- SECURITY DEFINER pour bypass les RLS deals (qui filtrent par advisor_code).
-- Retour : montants agrégés uniquement, AUCUNE donnée individuelle.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cabinet_totals_month(p_month TEXT)
RETURNS TABLE (
  pp_signee     NUMERIC,
  pu_signee     NUMERIC,
  pp_pipeline   NUMERIC,
  pu_pipeline   NUMERIC,
  signed_count  INT,
  pipeline_count INT,
  total_count   INT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(CASE WHEN status = 'Signé' THEN COALESCE(pp_m, 0) * 12 ELSE 0 END), 0)::NUMERIC      AS pp_signee,
    COALESCE(SUM(CASE WHEN status = 'Signé' THEN COALESCE(pu, 0) ELSE 0 END), 0)::NUMERIC            AS pu_signee,
    COALESCE(SUM(CASE WHEN status IN ('En cours', 'Prévu') THEN COALESCE(pp_m, 0) * 12 ELSE 0 END), 0)::NUMERIC AS pp_pipeline,
    COALESCE(SUM(CASE WHEN status IN ('En cours', 'Prévu') THEN COALESCE(pu, 0) ELSE 0 END), 0)::NUMERIC AS pu_pipeline,
    COUNT(*) FILTER (WHERE status = 'Signé')::INT                                                     AS signed_count,
    COUNT(*) FILTER (WHERE status IN ('En cours', 'Prévu'))::INT                                      AS pipeline_count,
    COUNT(*)::INT                                                                                     AS total_count
  FROM public.deals
  WHERE month = p_month;
$$;

-- Tout utilisateur authentifié peut appeler cette fonction (consultation
-- agrégée uniquement, pas de fuite individuelle).
GRANT EXECUTE ON FUNCTION public.cabinet_totals_month(TEXT) TO authenticated;

COMMENT ON FUNCTION public.cabinet_totals_month IS 'Totaux cabinet (PP/PU signées et pipeline, nombre de dossiers) pour un mois donné. SECURITY DEFINER permet aux conseillers de voir les agrégats malgré la RLS deals.';
