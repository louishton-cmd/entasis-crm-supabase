# Entasis CRM - Documentation Architecture Détaillée

## Vue d'ensemble du projet

**Entasis CRM** est un système de gestion de relation client sur mesure développé pour un cabinet de gestion de patrimoine parisien. Il s'agit d'une application web moderne construite avec une architecture frontend React monolithique et un backend Supabase.

### Technologies principales
- **Frontend**: React 18.3.1 + Vite 5.4.11 (SPA monolithique)
- **Backend**: Supabase (PostgreSQL + Auth + RLS + Edge Functions)
- **Déploiement**: Vercel (frontend + API routes) + Supabase (backend)
- **UI/UX**: Design system custom avec tokens CSS (gold #C09B5A + dark mode)
- **APIs externes**: Yahoo Finance, Morningstar, Anthropic Claude API

### Dépendances clés
```json
{
  "@supabase/supabase-js": "^2.56.0",    // Client Supabase
  "@dnd-kit/*": "^6.3.1",               // Drag & drop Kanban
  "chart.js": "^4.5.1",                 // Graphiques financiers
  "react-chartjs-2": "^5.3.1",          // Wrapper React pour Chart.js
  "html2canvas": "^1.4.1",              // Export PDF
  "jspdf": "^4.2.1",                    // Génération PDF
  "react-hot-toast": "^2.6.0"           // Notifications
}
```

## Architecture générale

### Stack technique complet
```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Vercel)                       │
│  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐ │
│  │   React SPA     │ │  API Routes     │ │    Static    │ │
│  │   (App.jsx)     │ │   /api/*        │ │   Assets     │ │
│  │  58k+ tokens    │ │  Serverless     │ │   Vite       │ │
│  └─────────────────┘ └─────────────────┘ └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   BACKEND (Supabase)                       │
│  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────┐ │
│  │  PostgreSQL     │ │  Auth + RLS     │ │ Edge Funcs   │ │
│  │  4 tables core  │ │  JWT sessions   │ │   (Deno)     │ │
│  │  + immobilier   │ │  Role-based     │ │ sync-progs   │ │
│  └─────────────────┘ └─────────────────┘ └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Structure du projet détaillée

```
entasis-crm-supabase/
├── src/                              # Frontend React (Single Page App)
│   ├── main.jsx                     # Point d'entrée React (ReactDOM.render)
│   ├── App.jsx                      # 🏠 COMPOSANT PRINCIPAL MONOLITHE (58,947 tokens)
│   ├── lib/
│   │   └── supabase.js              # Configuration client Supabase
│   ├── components/                   # Modules métier (tous chargés depuis App.jsx)
│   │   ├── VueImmobilier.jsx       # 🏢 Module immobilier (onglet nav)
│   │   ├── CatalogueProgrammes.jsx  # 📋 Catalogue programmes neuf
│   │   ├── MesDossiersImmo.jsx     # 📁 Dossiers clients immobilier
│   │   ├── PipelineVEFA.jsx        # 🔄 Pipeline Kanban VEFA
│   │   ├── OutilsCGP.jsx           # 🧮 Calculateurs financiers
│   │   └── LinkedInPro.jsx         # 📱 Générateur posts LinkedIn
│   ├── config/
│   │   └── promptImmo.js           # 🤖 Prompts système IA immobilier
│   └── styles.css                   # Styles globaux (design system)
├── api/                             # API Routes Vercel (Serverless Functions)
│   ├── nav.js                      # 📈 API NAV - Valeurs liquidatives
│   ├── generate-linkedin.js        # 🤖 Générateur LinkedIn (Claude API)
│   └── generate-note.js            # 📝 Générateur notes (Claude API)
├── supabase/                        # Configuration Backend
│   ├── schema.sql                  # 🗄️ Schéma DB + RLS + triggers
│   ├── migration_immobilier.sql    # 🏗️ Tables module immobilier
│   └── functions/                  # Edge Functions (Deno Runtime)
│       └── sync-programmes/        # 🔄 Sync auto programmes GreenCity
│           └── index.ts
├── archive/
│   └── entasis-crm-premium.jsx    # Code legacy conservé
├── package.json                    # Config projet + dépendances
├── vite.config.js                 # Configuration Vite (build/dev)
├── index.html                     # Point d'entrée HTML
└── claude.md                      # 📖 Cette documentation
```

## Frontend - Architecture UI/UX Détaillée

### 🏠 App.jsx - Composant racine monolithique (58,947 tokens)
**Rôle** : Contient TOUTE l'application dans un seul fichier
**Structure** :
```javascript
// 🔧 CONSTANTS & UTILS (lignes 1-100)
const MONTHS = ['JANVIER', 'FÉVRIER'...]
const STATUS_OPTIONS = ['Signé', 'En cours', 'Prévu', 'Annulé']
const PRODUCTS = ['PER Individuel', 'Assurance Vie'...]

// 🎨 UI COMPONENTS INLINE (lignes 100-1500+)
function AuthScreen()              // Écran connexion Google
function ConfigMissing()           // Erreur config Supabase
function Sidebar()                 // Navigation latérale
function TopBar()                  // Barre supérieure
function AgeBadge()                // Indicateur âge deal
function StalePipelineAlert()      // Alertes deals anciens

// 📊 DASHBOARD COMPONENTS (lignes 1500+)
function ManagerDashboard()        // Vue manager (tous deals)
function AdvisorDashboard()        // Vue conseiller (mes deals)
function PipelineBoard()           // Pipeline Kanban
function DealsTable()              // Table des deals
function ForecastView()            // Prévisions mensuelles
function LeadRoom()                // Gestion des leads
function AgendaView()              // Calendrier deals
function MarketView()              // Vue marché

// 🏠 MAIN APP COMPONENT (lignes finales)
export default function App()     // Composant principal avec état global
```

**État global managé** :
- `session` : Session Supabase Auth
- `profile` : Profil utilisateur connecté
- `teamProfiles` : Équipe (pour managers)
- `deals` : Tous les deals chargés
- `leads` : Leads en attente
- `activeTab` : Onglet navigation actif
- `month` : Mois sélectionné pour filtrage

### 🎯 Navigation principale (activeTab)
L'application utilise un système d'onglets avec `activeTab` state :

```javascript
const [activeTab, setActiveTab] = useState('dashboard')

// 📍 ROUTES INTERNES (pas de React Router)
'dashboard'   → ManagerDashboard | AdvisorDashboard
'leads'       → LeadRoom
'pipeline'    → PipelineBoard
'dossiers'    → DealsTable
'forecast'    → ForecastView
'agenda'      → AgendaView
'market'      → MarketView
'immobilier'  → VueImmobilier (module externe)
'cgp-tools'   → OutilsCGP (module externe)
'linkedin'    → LinkedInPro (module externe)
```

### 📱 Composants externes détaillés

#### 🏢 VueImmobilier.jsx
**Fichier** : `src/components/VueImmobilier.jsx`
**Rôle UI/UX** : Module complet immobilier neuf avec sous-navigation
**Fonctionnalités** :
- Catalogue programmes (avec sync GreenCity)
- Gestion dossiers clients immobilier
- Pipeline VEFA avec Kanban drag & drop
- Intégration IA pour conseils immobilier
**Sub-components intégrés** :
- `CatalogueProgrammes` - Recherche et filtrage programmes
- `MesDossiersImmo` - CRUD dossiers clients
- `PipelineVEFA` - Kanban 7 colonnes (Prospect → Honoraires)

#### 📋 CatalogueProgrammes.jsx
**Fichier** : `src/components/CatalogueProgrammes.jsx`
**Rôle UI/UX** : Catalogue programmes immobilier neuf avec recherche/filtres
**Fonctionnalités** :
- Liste programmes avec cartes visuelles (image, prix, statut)
- Filtres : région, dispositif fiscal (LLI/LMNP/PTZ), typologie
- Recherche textuelle (nom programme, ville)
- Sync automatique via Edge Function GreenCity
- Assistant IA intégré (prompt immobilier spécialisé)
- Codes couleur par promoteur (GreenCity, Nexity, LP Promotion)

#### 📁 MesDossiersImmo.jsx
**Fichier** : `src/components/MesDossiersImmo.jsx`
**Rôle UI/UX** : Gestion des dossiers clients immobilier
**Fonctionnalités** :
- CRUD dossiers avec modal d'édition
- Filtres par statut pipeline (tous/en_cours/signés/livrés)
- Liaison programme ↔ client
- Champs métier : budget, apport, dispositif retenu
- Scoping par conseiller (RLS appliqué)
- Assistant IA pour qualification client

#### 🔄 PipelineVEFA.jsx
**Fichier** : `src/components/PipelineVEFA.jsx`
**Rôle UI/UX** : Pipeline Kanban pour dossiers immobilier VEFA
**Fonctionnalités** :
- Interface Kanban drag & drop (@dnd-kit)
- 7 colonnes workflow : Prospect → Présenté → Réservation → Financement → Acte → Livraison → Honoraires
- Cartes dossiers avec infos synthétiques (client, prix, conseiller)
- Filtre par conseiller (vue manager vs advisor)
- Mise à jour statut en temps réel via drag & drop

#### 🧮 OutilsCGP.jsx
**Fichier** : `src/components/OutilsCGP.jsx`
**Rôle UI/UX** : Suite d'outils financiers pour CGP
**Fonctionnalités** :
- **Calculateur fiscal** : Barème IR 2025, TMI, optimisation
- **Simulateur épargne** : Projections avec graphiques (Chart.js)
- **Comparateur produits** : AV, PER, SCPI avec métriques
- **Export PDF** : Rapports clients (html2canvas + jsPDF)
- **Assistant IA** : Conseils personnalisés via Claude API
- Design system sombre premium (tokens CSS)

#### 📱 LinkedInPro.jsx
**Fichier** : `src/components/LinkedInPro.jsx`
**Rôle UI/UX** : Générateur de contenu LinkedIn pour CGP
**Fonctionnalités** :
- Sélection thème (marchés, patrimoine, immobilier, fiscalité)
- Choix ton (expert, pédagogique, engageant)
- Champ contexte libre pour personnalisation
- Génération via API Anthropic Claude (prompt système AMF-compliant)
- Prévisualisation avec compteur caractères (limite 1300)
- Interface pill-select moderne

### 🎨 Design System
**Fichier** : `src/styles.css`
**Architecture** : CSS Custom Properties (variables CSS)
```css
:root {
  /* Couleurs principales */
  --gold: #C09B5A;           /* Or signature Entasis */
  --bg: #F4F1EB;            /* Background clair */
  --card: #FFFFFF;          /* Cartes blanches */
  --sb-bg: #141618;         /* Sidebar sombre */

  /* Statuts métier */
  --signed: #1B6B46;        /* Vert deals signés */
  --progress: #7A5520;      /* Orange en cours */
  --forecast: #2A5285;      /* Bleu prévu */
  --cancelled: #7A2A26;     /* Rouge annulé */
}
```
**Thème** : Premium avec palette dorée, typographie mixte serif/sans-serif

## API Routes Vercel - Détail technique

### 📈 /api/nav.js - API Valeurs Liquidatives
**Rôle** : Récupération données financières fonds/SCPI
**Endpoints externes** :
- **Yahoo Finance** : `https://query2.finance.yahoo.com/v8/finance/chart/{symbol}`
- **Morningstar** : `https://lt.morningstar.com/api/rest.svc/timeseries_price/`
**Paramètres** :
- `isin` (required) : Code ISIN du fonds
- `ticker` (optional) : Symbol Yahoo si connu
- `msId` (optional) : ID Morningstar si spécialisé
**Logique** :
1. Si `msId` fourni → API Morningstar (fonds LU)
2. Sinon recherche ISIN → Yahoo Finance
3. Fallback automatique entre sources
4. Calcul performances 1W/1M/3M/1Y
**Réponse** :
```json
{
  "isin": "FR0123456789",
  "symbol": "0P0001234567",
  "vl": 123.45,
  "change": -0.15,
  "date": "23/03/2026",
  "perf1W": 0.8,
  "perf1M": -2.1,
  "perf3M": 5.2,
  "perf1Y": 12.3
}
```

### 🤖 /api/generate-linkedin.js - Générateur LinkedIn
**Rôle** : Génération posts LinkedIn conformes AMF pour CGP
**API externe** : Anthropic Claude API (claude-sonnet-4-20250514)
**Paramètres** :
- `theme` : 'marche'|'patrimoine'|'immobilier'|'fiscalite'
- `ton` : 'expert'|'pedagogique'|'engageant'
- `contexte` : Texte libre pour personnalisation
**Prompt système** : Spécialisé CGP avec règles AMF strictes
```javascript
const systemPrompt = `Tu es un CGP senior chez Entasis Conseil...
RÈGLES STRICTES :
- Maximum 1 300 caractères
- JAMAIS de promesse de rendement garanti
- Conformité AMF : "Les performances passées ne préjugent pas..."
- Structure : accroche + développement + CTA + hashtags`
```

### 📝 /api/generate-note.js - Générateur Notes
**Rôle** : Assistant IA générique pour notes clients
**API externe** : Anthropic Claude API
**Paramètres** :
- `systemPrompt` : Contexte métier (optionnel)
- `userMessage` : Demande utilisateur
**Usage** : Utilisé par OutilsCGP et modules immobilier pour conseils IA

## Backend Supabase - Architecture Données

### 🗄️ Tables principales détaillées

#### `profiles` - Gestion utilisateurs
```sql
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE,
  full_name text,
  role text NOT NULL DEFAULT 'advisor' CHECK (role IN ('manager', 'advisor')),
  advisor_code text UNIQUE,           -- Code conseiller (ex: 'LOUIS')
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```
**Rôles métier** :
- `manager` : Accès tous deals, peut modifier objectifs équipe
- `advisor` : Accès deals où advisor_code/co_advisor_code correspond

#### `deals` - Cœur métier CRM
```sql
CREATE TABLE deals (
  id text PRIMARY KEY,                 -- UUID généré côté client
  month text NOT NULL,                -- Mois de réalisation prévu
  client text NOT NULL,               -- Nom client
  product text NOT NULL,              -- Produit (PER, AV, SCPI...)
  pp_m numeric(14,2) DEFAULT 0,       -- Prime Ponctuelle Mensuelle €
  pu numeric(14,2) DEFAULT 0,         -- Prime Unique €
  advisor_code text NOT NULL,         -- Conseiller principal
  co_advisor_code text,               -- Co-conseiller (optionnel)
  source text,                        -- Canal acquisition
  status text DEFAULT 'En cours',     -- 'Signé'|'En cours'|'Prévu'|'Annulé'
  company text,                       -- Compagnie d'assurance
  notes text,                         -- Notes libres
  priority text DEFAULT 'Normale',    -- 'Normale'|'Haute'|'Urgente'
  tags jsonb DEFAULT '[]'::jsonb,     -- Tags flexibles
  date_expected text,                 -- Date signature prévue
  date_signed text,                   -- Date signature effective
  client_phone text,                  -- Contact client
  client_email text,
  client_age integer,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

#### `objectifs` - Objectifs mensuels équipe
```sql
CREATE TABLE objectifs (
  month text PRIMARY KEY,             -- 'JANVIER', 'FÉVRIER'...
  pp_target numeric(14,2) DEFAULT 0,  -- Objectif Prime Ponctuelle €
  pu_target numeric(14,2) DEFAULT 0,  -- Objectif Prime Unique €
  updated_at timestamptz DEFAULT now()
);
```

#### `activities` - Audit trail
```sql
CREATE TABLE activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id text REFERENCES deals(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text NOT NULL,          -- 'create'|'update'|'delete'|'convert_lead'
  payload jsonb DEFAULT '{}'::jsonb,  -- Détails action
  created_at timestamptz DEFAULT now()
);
```

### 🏗️ Tables module immobilier

#### `promoteurs` - Partenaires promoteurs
```sql
CREATE TABLE promoteurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,                  -- 'GreenCity Immobilier'
  slug text UNIQUE NOT NULL,          -- 'greencity' (pour mapping)
  couleur text DEFAULT '#22c55e',     -- Couleur UI
  url_site text,                      -- Site web promoteur
  url_espace_partenaires text,        -- Espace partenaire CGP
  contact_nom text,                   -- Contact commercial
  contact_email text,
  created_at timestamptz DEFAULT now()
);
```

#### `programmes` - Programmes immobilier neuf
```sql
CREATE TABLE programmes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promoteur_id uuid REFERENCES promoteurs(id),
  promoteur_slug text,                -- 'greencity'|'nexity'|'lp-promotion'
  nom text NOT NULL,                  -- 'Les Jardins de Meudon'
  ville text,                         -- 'Meudon'
  code_postal text,                   -- '92190'
  region text DEFAULT 'ile-de-france',
  statut text DEFAULT 'disponible',   -- 'nouveau'|'disponible'|'dernieres_opportunites'|'travaux'|'livre'
  typologies text[],                  -- ['T2','T3','T4']
  dispositifs text[],                 -- ['LLI','LMNP','PTZ']
  prix_a_partir_de integer,           -- Prix minimum €
  date_livraison text,                -- 'Q2 2026'
  image_url text,                     -- URL image programme
  url_fiche text,                     -- URL fiche détaillée
  nb_lots_total integer,              -- Nombre total de lots
  nb_lots_dispo integer,              -- Lots disponibles
  dpe text,                           -- Classe DPE
  last_synced_at timestamptz,         -- Dernière sync auto
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

