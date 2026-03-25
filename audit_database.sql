-- =============================================================================
-- AUDIT COMPLET - BASE DE DONNÉES ENTASIS CRM
-- Exécuter dans Supabase SQL Editor pour audit complet
-- =============================================================================

-- 📊 VUE D'ENSEMBLE DU SYSTÈME
-- =============================================================================

SELECT '=== INFORMATIONS GÉNÉRALES SYSTÈME ===' as section;

-- Informations base de données
SELECT
    'Version PostgreSQL' as metric,
    version() as value
UNION ALL
SELECT
    'Nombre total de tables',
    count(*)::text
FROM information_schema.tables
WHERE table_schema = 'public'
UNION ALL
SELECT
    'Nombre total d''extensions',
    count(*)::text
FROM pg_extension
UNION ALL
SELECT
    'Taille totale base données',
    pg_size_pretty(pg_database_size(current_database()))
UNION ALL
SELECT
    'Encoding base données',
    pg_encoding_to_char(encoding)
FROM pg_database
WHERE datname = current_database();

-- 👥 AUDIT UTILISATEURS ET AUTHENTIFICATION
-- =============================================================================

SELECT '=== AUDIT AUTHENTIFICATION ===' as section;

-- Statistiques utilisateurs
SELECT
    'Utilisateurs auth.users' as metric,
    count(*)::text as value
FROM auth.users
UNION ALL
SELECT
    'Profiles créés',
    count(*)::text
FROM public.profiles
UNION ALL
SELECT
    'Managers actifs',
    count(*)::text
FROM public.profiles
WHERE role = 'manager' AND is_active = true
UNION ALL
SELECT
    'Advisors actifs',
    count(*)::text
FROM public.profiles
WHERE role = 'advisor' AND is_active = true
UNION ALL
SELECT
    'Comptes inactifs',
    count(*)::text
FROM public.profiles
WHERE is_active = false;

-- Détail des utilisateurs
SELECT '=== DÉTAIL UTILISATEURS ===' as section;

SELECT
    p.full_name,
    p.email,
    p.role,
    p.advisor_code,
    p.is_active,
    p.created_at::date as date_creation,
    CASE
        WHEN au.email_confirmed_at IS NOT NULL THEN 'Confirmé'
        ELSE 'Non confirmé'
    END as statut_email
FROM public.profiles p
LEFT JOIN auth.users au ON p.id = au.id
ORDER BY p.created_at DESC;

-- 💼 AUDIT DEALS & BUSINESS
-- =============================================================================

SELECT '=== AUDIT DEALS & MÉTRIQUES BUSINESS ===' as section;

-- Statistiques générales deals
SELECT
    'Total deals' as metric,
    count(*)::text as value
FROM public.deals
UNION ALL
SELECT
    'Deals signés',
    count(*)::text
FROM public.deals
WHERE status = 'Signé'
UNION ALL
SELECT
    'Deals en cours',
    count(*)::text
FROM public.deals
WHERE status = 'En cours'
UNION ALL
SELECT
    'Deals prévus',
    count(*)::text
FROM public.deals
WHERE status = 'Prévu'
UNION ALL
SELECT
    'Deals annulés',
    count(*)::text
FROM public.deals
WHERE status = 'Annulé';

-- Métriques financières globales
SELECT '=== MÉTRIQUES FINANCIÈRES GLOBALES ===' as section;

SELECT
    'PP annualisé total (signés)' as metric,
    to_char(sum(pp_m * 12), 'FM999,999,999 €') as value
FROM public.deals
WHERE status = 'Signé'
UNION ALL
SELECT
    'PU total (signés)',
    to_char(sum(pu), 'FM999,999,999 €')
FROM public.deals
WHERE status = 'Signé'
UNION ALL
SELECT
    'PP potentiel pipeline',
    to_char(sum(pp_m * 12), 'FM999,999,999 €')
FROM public.deals
WHERE status IN ('En cours', 'Prévu')
UNION ALL
SELECT
    'PU potentiel pipeline',
    to_char(sum(pu), 'FM999,999,999 €')
FROM public.deals
WHERE status IN ('En cours', 'Prévu');

