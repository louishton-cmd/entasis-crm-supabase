#!/usr/bin/env node
// scripts/import_ucs.js
// Import du CSV d'export groupement dans la table `ucs_structures`
// avec résolution du structureur via la table `structureurs`.
//
// Format CSV attendu (25 colonnes) :
//   etat, compagnie, source, nom_ucs, code_isin, structureur, banque_emettrice,
//   sous_jacent, upfront, minimum_requis, maximum_autorise, coupon_periode,
//   frequence_coupon, coupon_annualise, constatation, sri, maturite_annees,
//   capital_garanti, categorie_dda, date_debut, fin_commerc, enveloppe_restante,
//   couleur_badge, type_campagne, notes_internes
//
// Usage :
//   1. Placer le CSV à `data/ucs_initial_seed.csv` (ou ajuster CSV_PATH)
//   2. Exporter les variables :
//        export SUPABASE_URL=https://tvgbblbceqvdtqnbeoik.supabase.co
//        export SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
//   3. Lancer : node scripts/import_ucs.js
//
// Le script :
//   1. Parse le CSV
//   2. Pour chaque structureur unique : upsert dans `structureurs` (idempotent
//      sur le nom). Si le structureur n'existe pas, il est créé avec les
//      compagnies déduites des UCS associées.
//   3. Pour chaque UCS : upsert dans `ucs_structures` avec structureur_id résolu.
//
// Idempotent : peut être rejoué sans créer de doublons (onConflict sur
// code_isin pour ucs et nom pour structureurs).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CSV_PATH = path.join(__dirname, '..', 'data', 'ucs_initial_seed.csv')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Variables manquantes : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requises')
  process.exit(1)
}

if (!fs.existsSync(CSV_PATH)) {
  console.error(`❌ Fichier introuvable : ${CSV_PATH}`)
  process.exit(1)
}

// ─── Parser CSV (gère les guillemets pour les valeurs avec virgule interne) ───
function parseCsvLine(line) {
  const cells = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      // Double-quote escape "" → "
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; continue }
      inQuotes = !inQuotes
      continue
    }
    if (c === ',' && !inQuotes) { cells.push(cur); cur = ''; continue }
    cur += c
  }
  cells.push(cur)
  return cells
}

function num(v) {
  if (v == null || v === '') return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

function intOrNull(v) {
  if (v == null || v === '') return null
  const n = parseInt(v, 10)
  return isNaN(n) ? null : n
}

function boolOrFalse(v) {
  const s = String(v || '').trim().toLowerCase()
  return s === 'true' || s === '1' || s === 'yes' || s === 'oui'
}

function strOrNull(v) {
  const s = String(v ?? '').trim()
  return s ? s : null
}

function parseCsv(text) {
  const errors = []
  const rows = []
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { rows, errors: ['CSV vide ou pas d\'en-tête'] }

  const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase())
  const expected = [
    'etat', 'compagnie', 'source', 'nom_ucs', 'code_isin', 'structureur',
    'banque_emettrice', 'sous_jacent', 'upfront', 'minimum_requis',
    'maximum_autorise', 'coupon_periode', 'frequence_coupon', 'coupon_annualise',
    'constatation', 'sri', 'maturite_annees', 'capital_garanti', 'categorie_dda',
    'date_debut', 'fin_commerc', 'enveloppe_restante', 'couleur_badge',
    'type_campagne', 'notes_internes',
  ]
  const missing = expected.filter(c => !header.includes(c))
  if (missing.length) return { rows, errors: [`Colonnes manquantes : ${missing.join(', ')}`] }

  const idx = Object.fromEntries(expected.map(c => [c, header.indexOf(c)]))

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i])
    const row = {
      etat: String(cells[idx.etat] || '').trim().toUpperCase(),
      compagnie: String(cells[idx.compagnie] || '').trim().toUpperCase(),
      source: strOrNull(cells[idx.source]),
      nom_ucs: String(cells[idx.nom_ucs] || '').trim(),
      code_isin: String(cells[idx.code_isin] || '').trim().toUpperCase(),
      // Remplacement "En direct" → "Société Générale" pour le Crescendo Abeille
      // (instruction patch #3 Louis)
      _structureur_nom: (() => {
        const s = String(cells[idx.structureur] || '').trim()
        if (s.toLowerCase() === 'en direct') return 'Société Générale'
        return s || null
      })(),
      banque_emettrice: strOrNull(cells[idx.banque_emettrice]),
      sous_jacent: strOrNull(cells[idx.sous_jacent]),
      upfront: num(cells[idx.upfront]),
      minimum_requis: num(cells[idx.minimum_requis]),
      maximum_autorise: num(cells[idx.maximum_autorise]),
      coupon_periode: num(cells[idx.coupon_periode]),
      frequence_coupon: strOrNull(cells[idx.frequence_coupon])?.toUpperCase() || null,
      coupon_annualise: num(cells[idx.coupon_annualise]),
      constatation: strOrNull(cells[idx.constatation])?.toUpperCase() || null,
      sri: intOrNull(cells[idx.sri]),
      maturite_annees: intOrNull(cells[idx.maturite_annees]),
      capital_garanti: boolOrFalse(cells[idx.capital_garanti]),
      categorie_dda: num(cells[idx.categorie_dda]),
      date_debut: strOrNull(cells[idx.date_debut]),
      fin_commerc: strOrNull(cells[idx.fin_commerc]),
      enveloppe_restante: num(cells[idx.enveloppe_restante]),
      couleur_badge: strOrNull(cells[idx.couleur_badge]),
      type_campagne: strOrNull(cells[idx.type_campagne]),
      notes_internes: strOrNull(cells[idx.notes_internes]),
    }
    if (!['EN_COURS', 'CLOTURE', 'ANNULATION'].includes(row.etat)) {
      errors.push(`L${i + 1} : etat invalide "${row.etat}"`)
      continue
    }
    if (!['SWISSLIFE', 'ABEILLE'].includes(row.compagnie)) {
      errors.push(`L${i + 1} : compagnie invalide "${row.compagnie}" (attendu SWISSLIFE ou ABEILLE)`)
      continue
    }
    if (!row.code_isin || !row.nom_ucs) {
      errors.push(`L${i + 1} : code_isin et nom_ucs requis`)
      continue
    }
    if (row.minimum_requis == null) {
      errors.push(`L${i + 1} : minimum_requis requis`)
      continue
    }
    rows.push(row)
  }
  return { rows, errors }
}

