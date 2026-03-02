# Entasis CRM — Vite + Supabase

Projet React/Vite prêt à déployer sur Vercel avec Supabase.

## 1. Variables d'environnement

Crée un fichier `.env` local ou ajoute dans Vercel :

```env
VITE_SUPABASE_URL=https://...supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

## 2. Lancer en local

```bash
npm install
npm run dev
```

## 3. Déployer sur Vercel

- pousse **tout** le dossier sur GitHub
- importe le repo dans Vercel
- ajoute les 2 variables d'environnement
- redeploie

## 4. Supabase

- colle `supabase/schema.sql` dans le SQL Editor
- dans `public.profiles`, mets ton utilisateur avec :
  - `role = manager`
  - `advisor_code = LOUIS`

## Structure

- `src/App.jsx` : application CRM
- `src/lib/supabase.js` : client Supabase
- `supabase/schema.sql` : schéma DB + RLS
- `archive/entasis-crm-premium.jsx` : ancienne maquette premium conservée pour référence