#### `dossiers_immo` - Dossiers clients immobilier
```sql
CREATE TABLE dossiers_immo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid,                     -- Référence client (peut être NULL)
  programme_id uuid REFERENCES programmes(id),
  conseiller_id uuid REFERENCES profiles(id),
  client_nom text,
  client_email text,
  client_telephone text,
  dispositif_retenu text,             -- 'LLI'|'LMNP'|'PTZ'|'Bailleur Privé'|'RP'
  objectif text,                      -- 'investissement'|'residence_principale'
  budget_total numeric(12,2),
  apport numeric(12,2),
  prix_lot numeric(12,2),
  surface_lot numeric(6,2),
  notes text,
  statut_pipeline text DEFAULT 'prospect', -- Pipeline VEFA 7 étapes
  date_reservation date,
  date_acte date,
  honoraires_prevus numeric(10,2),
  honoraires_factures numeric(10,2),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### 🔐 Sécurité Row Level Security (RLS)

**Principe** : Chaque table a des politiques RLS pour isoler les données par utilisateur/rôle

#### Fonctions helper
```sql
-- Vérifie si l'utilisateur est manager
CREATE FUNCTION is_manager() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'manager' AND is_active = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Retourne le code conseiller de l'utilisateur connecté
CREATE FUNCTION current_advisor_code() RETURNS text AS $$
  SELECT advisor_code FROM profiles
  WHERE id = auth.uid() AND is_active = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

