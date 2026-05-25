-- UCS Produits Structurés (Louis 2026-05-25)
-- Catalogue des produits structurés du groupement + simulations de commission
-- + structureurs comme entités de premier rang (patch #3).
--
-- Adaptations vs brief :
--   - Rôle admin = 'manager' (vs 'admin'/'direction' inexistants dans ce CRM)
--   - Schéma aligné sur le CSV réel d'export groupement (25 colonnes vs 12
--     dans le brief initial)
--   - Table structureurs séparée avec FK depuis ucs_structures
--   - Compagnies restreintes à SWISSLIFE + ABEILLE (cabinet ne bosse qu'avec
--     ces 2 partenaires actuellement, confirmé Louis 2026-05-25)

-- ─────────────────────────────────────────────────────────────────────────────
-- Table : structureurs (partenaires commerciaux de premier rang)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.structureurs (
  id                      uuid primary key default gen_random_uuid(),
  nom                     text not null unique,
  contact_principal       text,
  email                   text,
  telephone               text,
  compagnies_travaillees  text[] check (
    compagnies_travaillees <@ array['SWISSLIFE', 'ABEILLE']::text[]
  ),
  upfront_moyen_negocie   numeric(5, 3),                    -- calculé : moyenne des upfronts UCS
  notes_negociation       text,
  date_dernier_contact    date,
  actif                   boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index idx_structureurs_actif      on public.structureurs(actif);
create index idx_structureurs_compagnies on public.structureurs using gin(compagnies_travaillees);

create or replace function public.tg_structureurs_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_structureurs_updated_at
  before update on public.structureurs
  for each row execute function public.tg_structureurs_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Table principale : catalogue UCS
-- Aligné sur le CSV réel (25 colonnes du groupement)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.ucs_structures (
  id                  uuid primary key default gen_random_uuid(),

  -- État + classement campagne
  etat                text not null check (etat in ('EN_COURS', 'CLOTURE', 'ANNULATION')),
  compagnie           text not null check (compagnie in ('SWISSLIFE', 'ABEILLE')),
  source              text,                                  -- ABEILLE_MENSUEL / GROUPEMENT_SWISSLIFE / etc.
  type_campagne       text,                                  -- CAMPAGNE_MENSUELLE / EXTERNE / MINI_CAMPAGNE

  -- Identité produit
  nom_ucs             text not null,
  code_isin           text unique not null,
  structureur_id      uuid references public.structureurs(id) on delete set null,
  banque_emettrice    text,                                  -- UBS, SG Issuer, etc.
  sous_jacent         text,                                  -- description du sous-jacent

  -- Financier
  upfront             numeric(5, 3),                         -- % perçu par Entasis (NULL si non négocié → alerte UI)
  minimum_requis      numeric(10, 2) not null,
  maximum_autorise    numeric(12, 2),
  coupon_periode      numeric(7, 4),                         -- coupon par période (ex: 0.834 mensuel)
  frequence_coupon    text check (frequence_coupon in ('MENSUELLE', 'TRIMESTRIELLE', 'SEMESTRIELLE', 'ANNUELLE', 'QUOTIDIENNE')),
  coupon_annualise    numeric(5, 3),                         -- coupon annuel effectif (info)

  -- Profil de risque + maturité
  constatation        text check (constatation in ('MENSUELLE', 'TRIMESTRIELLE', 'SEMESTRIELLE', 'ANNUELLE', 'QUOTIDIENNE')),
  sri                 smallint check (sri between 1 and 7),
  maturite_annees     smallint,
  capital_garanti     boolean not null default false,
  categorie_dda       numeric(3, 1),                         -- catégorie réglementaire (ex: 3.0)

  -- Commercialisation
  date_debut          date,
  fin_commerc         date,
  enveloppe_restante  numeric(12, 2),

  -- UI
  couleur_badge       text,                                  -- hex code pour bandeau visuel
  notes_internes      text,                                  -- notes Entasis (warning rentabilité, etc.)

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_ucs_etat        on public.ucs_structures(etat);
create index idx_ucs_compagnie   on public.ucs_structures(compagnie);
create index idx_ucs_structureur on public.ucs_structures(structureur_id);
create index idx_ucs_sri         on public.ucs_structures(sri);
create index idx_ucs_upfront     on public.ucs_structures(upfront desc nulls last);

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
-- RLS : structureurs
--   - Lecture : tout user authentifié (les conseillers voient le nom dans
--     le chip catalogue mais sans accès au détail via UI bloquée)
--   - Écriture : manager seulement
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.structureurs enable row level security;

create policy "structureurs_select_authenticated"
  on public.structureurs
  for select
  using (auth.role() = 'authenticated');

create policy "structureurs_write_manager"
  on public.structureurs
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
-- RLS : ucs_structures
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed initial des 10 structureurs identifiés dans l'export groupement.
-- Compagnies travaillées calculées à partir des UCS associées dans le CSV.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.structureurs (nom, compagnies_travaillees, actif) values
  ('Silex',                  array['ABEILLE']::text[],            true),
  ('Exclusive Partners',     array['ABEILLE','SWISSLIFE']::text[], true),
  ('Equitim',                array['ABEILLE','SWISSLIFE']::text[], true),
  ('Altitude IS',            array['ABEILLE']::text[],            true),
  ('i-Kapital',              array['ABEILLE','SWISSLIFE']::text[], true),
  ('C-First',                array['ABEILLE']::text[],            true),
  ('Société Générale',       array['ABEILLE']::text[],            true),
  ('Nexo',                   array['SWISSLIFE']::text[],          true),
  ('Irbis Finance',          array['SWISSLIFE']::text[],          true),
  ('Swisslife',              array['SWISSLIFE']::text[],          true);
