// ═══════════════════════════════════════════════════════════════════════════
// API : POST /api/impersonate
// Génère un magic link Supabase pour qu'un manager puisse se connecter
// en tant qu'un autre utilisateur. Toute opération est tracée dans
// audit_impersonation.
//
// SÉCURITÉ
//   • L'appelant doit être authentifié (Bearer JWT)
//   • Son role doit être 'manager' dans la table profiles
//   • Le SUPABASE_SERVICE_ROLE_KEY n'est utilisé QUE côté serveur (jamais exposé)
//   • Insertion d'une ligne d'audit avant retour du lien
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'
import { verifyAuth } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // 1. Vérifier l'auth + récupérer l'utilisateur appelant
  let caller
  try {
    caller = await verifyAuth(req)
  } catch {
    return res.status(401).json({ error: 'Non autorisé' })
  }

  const { targetUserId, reason } = req.body || {}
  if (!targetUserId) return res.status(400).json({ error: 'targetUserId requis' })

  // 2. Client admin (service_role) pour bypass RLS sur profiles côté serveur.
  //    L'ANON_KEY ne marche pas ici car on n'a pas de session côté serveur
  //    pour propager auth.uid() dans les policies.
  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!adminKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY non configuré côté serveur' })
  }
  const admin = createClient(process.env.SUPABASE_URL, adminKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 3. Vérifier que l'appelant est manager
  const { data: callerProfile, error: callerErr } = await admin
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', caller.id)
    .single()

  if (callerErr || !callerProfile) {
    console.error('[impersonate] caller profile lookup', callerErr, 'caller.id=', caller.id)
    return res.status(403).json({ error: 'Profil appelant introuvable' })
  }
  if (callerProfile.role !== 'manager') {
    return res.status(403).json({ error: 'Réservé aux managers' })
  }

  // 4. Récupérer la cible
  const { data: targetProfile, error: targetErr } = await admin
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', targetUserId)
    .single()

  if (targetErr || !targetProfile?.email) {
    return res.status(404).json({ error: 'Utilisateur cible introuvable' })
  }

  // 4. Garde-fou : pas d'impersonation manager → manager (évite l'escalade)
  if (targetProfile.role === 'manager' && targetProfile.id !== caller.id) {
    return res.status(403).json({ error: 'Impersonation d\'un autre manager interdite' })
  }

  // 5. Générer le magic link via l'API admin Supabase
  const redirectOrigin = req.headers.origin || `https://${req.headers.host}` || ''
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: targetProfile.email,
    options: { redirectTo: redirectOrigin || undefined },
  })

  if (linkErr || !linkData?.properties?.action_link) {
    console.error('[impersonate] generateLink failed', linkErr)
    return res.status(500).json({ error: 'Génération du lien échouée' })
  }

  // 6. Logger l'audit (best effort, ne bloque pas la réponse si erreur)
  try {
    await admin.from('audit_impersonation').insert({
      manager_id: callerProfile.id,
      manager_email: callerProfile.email,
      target_user_id: targetProfile.id,
      target_email: targetProfile.email,
      reason: (reason || '').slice(0, 500) || null,
      user_agent: req.headers['user-agent']?.slice(0, 300) || null,
      ip_address: req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || null,
    })
  } catch (e) {
    console.warn('[impersonate] audit insert failed', e)
  }

  return res.status(200).json({
    link: linkData.properties.action_link,
    target: {
      id: targetProfile.id,
      email: targetProfile.email,
      full_name: targetProfile.full_name,
    },
  })
}