#### Politiques appliquées
```sql
-- DEALS : Manager voit tout, Advisor voit ses deals uniquement
CREATE POLICY "deals_select_scope" ON deals FOR SELECT TO authenticated USING (
  is_manager()
  OR advisor_code = current_advisor_code()
  OR co_advisor_code = current_advisor_code()
);

-- PROFILES : Self ou manager
CREATE POLICY "profiles_select_self_or_manager" ON profiles FOR SELECT TO authenticated USING (
  id = auth.uid() OR is_manager()
);

-- DOSSIERS_IMMO : Même logique que deals
CREATE POLICY "dossiers_immo_scope" ON dossiers_immo FOR SELECT TO authenticated USING (
  is_manager() OR conseiller_id = auth.uid()
);
```

### ⚡ Edge Functions (Deno)

#### 🔄 sync-programmes
**Fichier** : `supabase/functions/sync-programmes/index.ts`
**Rôle** : Synchronisation automatique programmes GreenCity Immobilier
**Runtime** : Deno (pas Node.js)
**Logique** :
1. Fetch HTML `https://www.greencityimmobilier.fr/programmes/region/ile-de-france.html`
2. Parse avec RegEx pour extraire programmes
3. Mapping statuts (`nouveau_programme` → `nouveau`)
4. Extraction typologies (`Du T2 au T4` → `['T2','T3','T4']`)
5. Upsert en base avec `on_conflict: url_fiche`
**Déclenchement** : Manuel via bouton UI ou cron (à configurer)

