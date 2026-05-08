-- Étend dossier_relance_log pour supporter plusieurs types de relances
-- envoyées par l'Edge Function relance-dossiers-vieillissants :
--   - vieillissement : dossier en pipeline >30j sans mouvement
--   - avis_google    : signé J+30, demander si avis Google laissé
--   - multi_equip    : client signé sur 1 seul type de produit, suggérer un 2e

alter table public.dossier_relance_log
  add column if not exists type text not null default 'vieillissement';

-- Drop l'index existant pour le recréer avec le type (cooldown par type).
drop index if exists idx_dossier_relance_log_deal_sent;

create index if not exists idx_dossier_relance_log_deal_type_sent
  on public.dossier_relance_log(deal_id, type, sent_at desc);