-- Performance par mois
SELECT '=== PERFORMANCE PAR MOIS ===' as section;

SELECT
    month,
    count(*) as nb_deals,
    count(*) FILTER (WHERE status = 'Signé') as nb_signes,
    round(
        100.0 * count(*) FILTER (WHERE status = 'Signé') /
        nullif(count(*), 0), 2
    ) as taux_signature_pct,
    to_char(sum(pp_m * 12) FILTER (WHERE status = 'Signé'), 'FM999,999 €') as pp_annuel_signe,
    to_char(sum(pu) FILTER (WHERE status = 'Signé'), 'FM999,999 €') as pu_signe
FROM public.deals
GROUP BY month
ORDER BY
    CASE month
        WHEN 'JANVIER' THEN 1 WHEN 'FÉVRIER' THEN 2 WHEN 'MARS' THEN 3
        WHEN 'AVRIL' THEN 4 WHEN 'MAI' THEN 5 WHEN 'JUIN' THEN 6
        WHEN 'JUILLET' THEN 7 WHEN 'AOÛT' THEN 8 WHEN 'SEPTEMBRE' THEN 9
        WHEN 'OCTOBRE' THEN 10 WHEN 'NOVEMBRE' THEN 11 WHEN 'DÉCEMBRE' THEN 12
    END;

-- Performance par conseiller
SELECT '=== PERFORMANCE PAR CONSEILLER ===' as section;

SELECT
    advisor_code,
    count(*) as nb_deals_total,
    count(*) FILTER (WHERE status = 'Signé') as nb_signes,
    count(*) FILTER (WHERE status IN ('En cours', 'Prévu')) as pipeline,
    round(
        100.0 * count(*) FILTER (WHERE status = 'Signé') /
        nullif(count(*), 0), 2
    ) as taux_signature_pct,
    to_char(sum(pp_m * 12) FILTER (WHERE status = 'Signé'), 'FM999,999 €') as pp_annuel,
    to_char(sum(pu) FILTER (WHERE status = 'Signé'), 'FM999,999 €') as pu_total,
    round(avg(pp_m * 12) FILTER (WHERE status = 'Signé'), 0) as pp_moyen_par_deal,
    round(avg(pu) FILTER (WHERE status = 'Signé'), 0) as pu_moyen_par_deal
FROM public.deals
WHERE advisor_code IS NOT NULL AND advisor_code != ''
GROUP BY advisor_code
ORDER BY count(*) FILTER (WHERE status = 'Signé') DESC;

-- Analyse par produit
SELECT '=== ANALYSE PAR PRODUIT ===' as section;

SELECT
    product,
    count(*) as nb_deals,
    count(*) FILTER (WHERE status = 'Signé') as nb_signes,
    round(avg(pp_m * 12) FILTER (WHERE status = 'Signé'), 0) as pp_moyen,
    round(avg(pu) FILTER (WHERE status = 'Signé'), 0) as pu_moyen,
    to_char(sum(pp_m * 12 + pu) FILTER (WHERE status = 'Signé'), 'FM999,999 €') as total_commissions
FROM public.deals
GROUP BY product
ORDER BY count(*) FILTER (WHERE status = 'Signé') DESC;

-- Analyse par source
SELECT '=== ANALYSE PAR SOURCE LEAD ===' as section;

SELECT
    coalesce(source, 'Non renseigné') as source,
    count(*) as nb_deals,
    count(*) FILTER (WHERE status = 'Signé') as nb_signes,
    round(
        100.0 * count(*) FILTER (WHERE status = 'Signé') /
        nullif(count(*), 0), 2
    ) as conversion_pct,
    to_char(sum(pp_m * 12 + pu) FILTER (WHERE status = 'Signé'), 'FM999,999 €') as revenus
FROM public.deals
GROUP BY source
ORDER BY count(*) DESC;

-- Analyse par compagnie
SELECT '=== ANALYSE PAR COMPAGNIE ===' as section;

SELECT
    coalesce(company, 'Non renseigné') as compagnie,
    count(*) as nb_deals,
    count(*) FILTER (WHERE status = 'Signé') as nb_signes,
    to_char(sum(pp_m * 12 + pu) FILTER (WHERE status = 'Signé'), 'FM999,999 €') as revenus_totaux
