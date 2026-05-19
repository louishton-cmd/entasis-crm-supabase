// src/services/invitations.js
// Couche d'accès Supabase pour la table `invitations` (onboarding).
//
// Workflow :
//   1. Manager : invite un nouvel utilisateur → create()
//   2. Lien généré : ?invite=<token>
//   3. Nouvel arrivant clique → validateToken() pour récupérer role/code
//   4. Après signup → markUsed() pour invalider le token

import { supabase } from '../lib/supabase'

/**
 * Valide un token d'invitation (non utilisé, non expiré).
 * @returns la row complète ou null si invalide
 */
export async function validateToken(token) {
  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) return null
  return data
}

/**
 * Liste les 10 dernières invitations (panel admin).
 */
export async function listRecent(limit = 10) {
  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

/**
 * Crée une nouvelle invitation. Retourne la row complète (avec token).
 */
export async function create({ email, role, advisorCode, createdBy }) {
  const { data, error } = await supabase
    .from('invitations')
    .insert({
      email: email || null,
      role,
      advisor_code: advisorCode || null,
      created_by: createdBy,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Marque une invitation comme utilisée (après signup).
 */
export async function markUsed(token) {
  const { error } = await supabase
    .from('invitations')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token)
  if (error) throw error
}

/**
 * Révoque (supprime) une invitation.
 */
export async function remove(invitationId) {
  const { error } = await supabase
    .from('invitations')
    .delete()
    .eq('id', invitationId)
  if (error) throw error
}
