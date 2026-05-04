-- ============================================================================
-- Active la publication Realtime Supabase sur la table deals.
-- Sans ça, le channel "deals-realtime" côté client ne reçoit rien (les
-- changements ne sont pas publiés).
--
-- À lancer une fois côté Supabase CRM SQL Editor.
-- ============================================================================

-- Vérifie si deals est déjà dans la publication, sinon l'ajoute.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'deals'
  ) then
    alter publication supabase_realtime add table public.deals;
  end if;
end
$$;

-- Vérification, doit afficher la table deals dans la publication.
-- select schemaname, tablename
-- from pg_publication_tables
-- where pubname = 'supabase_realtime'
-- order by tablename;