FROM public.deals
GROUP BY company
ORDER BY count(*) FILTER (WHERE status = 'Signé') DESC;

-- Âge des deals en cours
SELECT '=== ÂGE DES DEALS EN PIPELINE ===' as section;

SELECT
    d.id,
    d.client,
    d.product,
    d.advisor_code,
    d.status,
    d.priority,
    d.created_at::date as date_creation,
    EXTRACT(days FROM now() - d.created_at)::integer as age_jours,
    CASE
        WHEN EXTRACT(days FROM now() - d.created_at) > 60 THEN '🔴 Critique'
        WHEN EXTRACT(days FROM now() - d.created_at) > 30 THEN '🟡 Attention'
        ELSE '🟢 OK'
    END as alerte_age
FROM public.deals d
WHERE status IN ('En cours', 'Prévu')
ORDER BY d.created_at ASC;

-- 📋 AUDIT OBJECTIFS
-- =============================================================================

SELECT '=== AUDIT OBJECTIFS ===' as section;

-- Objectifs configurés
SELECT
    o.month,
    to_char(o.pp_target, 'FM999,999 €') as objectif_pp,
    to_char(o.pu_target, 'FM999,999 €') as objectif_pu,
    to_char(sum(d.pp_m * 12) FILTER (WHERE d.status = 'Signé'), 'FM999,999 €') as realise_pp,
    to_char(sum(d.pu) FILTER (WHERE d.status = 'Signé'), 'FM999,999 €') as realise_pu,
    CASE
        WHEN o.pp_target > 0 THEN
            round(100.0 * coalesce(sum(d.pp_m * 12) FILTER (WHERE d.status = 'Signé'), 0) / o.pp_target, 1)
        ELSE NULL
    END as atteinte_pp_pct,
    CASE
        WHEN o.pu_target > 0 THEN
            round(100.0 * coalesce(sum(d.pu) FILTER (WHERE d.status = 'Signé'), 0) / o.pu_target, 1)
        ELSE NULL
    END as atteinte_pu_pct
FROM public.objectifs o
LEFT JOIN public.deals d ON d.month = o.month
GROUP BY o.month, o.pp_target, o.pu_target
ORDER BY
    CASE o.month
        WHEN 'JANVIER' THEN 1 WHEN 'FÉVRIER' THEN 2 WHEN 'MARS' THEN 3
        WHEN 'AVRIL' THEN 4 WHEN 'MAI' THEN 5 WHEN 'JUIN' THEN 6
        WHEN 'JUILLET' THEN 7 WHEN 'AOÛT' THEN 8 WHEN 'SEPTEMBRE' THEN 9
        WHEN 'OCTOBRE' THEN 10 WHEN 'NOVEMBRE' THEN 11 WHEN 'DÉCEMBRE' THEN 12
    END;

-- 🏢 AUDIT MODULE IMMOBILIER
-- =============================================================================

SELECT '=== AUDIT MODULE IMMOBILIER ===' as section;

-- Vérifier si les tables immobilier existent
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'promoteurs')
        THEN 'Table promoteurs : ✅ Existe'
        ELSE 'Table promoteurs : ❌ Manquante'
    END as statut_promoteurs
UNION ALL
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'programmes')
        THEN 'Table programmes : ✅ Existe'
        ELSE 'Table programmes : ❌ Manquante'
    END
UNION ALL
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dossiers_immo')
        THEN 'Table dossiers_immo : ✅ Existe'
        ELSE 'Table dossiers_immo : ❌ Manquante'
    END;

-- Si les tables existent, analyser le contenu
DO $$
BEGIN
    -- Audit promoteurs si la table existe
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'promoteurs') THEN
        RAISE NOTICE 'PROMOTEURS CONFIGURÉS :';
        -- Cette partie nécessiterait une requête dynamique
    END IF;
END $$;

-- 📊 AUDIT ACTIVITÉS
-- =============================================================================

SELECT '=== AUDIT ACTIVITÉS UTILISATEUR ===' as section;

