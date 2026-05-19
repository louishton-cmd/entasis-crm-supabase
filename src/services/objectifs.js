// src/services/objectifs.js
// Couche d'accès Supabase pour la table `objectifs` (KPI mensuels).

import { supabase } from '../lib/supabase'

/**
 * Charge tous les objectifs, ordre par mois.
 */
export async function listAll() {
  const { data, error } = await supabase
    .from('objectifs')
    .select('*')
    .order('month')
  if (error) throw error
  return data || []
}

/**
 * Upsert (création ou modification) un objectif mensuel.
 */
export async function upsert(row) {
  const { error } = await supabase.from('objectifs').upsert(row)
  if (error) throw error
}