## Configuration et déploiement

### Variables d'environnement par environnement

#### Frontend (.env local + Vercel)
```bash
# Supabase connection
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

# Variables Vite (préfixe VITE_ obligatoire pour exposition)
```

#### API Routes Vercel
```bash
# IA Generation
ANTHROPIC_API_KEY=sk-ant-xxx

# Pas besoin d'autres variables (NAV API publique)
```

#### Supabase Functions
```bash
# Service role pour bypass RLS
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...

# Auto-injectées par Supabase
SUPABASE_URL=https://xxx.supabase.co
```

### Setup complet base de données
```sql
-- 1. Schéma principal + RLS + triggers
\i supabase/schema.sql

-- 2. Tables immobilier
\i supabase/migration_immobilier.sql

-- 3. Données de base
INSERT INTO profiles (id, email, full_name, role, advisor_code)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'louis@entasis.fr'),
  'louis@entasis.fr',
  'Louis Manager',
  'manager',
  'LOUIS'
);

INSERT INTO promoteurs (nom, slug, couleur) VALUES
('GreenCity Immobilier', 'greencity', '#16a34a'),
('Nexity', 'nexity', '#2563eb'),
('LP Promotion', 'lp-promotion', '#ea580c');

-- 4. Vérification RLS
SELECT * FROM deals; -- Doit filtrer selon le rôle connecté
```

