-- ============================================================================
-- Audit RLS, durcissement de toutes les tables encore non protégées.
-- Version corrigée avec les vraies colonnes de chaque table.
--   clients, dossiers_immo, linkedin_posts, prospects, programmes,
--   promoteurs, leads, invitations, advisor_monthly_signatures
--
-- Avant cette migration, ces tables n'avaient pas RLS activée → tout user
-- authentifié pouvait lire et modifier les données de ses collègues.
-- ============================================================================

-- ─── CLIENTS (advisor_code + co_advisor_code) ───
alter table public.clients enable row level security;
drop policy if exists "clients_select_scope" on public.clients;
create policy "clients_select_scope" on public.clients for select to authenticated
using (
  public.is_manager()
  or advisor_code = public.current_advisor_code()
  or co_advisor_code = public.current_advisor_code()
);

drop policy if exists "clients_insert_scope" on public.clients;
create policy "clients_insert_scope" on public.clients for insert to authenticated
with check (
  public.is_manager()
  or advisor_code = public.current_advisor_code()
  or advisor_code is null
);

drop policy if exists "clients_update_scope" on public.clients;
create policy "clients_update_scope" on public.clients for update to authenticated
using (
  public.is_manager()
  or advisor_code = public.current_advisor_code()
  or co_advisor_code = public.current_advisor_code()
)
with check (
  public.is_manager()
  or advisor_code = public.current_advisor_code()
  or co_advisor_code = public.current_advisor_code()
);

drop policy if exists "clients_delete_manager" on public.clients;
create policy "clients_delete_manager" on public.clients for delete to authenticated
using (public.is_manager());

-- ─── LEADS (taken_by uuid, mode shotgun) ───
alter table public.leads enable row level security;
drop policy if exists "leads_select_all_authenticated" on public.leads;
create policy "leads_select_all_authenticated" on public.leads for select to authenticated
using (true);

drop policy if exists "leads_update_scope" on public.leads;
create policy "leads_update_scope" on public.leads for update to authenticated
using (public.is_manager() or taken_by = auth.uid() or taken_by is null)
with check (public.is_manager() or taken_by = auth.uid() or taken_by is null);

drop policy if exists "leads_insert_manager" on public.leads;
create policy "leads_insert_manager" on public.leads for insert to authenticated
with check (public.is_manager());

drop policy if exists "leads_delete_manager" on public.leads;
create policy "leads_delete_manager" on public.leads for delete to authenticated
using (public.is_manager());

-- ─── PROSPECTS ───
alter table public.prospects enable row level security;
drop policy if exists "prospects_select_authenticated" on public.prospects;
create policy "prospects_select_authenticated" on public.prospects for select to authenticated
using (true);
drop policy if exists "prospects_write_manager" on public.prospects;
create policy "prospects_write_manager" on public.prospects for all to authenticated
using (public.is_manager()) with check (public.is_manager());

-- ─── DOSSIERS_IMMO (conseiller_id uuid → profiles.id == auth.users.id) ───
alter table public.dossiers_immo enable row level security;
drop policy if exists "dossiers_immo_select_scope" on public.dossiers_immo;
create policy "dossiers_immo_select_scope" on public.dossiers_immo for select to authenticated
using (public.is_manager() or conseiller_id = auth.uid());
drop policy if exists "dossiers_immo_modify_scope" on public.dossiers_immo;
create policy "dossiers_immo_modify_scope" on public.dossiers_immo for all to authenticated
using (public.is_manager() or conseiller_id = auth.uid())
with check (public.is_manager() or conseiller_id = auth.uid());

-- ─── PROGRAMMES (catalogue partagé) ───
alter table public.programmes enable row level security;
drop policy if exists "programmes_select_authenticated" on public.programmes;
create policy "programmes_select_authenticated" on public.programmes for select to authenticated
using (true);
drop policy if exists "programmes_write_manager" on public.programmes;
create policy "programmes_write_manager" on public.programmes for all to authenticated
using (public.is_manager()) with check (public.is_manager());

-- ─── PROMOTEURS (catalogue partagé) ───
alter table public.promoteurs enable row level security;
drop policy if exists "promoteurs_select_authenticated" on public.promoteurs;
create policy "promoteurs_select_authenticated" on public.promoteurs for select to authenticated
using (true);
drop policy if exists "promoteurs_write_manager" on public.promoteurs;
create policy "promoteurs_write_manager" on public.promoteurs for all to authenticated
using (public.is_manager()) with check (public.is_manager());

-- ─── LINKEDIN_POSTS (conseiller_id uuid) ───
alter table public.linkedin_posts enable row level security;
drop policy if exists "linkedin_posts_select_scope" on public.linkedin_posts;
create policy "linkedin_posts_select_scope" on public.linkedin_posts for select to authenticated
using (public.is_manager() or conseiller_id = auth.uid());
drop policy if exists "linkedin_posts_modify_scope" on public.linkedin_posts;
create policy "linkedin_posts_modify_scope" on public.linkedin_posts for all to authenticated
using (public.is_manager() or conseiller_id = auth.uid())
with check (public.is_manager() or conseiller_id = auth.uid());

-- ─── INVITATIONS (manager only) ───
alter table public.invitations enable row level security;
drop policy if exists "invitations_manager" on public.invitations;
create policy "invitations_manager" on public.invitations for all to authenticated
using (public.is_manager()) with check (public.is_manager());

-- ─── ADVISOR_MONTHLY_SIGNATURES (advisor_code) ───
alter table public.advisor_monthly_signatures enable row level security;
drop policy if exists "ams_select_authenticated" on public.advisor_monthly_signatures;
create policy "ams_select_authenticated" on public.advisor_monthly_signatures for select to authenticated
using (true);
drop policy if exists "ams_write_scope" on public.advisor_monthly_signatures;
create policy "ams_write_scope" on public.advisor_monthly_signatures for all to authenticated
using (public.is_manager() or advisor_code = public.current_advisor_code())
with check (public.is_manager() or advisor_code = public.current_advisor_code());

-- ============================================================================
-- Vérification post-migration, lance ce SELECT pour t'assurer que toutes
-- les tables ont bien RLS active :
--
-- select schemaname, tablename, rowsecurity
-- from pg_tables
-- where schemaname = 'public'
-- order by tablename;
--
-- rowsecurity doit être true pour toutes les lignes affichées.
-- ============================================================================
