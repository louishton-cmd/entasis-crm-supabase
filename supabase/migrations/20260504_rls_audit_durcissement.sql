-- ============================================================================
-- Audit RLS, durcissement de toutes les tables encore non protégées.
--
-- Avant cette migration, plusieurs tables (clients, leads, prospects,
-- dossiers_immo, programmes, promoteurs, invitations, linkedin_posts,
-- advisor_monthly_signatures) n'avaient pas RLS activée, ce qui permettait
-- à n'importe quel user authentifié de lire et modifier toutes les
-- données, y compris celles des autres conseillers.
--
-- Cette migration active RLS partout et ajoute des policies par défaut
-- alignées sur le pattern "scope advisor" déjà en place sur deals.
-- ============================================================================

-- ─────────────── CLIENTS ───────────────
-- Un advisor voit ses clients (advisor_code matché), un manager voit tout.
alter table public.clients enable row level security;

drop policy if exists "clients_select_scope" on public.clients;
create policy "clients_select_scope"
on public.clients for select
to authenticated
using (
  public.is_manager()
  or advisor_code = public.current_advisor_code()
);

drop policy if exists "clients_insert_scope" on public.clients;
create policy "clients_insert_scope"
on public.clients for insert
to authenticated
with check (
  public.is_manager()
  or advisor_code = public.current_advisor_code()
  or advisor_code is null
);

drop policy if exists "clients_update_scope" on public.clients;
create policy "clients_update_scope"
on public.clients for update
to authenticated
using (
  public.is_manager()
  or advisor_code = public.current_advisor_code()
)
with check (
  public.is_manager()
  or advisor_code = public.current_advisor_code()
);

drop policy if exists "clients_delete_manager" on public.clients;
create policy "clients_delete_manager"
on public.clients for delete
to authenticated
using (public.is_manager());

-- ─────────────── LEADS ───────────────
-- Mode shotgun, tous les advisors voient les leads disponibles. Manager
-- voit tout. Sinon, advisor possède ou peut prendre un lead libre.
alter table public.leads enable row level security;

drop policy if exists "leads_select_all_authenticated" on public.leads;
create policy "leads_select_all_authenticated"
on public.leads for select
to authenticated
using (true);

drop policy if exists "leads_update_scope" on public.leads;
create policy "leads_update_scope"
on public.leads for update
to authenticated
using (
  public.is_manager()
  or taken_by = auth.uid()
  or taken_by is null
)
with check (
  public.is_manager()
  or taken_by = auth.uid()
  or taken_by is null
);

drop policy if exists "leads_insert_manager_or_service" on public.leads;
create policy "leads_insert_manager_or_service"
on public.leads for insert
to authenticated
with check (public.is_manager());

drop policy if exists "leads_delete_manager" on public.leads;
create policy "leads_delete_manager"
on public.leads for delete
to authenticated
using (public.is_manager());

-- ─────────────── PROSPECTS ───────────────
alter table public.prospects enable row level security;

drop policy if exists "prospects_select_authenticated" on public.prospects;
create policy "prospects_select_authenticated"
on public.prospects for select
to authenticated
using (true);

drop policy if exists "prospects_write_manager" on public.prospects;
create policy "prospects_write_manager"
on public.prospects for all
to authenticated
using (public.is_manager())
with check (public.is_manager());

-- ─────────────── DOSSIERS_IMMO ───────────────
-- Pattern advisor scope (un dossier appartient à un advisor)
alter table public.dossiers_immo enable row level security;

drop policy if exists "dossiers_immo_select_scope" on public.dossiers_immo;
create policy "dossiers_immo_select_scope"
on public.dossiers_immo for select
to authenticated
using (
  public.is_manager()
  or advisor_code = public.current_advisor_code()
);

drop policy if exists "dossiers_immo_modify_scope" on public.dossiers_immo;
create policy "dossiers_immo_modify_scope"
on public.dossiers_immo for all
to authenticated
using (
  public.is_manager()
  or advisor_code = public.current_advisor_code()
)
with check (
  public.is_manager()
  or advisor_code = public.current_advisor_code()
);

-- ─────────────── PROGRAMMES (catalogue immo neuf) ───────────────
-- Lecture pour tout le monde, écriture managers uniquement
alter table public.programmes enable row level security;

drop policy if exists "programmes_select_authenticated" on public.programmes;
create policy "programmes_select_authenticated"
on public.programmes for select
to authenticated
using (true);

drop policy if exists "programmes_write_manager" on public.programmes;
create policy "programmes_write_manager"
on public.programmes for all
to authenticated
using (public.is_manager())
with check (public.is_manager());

-- ─────────────── PROMOTEURS ───────────────
alter table public.promoteurs enable row level security;

drop policy if exists "promoteurs_select_authenticated" on public.promoteurs;
create policy "promoteurs_select_authenticated"
on public.promoteurs for select
to authenticated
using (true);

drop policy if exists "promoteurs_write_manager" on public.promoteurs;
create policy "promoteurs_write_manager"
on public.promoteurs for all
to authenticated
using (public.is_manager())
with check (public.is_manager());

-- ─────────────── LINKEDIN_POSTS ───────────────
-- Un advisor voit/édite ses propres posts, manager voit tout
alter table public.linkedin_posts enable row level security;

drop policy if exists "linkedin_posts_select_scope" on public.linkedin_posts;
create policy "linkedin_posts_select_scope"
on public.linkedin_posts for select
to authenticated
using (
  public.is_manager()
  or advisor_code = public.current_advisor_code()
);

drop policy if exists "linkedin_posts_modify_scope" on public.linkedin_posts;
create policy "linkedin_posts_modify_scope"
on public.linkedin_posts for all
to authenticated
using (
  public.is_manager()
  or advisor_code = public.current_advisor_code()
)
with check (
  public.is_manager()
  or advisor_code = public.current_advisor_code()
);

-- ─────────────── INVITATIONS ───────────────
-- Manager only (gestion d'équipe)
alter table public.invitations enable row level security;

drop policy if exists "invitations_manager" on public.invitations;
create policy "invitations_manager"
on public.invitations for all
to authenticated
using (public.is_manager())
with check (public.is_manager());

-- ─────────────── ADVISOR_MONTHLY_SIGNATURES ───────────────
-- Lecture pour tous (anonymisé via aggregat), écriture manager
alter table public.advisor_monthly_signatures enable row level security;

drop policy if exists "ams_select_authenticated" on public.advisor_monthly_signatures;
create policy "ams_select_authenticated"
on public.advisor_monthly_signatures for select
to authenticated
using (true);

drop policy if exists "ams_write_manager" on public.advisor_monthly_signatures;
create policy "ams_write_manager"
on public.advisor_monthly_signatures for all
to authenticated
using (public.is_manager())
with check (public.is_manager());

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
