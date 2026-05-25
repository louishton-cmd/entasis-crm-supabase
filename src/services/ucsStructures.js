// src/services/ucsStructures.js
// Couche d'accès Supabase pour le catalogue UCS Produits Structurés et
// les simulations de commission associées. Cohérent avec la couche
// services CRM (Phase 2.A).
//
// Règle métier commission :
//   - Conseiller : 1,5 % fixe (hardcoded ici, pas dans la DB)
//   - Cabinet : Upfront UCS - 1,5 %  (peut être négatif → ⚠ admin)
//
// Constantes exportées pour réutilisation côté UI.

import { supabase } from '../lib/supabase'

export const COMMISSION_CONSEILLER_PCT = 1.5

/**
 * Calcule la répartition de commission pour un montant + une UCS donnée.
 * Pure function, sans appel DB — utilisée en temps réel par le simulateur.
 *
 * @param {number} montant  - Montant placé client en €
 * @param {number} upfront  - Upfront UCS en % (ex: 4.5 pour 4,5%)
 * @returns { upfrontTotal, conseiller, cabinet, isUnderwater }
 *   - upfrontTotal : montant × upfront / 100
 *   - conseiller   : montant × 1.5 / 100  (toujours 1,5 % fixe)
 *   - cabinet      : upfrontTotal - conseiller
 *   - isUnderwater : true si upfront < 1.5 → cabinet en perte
 */
export function computeCommission(montant, upfront) {
  const upfrontTotal = (montant * upfront) / 100
  const conseiller = (montant * COMMISSION_CONSEILLER_PCT) / 100
  const cabinet = upfrontTotal - conseiller
  return {
    upfrontTotal,
    conseiller,
    cabinet,
    isUnderwater: cabinet < 0,
  }
}

/**
 * Calcule le coupon annuel client pour info (montant × coupon% / an).
 */
export function computeCouponAnnuel(montant, couponClient) {
  return (montant * couponClient) / 100
}

// ─────────────────────────────────────────────────────────────────────────────
// UCS structures (catalogue)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Charge tout le catalogue UCS. Tri par défaut : EN_COURS d'abord, puis
 * upfront décroissant.
 */
export async function listAll() {
  const { data, error } = await supabase
    .from('ucs_structures')
    .select('*')
    .order('etat', { ascending: true })   // EN_COURS avant CLOTURE/ANNULATION (alpha)
    .order('upfront', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Met à jour une UCS (édition admin).
 */
export async function update(id, patch) {
  const { error } = await supabase.from('ucs_structures').update(patch).eq('id', id)
  if (error) throw error
}

/**
 * Marque le statut d'une UCS (boutons "Marquer CLOTURE" / "Marquer ANNULATION").
 */
export async function markStatus(id, etat) {
  if (!['EN_COURS', 'CLOTURE', 'ANNULATION'].includes(etat)) {
    throw new Error(`Statut invalide : ${etat}`)
  }
  return update(id, { etat })
}

/**
 * Insère en masse (upsert sur code_isin). Utilisé par l'admin pour
 * importer un CSV de l'export du groupement.
 */
export async function upsertMany(rows) {
  if (!rows?.length) return { inserted: 0 }
  const { data, error } = await supabase
    .from('ucs_structures')
    .upsert(rows, { onConflict: 'code_isin' })
    .select('id')
  if (error) throw error
  return { inserted: (data || []).length }
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulations de commission
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sauvegarde une simulation pour analytics + traçabilité.
 * Le conseiller_id est lu côté DB via auth.uid() — pas besoin de le
 * passer ici tant que RLS est active (cf. migration).
 */
export async function saveSimulation({
  ucsId,
  conseillerId,
  clientId = null,
  montant,
  commissionConseiller,
  commissionCabinet,
}) {
  const { data, error } = await supabase
    .from('simulations_structures')
    .insert({
      ucs_id: ucsId,
      conseiller_id: conseillerId,
      client_id: clientId,
      montant,
      commission_conseiller: commissionConseiller,
      commission_cabinet: commissionCabinet,
    })
    .select('id')
    .single()
  if (error) throw error
  return data
}

/**
 * Liste les dernières simulations (utile pour la vue manager).
 */
export async function listRecentSimulations(limit = 50) {
  const { data, error } = await supabase
    .from('simulations_structures')
    .select(`
      *,
      ucs:ucs_structures(nom_ucs, code_isin, compagnie),
      conseiller:profiles(full_name, advisor_code),
      client:clients(nom, prenom)
    `)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}