-- Statistiques activités
SELECT
    'Total activités' as metric,
    count(*)::text as value
FROM public.activities
UNION ALL
SELECT
    'Dernière activité',
    max(created_at)::date::text
FROM public.activities
UNION ALL
SELECT
    'Utilisateurs actifs (7j)',
    count(DISTINCT user_id)::text
FROM public.activities
WHERE created_at >= now() - interval '7 days';

-- Top actions par type
SELECT '=== TOP ACTIONS UTILISATEUR ===' as section;

SELECT
    action_type,
    count(*) as nb_occurrences,
    count(DISTINCT user_id) as nb_users_distincts,
    max(created_at)::date as derniere_occurrence
FROM public.activities
GROUP BY action_type
ORDER BY count(*) DESC
LIMIT 10;

-- 🔍 AUDIT TECHNIQUE
-- =============================================================================

SELECT '=== AUDIT TECHNIQUE TABLES ===' as section;

-- Taille des tables
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as taille,
    pg_total_relation_size(schemaname||'.'||tablename) as taille_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Index et contraintes
SELECT '=== AUDIT INDEX ET CONTRAINTES ===' as section;

SELECT
    t.table_name,
    count(tc.constraint_name) as nb_contraintes,
    string_agg(tc.constraint_type, ', ') as types_contraintes
FROM information_schema.tables t
LEFT JOIN information_schema.table_constraints tc
    ON t.table_name = tc.table_name
    AND t.table_schema = tc.table_schema
WHERE t.table_schema = 'public'
GROUP BY t.table_name
ORDER BY t.table_name;

-- 🛡️ AUDIT SÉCURITÉ RLS
-- =============================================================================

SELECT '=== AUDIT ROW LEVEL SECURITY ===' as section;

-- Status RLS par table
SELECT
    schemaname,
    tablename,
    rowsecurity as rls_active,
    CASE
        WHEN rowsecurity THEN '✅ RLS activé'
        ELSE '⚠️ RLS désactivé'
    END as statut_securite
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Politiques RLS
SELECT '=== POLITIQUES RLS CONFIGURÉES ===' as section;

SELECT
    pol.schemaname,
    pol.tablename,
    pol.policyname,
    pol.cmd as commande,
    pol.roles,
    CASE
        WHEN pol.qual IS NOT NULL THEN 'USING clause définie'
        ELSE 'Pas de USING clause'
    END as condition_using,
    CASE
        WHEN pol.with_check IS NOT NULL THEN 'WITH CHECK définie'
        ELSE 'Pas de WITH CHECK'
    END as condition_check
FROM pg_policies pol
WHERE pol.schemaname = 'public'
ORDER BY pol.tablename, pol.policyname;

-- 📈 RÉSUMÉ EXÉCUTIF
-- =============================================================================

SELECT '=== RÉSUMÉ EXÉCUTIF ===' as section;

WITH stats AS (
    SELECT
        count(*) as total_deals,
        count(*) FILTER (WHERE status = 'Signé') as deals_signes,
        sum(pp_m * 12 + pu) FILTER (WHERE status = 'Signé') as ca_realise,
        sum(pp_m * 12 + pu) FILTER (WHERE status IN ('En cours', 'Prévu')) as ca_potentiel,
        count(DISTINCT advisor_code) as nb_advisors_actifs
    FROM public.deals
    WHERE advisor_code IS NOT NULL AND advisor_code != ''
)
SELECT
    '💼 Deals totaux : ' || total_deals as synthese
FROM stats
UNION ALL
SELECT
    '✅ Deals signés : ' || deals_signes || ' (' ||
    round(100.0 * deals_signes / nullif(total_deals, 0), 1) || '%)'
FROM stats
UNION ALL
SELECT
    '💰 CA réalisé : ' || to_char(ca_realise, 'FM999,999,999 €')
FROM stats
UNION ALL
SELECT
    '🎯 CA potentiel : ' || to_char(ca_potentiel, 'FM999,999,999 €')
FROM stats
UNION ALL
SELECT
    '👥 Conseillers actifs : ' || nb_advisors_actifs
FROM stats;

SELECT '=== FIN AUDIT ===' as section;