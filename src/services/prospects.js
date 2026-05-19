// src/services/prospects.js
// Couche d'accès Supabase pour la table `prospects` (LinkedIn outreach).

import { supabase } from '../lib/supabase'

/**
 * Liste tous les prospects, ordre antichronologique.
 * Renvoie aussi le count des "a_contacter" (badge UI).
 */
export async function listAll() {
  const { data, error } = await supabase
    .from('prospects')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  const list = data || []
  const aContacter = list.filter(p => p.status === 'a_contacter').length
  return { list, aContacter }
}

/**
 * Met à jour un prospect (statut, notes, etc.).
 */
export async function update(prospect) {
  const { error } = await supabase
    .from('prospects')
    .update(prospect)
    .eq('id', prospect.id)
  if (error) throw error
}