// ─── Helpers Supabase REST ───
async function sb(method, pathname, body, extraHeaders = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${pathname}`
  const res = await fetch(url, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status} ${method} ${pathname} : ${text}`)
  }
  if (res.status === 204) return null
  return res.json()
}

async function upsertStructureurs(rowsCsv) {
  // Calcule les compagnies par structureur (déduit depuis les UCS du CSV)
  const compsByNom = new Map()
  for (const r of rowsCsv) {
    if (!r._structureur_nom) continue
    if (!compsByNom.has(r._structureur_nom)) compsByNom.set(r._structureur_nom, new Set())
    compsByNom.get(r._structureur_nom).add(r.compagnie)
  }

  const structureurs = Array.from(compsByNom.entries()).map(([nom, comps]) => ({
    nom,
    compagnies_travaillees: Array.from(comps),
    actif: true,
  }))

  if (structureurs.length === 0) return new Map()

  // Upsert sur nom (unique constraint)
  await sb(
    'POST',
    'structureurs?on_conflict=nom',
    structureurs,
    { 'Prefer': 'resolution=merge-duplicates,return=representation' }
  )

  // Re-fetch pour récupérer les IDs (l'upsert peut être muet sur les conflits)
  const all = await sb('GET', 'structureurs?select=id,nom')
  return new Map(all.map(s => [s.nom, s.id]))
}

async function upsertUcs(rowsCsv, structIdByNom) {
  const ucsRows = rowsCsv.map(r => {
    const { _structureur_nom, ...rest } = r
    return {
      ...rest,
      structureur_id: _structureur_nom ? (structIdByNom.get(_structureur_nom) || null) : null,
    }
  })

  const result = await sb(
    'POST',
    'ucs_structures?on_conflict=code_isin',
    ucsRows,
    { 'Prefer': 'resolution=merge-duplicates,return=representation' }
  )
  return result?.length || 0
}

// ─── Main ───
(async () => {
  console.log(`📂 Lecture de ${CSV_PATH}`)
  const text = fs.readFileSync(CSV_PATH, 'utf-8')
  const { rows, errors } = parseCsv(text)

  console.log(`✅ ${rows.length} lignes valides`)
  if (errors.length) {
    console.warn(`⚠ ${errors.length} erreur(s) de parsing :`)
    errors.slice(0, 10).forEach(e => console.warn('   - ' + e))
    if (errors.length > 10) console.warn(`   ... et ${errors.length - 10} autres`)
  }

  if (rows.length === 0) {
    console.error('❌ Aucune ligne à importer, abandon.')
    process.exit(1)
  }

  console.log(`🏢 Upsert des structureurs…`)
  try {
    const structIdByNom = await upsertStructureurs(rows)
    console.log(`   ${structIdByNom.size} structureurs en base`)

    console.log(`📦 Upsert des UCS dans ucs_structures…`)
    const inserted = await upsertUcs(rows, structIdByNom)
    console.log(`✅ ${inserted} UCS importées avec succès`)
    process.exit(0)
  } catch (e) {
    console.error(`❌ Erreur : ${e.message}`)
    process.exit(1)
  }
})()