## Métriques métier CGP

### Logique de calcul
```javascript
// Prime Ponctuelle → Annualisée pour comparaison
const annualize = (pp_mensuelle) => pp_mensuelle * 12

// Métriques conseiller pour un mois
function advisorMetrics(deals, month, advisor_code) {
  const scoped = deals.filter(d =>
    d.month === month &&
    (d.advisor_code === advisor_code || d.co_advisor_code === advisor_code)
  )

  const signed = scoped.filter(d => d.status === 'Signé')
  const pipeline = scoped.filter(d => d.status === 'En cours' || d.status === 'Prévu')

  return {
    total: scoped.length,
    signedCount: signed.length,
    pipelineCount: pipeline.length,
    ppSigned: sumAnnualPp(signed),      // PP annualisé signé
    puSigned: sumPu(signed),            // PU signé
    ppPipeline: sumAnnualPp(pipeline),  // PP potentiel
    puPipeline: sumPu(pipeline),        // PU potentiel
    signRate: Math.round((signed.length / scoped.length) * 100), // % signature
    avgPp: signed.length > 0 ? ppSigned / signed.length : 0      // PP moyen par deal
  }
}

// Âge des deals avec alertes
function dealAge(deal) {
  return Math.floor((Date.now() - new Date(deal.created_at)) / (1000*60*60*24))
}

function ageSeverity(days, status) {
  if (!isPipeline(status) || days === null) return 'ok'
  if (days > 60) return 'critical'  // 🔴 Deal très ancien
  if (days > 30) return 'warn'      // 🟡 Deal ancien
  return 'ok'                       // 🟢 Deal récent
}
```

