-- UCS Produits Structurés (Louis 2026-05-25)
-- Catalogue des produits structurés du groupement + simulations de commission.
--
-- Adaptation par rapport à la spec initiale :
--   - Rôle admin = 'manager' (vs 'admin'/'direction' dans la spec). Le CRM
--     n'a pas ces deux rôles ; on réutilise l'existant pour éviter une
--     migration de profils.
--   - couleur_badge stockée pour reproduire visuellement les bandeaux de
--     l'export groupement (l'admin peut l'éditer).

-- ─────────────────────────────────────────────────────────────────────────────
-- Table principale : catalogue UCS
-- ─────────────────────────────────────────────────────────────────────────────

create table public.ucs_structures (
  id                  uuid primary key default gen_random_uuid(),
  etat                text not null check (etat in ('EN_COURS', 'CLOTURE', 'ANNULATION')),
  nom_ucs             text not null,
  code_isin           text unique not null,
  compagnie           text not null,
  upfront             numeric(5, 3) not null,   -- % (ex: 4.500 = 4,5%)
  minimum_requis      numeric(10, 2) not null,  -- ticket d'entrée €
  coupon_client       numeric(5, 3) not null,   -- coupon annuel % (ex: 11.000 = 11%/an)
  constatation        text check (constatation in ('MENSUELLE', 'TRIMESTRIELLE', 'ANNUELLE')),
  sri                 smallint check (sri between 1 and 7),
  enveloppe_restante  numeric(12, 2),           -- € restant à placer (peut être négatif si dépassement)
  fin_commerc         date,
  couleur_badge       text,
  notes               text,                     -- commentaires libres (admin)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_ucs_etat       on public.ucs_structures(etat);
create index idx_ucs_compagnie  on public.ucs_structures(compagnie);
create index idx_ucs_sri        on public.ucs_structures(sri);
create index idx_ucs_upfront    on public.ucs_structures(upfront desc);

-- Maintien automatique de updated_at sur tout UPDATE
create or replace function public.tg_ucs_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_ucs_updated_at
  before update on public.ucs_structures
  for each row execute function public.tg_ucs_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Table secondaire : simulations de commission
-- ─────────────────────────────────────────────────────────────────────────────

create table public.simulations_structures (
  id                     uuid primary key default gen_random_uuid(),
  ucs_id                 uuid not null references public.ucs_structures(id) on delete cascade,
  conseiller_id          uuid not null references public.profiles(id) on delete cascade,
  client_id              uuid references public.clients(id) on delete set null,
  montant                numeric(12, 2) not null check (montant > 0),
  commission_conseiller  numeric(10, 2) not null,
  commission_cabinet     numeric(10, 2) not null,
  created_at             timestamptz not null default now()
);

create index idx_simu_conseiller on public.simulations_structures(conseiller_id, created_at desc);
create index idx_simu_ucs        on public.simulations_structures(ucs_id, created_at desc);
create index idx_simu_client     on public.simulations_structures(client_id) where client_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS : ucs_structures
--   - Lecture : tout user authentifié
--   - Écriture (insert/update/delete) : profiles.role = 'manager'
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.ucs_structures enable row level security;

create policy "ucs_select_authenticated"
  on public.ucs_structures
  for select
  using (auth.role() = 'authenticated');

create policy "ucs_write_manager"
  on public.ucs_structures
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'manager'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'manager'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS : simulations_structures
--   - Lecture : chaque conseiller voit ses propres simulations ;
--              les managers voient toutes les simulations.
--   - Écriture (insert) : un conseiller authentifié peut créer SA simulation
--                        (conseiller_id = auth.uid()).
--   - Update/Delete : manager seulement (audit).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.simulations_structures enable row level security;

create policy "simu_select_own_or_manager"
  on public.simulations_structures
  for select
  using (
    conseiller_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'manager'
    )
  );

create policy "simu_insert_self"
  on public.simulations_structures
  for insert
  with check (conseiller_id = auth.uid());

create policy "simu_modify_manager"
  on public.simulations_structures
  for update
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'manager'
    )
  );

create policy "simu_delete_manager"
  on public.simulations_structures
  for delete
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'manager'
    )
  );
