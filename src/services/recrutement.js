// src/services/recrutement.js
// Couche d'accès Supabase pour le module Recrutement.

import { supabase } from '../lib/supabase'

export const STATUS_LABELS = {
  received:       { label: 'Candidature reçue',  color: '#6366F1', emoji: '📥', order: 1 },
  screening:      { label: 'Filtrage CV',        color: '#0EA5E9', emoji: '🔍', order: 2 },
  interview_rh:   { label: 'Entretien RH',       color: '#10B981', emoji: '📞', order: 3 },
  interview_dir:  { label: 'Entretien direction',color: '#F59E0B', emoji: '🤝', order: 4 },
  offered:        { label: 'Proposition envoyée',color: '#C5A55A', emoji: '✉', order: 5 },
  hired:          { label: 'Embauché',           color: '#059669', emoji: '🎉', order: 6 },
  rejected:       { label: 'Refusé',             color: '#6B7280', emoji: '✗',  order: 99 },
}

export const PIPELINE_STATUSES = ['received', 'screening', 'interview_rh', 'interview_dir', 'offered', 'hired']

export const SOURCE_LABELS = {
  tally:      { label: 'Tally',       emoji: 'T', color: '#6366F1' },
  linkedin:   { label: 'LinkedIn',    emoji: 'in', color: '#0A66C2' },
  wttj:       { label: 'WelcomeToTheJungle', emoji: 'W', color: '#E45A5A' },
  cooptation: { label: 'Cooptation',  emoji: '🤝', color: '#F59E0B' },
  manuel:     { label: 'Saisie manuelle', emoji: '✍', color: 'var(--t3)' },
}

/** Liste tous les candidats actifs (non rejetés depuis >30j). */
export async function list({ includeRejected = false, search = '' } = {}) {
  let query = supabase
    .from('recruitment_candidates')
    .select('*')
    .order('last_action_at', { ascending: false })
  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,position.ilike.%${search}%`)
  }
  const { data, error } = await query.limit(500)
  if (error) throw error
  if (!includeRejected) {
    // Garde les rejetés récents (<30j) pour visibilité
    const cutoff = new Date(Date.now() - 30 * 86400 * 1000).toISOString()
    return (data || []).filter(c => c.status !== 'rejected' || (c.updated_at && c.updated_at > cutoff))
  }
  return data || []
}

/** Récupère un candidat avec sa timeline */
export async function getWithTimeline(id) {
  const { data: candidate, error: candErr } = await supabase
    .from('recruitment_candidates')
    .select('*')
    .eq('id', id)
    .single()
  if (candErr) throw candErr
  const { data: actions } = await supabase
    .from('recruitment_actions')
    .select('*')
    .eq('candidate_id', id)
    .order('created_at', { ascending: false })
    .limit(50)
  return { candidate, actions: actions || [] }
}

/** Crée un candidat manuel */
export async function create(payload) {
  const { data: { user } } = await supabase.auth.getUser()
  const insertPayload = {
    full_name: payload.full_name?.trim(),
    email: payload.email?.trim() || null,
    phone: payload.phone?.trim() || null,
    position: payload.position?.trim() || null,
    source: payload.source || 'manuel',
    status: payload.status || 'received',
    cv_url: payload.cv_url || null,
    linkedin_url: payload.linkedin_url || null,
    notes: payload.notes || null,
    score: payload.score || 0,
    tags: payload.tags || [],
    created_by: user?.id || null,
  }
  const { data, error } = await supabase
    .from('recruitment_candidates')
    .insert(insertPayload)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Update partielle */
export async function update(id, patch) {
  const { data, error } = await supabase
    .from('recruitment_candidates')
    .update({ ...patch, last_action_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/** Change le statut (trigger auto-log dans actions) */
export async function setStatus(id, newStatus, rejectionReason = null) {
  const patch = { status: newStatus }
  if (newStatus === 'rejected' && rejectionReason) patch.rejection_reason = rejectionReason
  return update(id, patch)
}

/** Ajoute une note manager */
export async function addNote(id, noteText) {
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('recruitment_actions').insert({
    candidate_id: id,
    action_type: 'note_added',
    payload: { text: noteText },
    created_by: user?.id || null,
  })
  return update(id, { notes: noteText })
}

/** Soft-delete = passage en rejected avec raison */
export async function reject(id, reason) {
  return setStatus(id, 'rejected', reason)
}

/** Stats globales pour les KPIs */
export async function getStats() {
  const { data, error } = await supabase
    .from('recruitment_candidates')
    .select('status, applied_at, source')
    .limit(2000)
  if (error) return null

  const now = Date.now()
  const m30days = now - 30 * 86400 * 1000
  const stats = {
    total: 0,
    last30days: 0,
    byStatus: {},
    bySource: {},
    avgTimeToHireDays: null,
  }
  for (const c of data || []) {
    stats.total++
    stats.byStatus[c.status] = (stats.byStatus[c.status] || 0) + 1
    stats.bySource[c.source] = (stats.bySource[c.source] || 0) + 1
    if (c.applied_at && new Date(c.applied_at).getTime() > m30days) stats.last30days++
  }
  return stats
}