### Workflow commercial type
```
📞 LEAD (source: téléprospection/Facebook/parrainage)
     ↓
🎯 PROSPECT (qualification: budget/besoin/timing)
     ↓
💼 EN COURS (négociation active, devis envoyé)
     ↓
📋 PRÉVU (accord verbal, signature prévue)
     ↓
✅ SIGNÉ (contrat signé, commission acquise)

❌ ANNULÉ (à tout moment avec raison)
```

### Pipeline immobilier VEFA spécialisé
```
👤 PROSPECT (contact initial client)
     ↓
📋 PRÉSENTÉ (programme proposé au client)
     ↓
📝 RÉSERVATION (compromis de réservation signé)
     ↓
🏦 FINANCEMENT (dossier bancaire en cours)
     ↓
⚖️ ACTE (signature acte authentique notaire)
     ↓
🏠 LIVRAISON (réception appartement par client)
     ↓
💰 HONORAIRES (facturation et encaissement commission)
```

## Points d'attention architecture

### ⚠️ Limitations techniques actuelles
1. **App.jsx monolithique** (58k+ tokens) - Refactoring nécessaire
2. **Pas de lazy loading** - Tous composants chargés au démarrage
3. **État global non optimisé** - Re-renders multiples possibles
4. **Pas de cache côté client** - Rechargement complet à chaque navigation

