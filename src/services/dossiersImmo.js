// src/services/dossiersImmo.js
// Couche d'accès Supabase pour la table `dossiers_immo` (pipeline VEFA).
//
// La table peut ne pas exister (feature optionnelle) → countSafe() ignore
// silencieusement l'erreur de table manquante.

import { supabase } from '../lib/supabase'

/**
 * Compte les dossiers immo actifs. Renvoie 0 silencieusement si la
 * table n'existe pas (feature non installée sur cet environnement).
 */
export async function countSafe() {
  try {
    const { data } = await supabase
      .from('dossiers_immo')
      .select('id', { count: 'exact', head: false })
    return (data || []).length
  } catch {
    return 0
  }
}
