# Relance dossiers vieillissants

Edge Function qui envoie automatiquement un mail aux conseillers (avec
direction en copie) sur les dossiers en pipeline restés > 30 jours sans
mouvement, statut `En cours` ou `Prévu`.

- Cooldown : 7 jours entre deux relances sur le même dossier.
- Trigger : pg_cron quotidien à 7h UTC (cf migration `20260508_cron_relance_dossiers.sql`).
- Logs : table `dossier_relance_log` (cf migration `20260508_dossier_relance_log.sql`).
- Email : Brevo (ex-Sendinblue), 300 mails/jour gratuits.

## Setup (une seule fois)

### 1. Compte Brevo

- Créer un compte sur https://app.brevo.com (gratuit jusqu'à 300 mails/jour).
- Settings → SMTP & API → API Keys → générer une clé.
- Settings → Senders, Domains & Dedicated IPs → ajouter et vérifier le
  domaine `entasis-conseil.fr`. Brevo fournit les enregistrements DNS
  (DKIM, BIMI, Brevo Code) à publier chez le registrar.
- Une fois le domaine vérifié, ajouter un sender `noreply@entasis-conseil.fr`.

### 2. Secrets Supabase

Via le Dashboard ou la CLI :

```bash
supabase secrets set \
  BREVO_API_KEY=xkeysib-xxxxxxxx \
  RELANCE_FROM_EMAIL='noreply@entasis-conseil.fr' \
  RELANCE_FROM_NAME='Entasis CRM' \
  RELANCE_CC='louis.hatton@entasis-conseil.fr'
```

### 3. Déploiement de l'Edge Function

```bash
supabase functions deploy relance-dossiers-vieillissants
```

### 4. Activation des extensions Postgres

Dashboard → Database → Extensions → activer `pg_cron` et `pg_net`.

### 5. Migrations

```bash
supabase db push
```

⚠️ Avant `db push`, éditer `20260508_cron_relance_dossiers.sql` pour
remplacer `<PROJECT_REF>` et `<SERVICE_ROLE_KEY>`.

## Test manuel

```bash
curl -X POST 'https://<PROJECT_REF>.supabase.co/functions/v1/relance-dossiers-vieillissants' \
  -H 'Authorization: Bearer <SERVICE_ROLE_KEY>'
```

Réponse attendue :

```json
{ "ok": true, "sent": 3, "skipped": 0, "scanned": 5, "candidates": 3, "errors": [] }
```