### 🔄 Optimisations recommandées
1. **Découpage App.jsx** en modules séparés avec React.lazy()
2. **Context API** pour état global plutôt que props drilling
3. **React Query** pour cache API et invalidation intelligente
4. **React.memo()** sur composants lourds (dashboards, tables)

### 🛡️ Sécurité
- **RLS correctement configuré** par rôle et advisor_code ✅
- **API keys rotées** régulièrement (Anthropic, quotas surveillés) ⚠️
- **Logs sensibles évités** (pas de montants/PII en console) ✅
- **HTTPS enforced** partout (Vercel + Supabase) ✅

### 📈 Évolutivité
- **DB bien normalisée** et extensible ✅
- **APIs externes avec fallbacks** (Yahoo ↔ Morningstar) ✅
- **Edge Functions** scalables (Deno runtime moderne) ✅
- **Design system cohérent** maintenable ✅

### Fonctionnalités métier
1. **Gestion des deals** - Suivi des affaires client avec primes ponctuelles et uniques
2. **Pipeline commercial** - Visualisation du pipeline de vente
3. **Objectifs mensuels** - Définition et suivi des objectifs PP/PU
4. **Immobilier neuf** - Catalogue et gestion des programmes immobiliers
5. **Outils CGP** - Calculateurs financiers et générateurs de contenu

### Constants et utilitaires
```javascript
// Constantes métier
MONTHS = ['JANVIER','FÉVRIER'...] // 12 mois
STATUS_OPTIONS = ['Signé','En cours','Prévu','Annulé']
PRIORITY_OPTIONS = ['Normale','Haute','Urgente']
PRODUCTS = ['PER Individuel','Assurance Vie Française','SCPI'...]
COMPANIES = ['SwissLife','Abeille Assurances','Generali'...]
SOURCES = ['Téléprospection','Leads Facebook','Parrainage Client'...]

// Fonctions utilitaires
euro() - Formatage monétaire français
annualize() - Calcul annualisé des primes ponctuelles mensuelles
dealAge() - Calcul de l'âge d'un deal
advisorMetrics() - Métriques par conseiller
```

### Authentification et rôles
- **Manager** : Accès complet à tous les deals et données
- **Advisor** : Accès limité aux deals où `advisor_code` ou `co_advisor_code` correspond

## Backend (Supabase)

### Base de données PostgreSQL

#### Tables principales

**profiles**
```sql
id (uuid, FK auth.users)
email, full_name
role ('manager' | 'advisor')
advisor_code (unique)
is_active (boolean)
```

**deals** - Cœur métier du CRM
```sql
id (text), month, client, product
pp_m (numeric) - Prime ponctuelle mensuelle
pu (numeric) - Prime unique
advisor_code, co_advisor_code
source, status, company, notes, priority
tags (jsonb), dates, client_info
created_by, timestamps
```

**objectifs** - Objectifs mensuels équipe
```sql
month (PK)
pp_target, pu_target (numeric)
```

**activities** - Log des actions utilisateur
```sql
deal_id (FK), user_id (FK)
action_type, payload (jsonb)
```

#### Tables immobilier (migration)

**promoteurs** - Partenaires promoteurs
```sql
nom, slug, couleur, url_site
contact_nom, contact_email
```

**programmes** - Programmes immobilier neuf
```sql
promoteur_id (FK), nom, ville, region
statut, typologies[], dispositifs[]
prix_a_partir_de, date_livraison
nb_lots_total, nb_lots_dispo
```

**dossiers_immo** - Dossiers clients immobilier
```sql
client_id, programme_id (FK)
conseiller_id (FK), client_info
statut_pipeline, honoraires
```

### Sécurité (RLS - Row Level Security)

#### Politiques d'accès
- **Profiles** : Lecture self ou manager, modification self ou manager
- **Deals** : Accès scopé par advisor_code ou role manager
- **Objectifs** : Lecture libre, modification manager uniquement
- **Activities** : Accès scopé par user_id ou manager

#### Fonctions d'aide
```sql
is_manager() - Vérifie si l'utilisateur est manager
current_advisor_code() - Retourne le code conseiller actuel
```

### Edge Functions (Deno)

**sync-programmes** - Synchronisation automatique des programmes GreenCity
- Parser HTML des programmes Île-de-France
- Upsert en base avec gestion des doublons
- Mapping automatique statuts et typologies

## API Routes (Vercel)

### nav.js - API NAV (Valeur Liquidative)
- Support Yahoo Finance et Morningstar
- Récupération cours, performances 1W/1M/3M/1Y
- Fallback automatique entre sources
- Cache et optimisations

### generate-linkedin.js - Génération contenu LinkedIn
- Intégration API Anthropic Claude
- Prompts spécialisés CGP conformes AMF
- Génération posts optimisés engagement

### generate-note.js - Génération notes client
- Synthèse automatique des informations client
- Templates métier gestion de patrimoine

## Déploiement et environnement

### Vercel (Frontend + API Routes)
- Build automatique via Vite
- Variables d'environnement : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- API Routes serverless pour intégrations externes

### Supabase (Backend)
- PostgreSQL hébergé avec backups automatiques
- Authentication JWT avec session persistence
- Storage pour documents/images (si configuré)
- Edge Functions pour logique métier complexe

## Spécificités métier

### Métriques CGP
- **PP** (Prime Ponctuelle) : Commission récurrente mensuelle
- **PU** (Prime Unique) : Commission one-shot
- **Annualisation** : PP × 12 pour comparaisons
- **Taux de signature** : Deals signés / Total deals période
- **Âge des deals** : Suivi ancienneté pipeline avec alertes

### Workflow commercial
1. **Lead** → Capture via sources (Facebook, téléprospection, etc.)
2. **Prospect** → Qualification et première approche
3. **En cours** → Négociation active
4. **Prévu** → Deal quasiment bouclé
5. **Signé** → Commission acquise
6. **Annulé** → Deal perdu avec analyse

### Immobilier neuf - Pipeline VEFA
1. **Prospect** → Identification besoin
2. **Présenté** → Programme proposé
3. **Réservation** → Compromis de réservation
4. **Financement** → Montage financier
5. **Acte** → Signature acte authentique
6. **Livraison** → Réception appartement
7. **Honoraires** → Encaissement commission

## Configuration et maintenance

### Variables d'environnement requises
```env
# Frontend (.env local ou Vercel)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# API Routes (Vercel)
ANTHROPIC_API_KEY=sk-ant-xxx  # Pour LinkedIn generator

# Supabase Functions
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Setup initial base de données
1. Exécuter `supabase/schema.sql` dans SQL Editor
2. Exécuter `supabase/migration_immobilier.sql` pour module immobilier
3. Créer utilisateur manager avec `role='manager'` et `advisor_code='LOUIS'`
4. Configurer RLS et tester authentification

### Monitoring et logs
- Supabase Dashboard pour métriques base de données
- Vercel Analytics pour performance frontend
- Edge Functions logs pour debug synchronisations
- Activities table pour audit actions utilisateur

## Points d'attention architecture

### Performance
- App.jsx monolithique (58k tokens) - Candidate au refactoring
- Composants lourds à diviser (VueImmobilier, etc.)
- Optimiser re-renders avec React.memo si nécessaire

### Sécurité
- RLS bien configuré par rôle et advisor_code
- API keys externes à surveiller (quotas, rotation)
- Logs sensibles à éviter (PII, montants)

### Évolutivité
- Architecture modulaire à maintenir
- Base de données normalisée et extensible
- APIs externes avec fallbacks appropriés