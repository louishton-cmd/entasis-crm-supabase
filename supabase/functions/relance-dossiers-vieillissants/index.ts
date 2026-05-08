// Edge Function : 3 types de relances automatiques aux conseillers, avec
// direction (Louis + Jean) en copie de chaque mail.
//
//   1. vieillissement : dossier en pipeline (En cours/Prévu) >30j sans mouvement.
//                       Cooldown 7j par dossier.
//   2. avis_google    : dossier signé il y a 30-32j. Demande au conseiller s'il
//                       a obtenu un avis Google. Cooldown 90j (envoyé 1 seule fois).
//   3. multi_equip    : client signé sur un seul type de produit (PER seul ou
//                       AV seule, etc.) depuis ≥30j. Suggère mutuelle/prévoyance/SCPI.
//                       Cooldown 30j.
//
// Déclenchée par pg_cron quotidien (cf migration cron). Par défaut tous les
// types sont exécutés. POST { "types": ["vieillissement"] } pour cibler.
//
// Variables d'environnement requises :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injectées)
//   BREVO_API_KEY                           (configuré via supabase secrets)
//   RELANCE_FROM_EMAIL                      (ex. noreply@entasis-conseil.fr)
//   RELANCE_FROM_NAME                       (ex. "Entasis CRM")
//   RELANCE_CC                              (liste séparée par virgules)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

const STALE_DAYS = 30
const COOLDOWN_VIEILLISSEMENT_DAYS = 7
const AVIS_GOOGLE_DAYS_AFTER_SIGN = 30
const AVIS_GOOGLE_WINDOW_DAYS = 3       // tolérance : envoie entre J+30 et J+32
const COOLDOWN_AVIS_GOOGLE_DAYS = 90
const MULTI_EQUIP_MIN_DAYS_SINCE_SIGN = 30
const COOLDOWN_MULTI_EQUIP_DAYS = 30

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const fmtEuro = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })

type BrevoConfig = {
  key: string
  from: { email: string; name: string }
  cc: { email: string }[]
}

type Profile = { advisor_code: string; email: string; full_name: string }
type Deal = {
  id: string; client: string; client_id: string | null
  product: string; pp_m: number; pu: number
  advisor_code: string; status: string; created_at: string
  date_signed: string | null
}

async function sendMail(cfg: BrevoConfig, profile: Profile, subject: string, htmlContent: string): Promise<{ ok: boolean; err?: string }> {
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': cfg.key,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      sender: cfg.from,
      to: [{ email: profile.email, name: profile.full_name || undefined }],
      cc: cfg.cc,
      subject,
      htmlContent,
    })
  })
  if (!resp.ok) return { ok: false, err: `HTTP ${resp.status} ${(await resp.text()).slice(0, 200)}` }
  return { ok: true }
}

function firstName(p: Profile): string {
  return p.full_name?.split(' ')[0] || p.advisor_code
}

// ─────────────────────────────────────────────────────────────────────────────
// Type 1 : vieillissement (existant)
// ─────────────────────────────────────────────────────────────────────────────

async function processVieillissement(
  supabase: SupabaseClient, cfg: BrevoConfig, profileByCode: Record<string, Profile>
) {
  const now = Date.now()
  const staleBefore = new Date(now - STALE_DAYS * 86400000).toISOString()
  const cooldownAfter = new Date(now - COOLDOWN_VIEILLISSEMENT_DAYS * 86400000).toISOString()

  const { data: deals } = await supabase
    .from('deals')
    .select('id, client, client_id, product, pp_m, pu, advisor_code, status, created_at, date_signed')
    .in('status', ['En cours', 'Prévu'])
    .lt('created_at', staleBefore)

  if (!deals?.length) return { sent: 0, candidates: 0, errors: [] as string[] }

  const dealIds = deals.map(d => d.id)
  const { data: recentLogs } = await supabase
    .from('dossier_relance_log')
    .select('deal_id')
    .eq('type', 'vieillissement')
    .in('deal_id', dealIds)
    .gte('sent_at', cooldownAfter)
  const inCooldown = new Set((recentLogs || []).map(l => l.deal_id))
  const toSend = deals.filter(d => !inCooldown.has(d.id))

  let sent = 0
  const errors: string[] = []

  for (const deal of toSend) {
    const profile = profileByCode[deal.advisor_code]
    if (!profile?.email) continue
    const ageDays = Math.floor((now - new Date(deal.created_at).getTime()) / 86400000)
    const ppAnnual = Number(deal.pp_m || 0) * 12
    const pu = Number(deal.pu || 0)
    const subject = `Relance dossier ${deal.client} (${deal.product}) — ${ageDays}j sans mouvement`
    const htmlContent = `
      <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:560px">
        <p>Bonjour ${firstName(profile)},</p>
        <p>Le dossier client <strong>${deal.client}</strong> sur produit <strong>${deal.product}</strong> n'a pas évolué depuis <strong>${ageDays} jours</strong>.</p>
        <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
          <tr><td style="padding:4px 12px 4px 0;color:#666">Statut actuel</td><td><strong>${deal.status}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#666">PP annualisée</td><td><strong>${fmtEuro(ppAnnual)}</strong></td></tr>
          ${pu > 0 ? `<tr><td style="padding:4px 12px 4px 0;color:#666">PU</td><td><strong>${fmtEuro(pu)}</strong></td></tr>` : ''}
        </table>
        <p>Quel est le retour client ? Merci de mettre à jour le dossier dans le CRM ou de répondre à ce mail.</p>
        <p style="color:#999;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">Relance automatique du CRM Entasis · Direction en copie.</p>
      </div>
    `
    const r = await sendMail(cfg, profile, subject, htmlContent)
    if (!r.ok) { errors.push(`${deal.id}: ${r.err}`); continue }
    await supabase.from('dossier_relance_log').insert({
      deal_id: deal.id, type: 'vieillissement',
      sent_to: profile.email, cc: cfg.cc.map(c => c.email).join(','),
      age_days: ageDays, status_at_send: deal.status,
    })
    sent++
  }
  return { sent, candidates: toSend.length, errors }
}

// ─────────────────────────────────────────────────────────────────────────────
// Type 2 : avis Google (J+30 après signature)
// ─────────────────────────────────────────────────────────────────────────────

async function processAvisGoogle(
  supabase: SupabaseClient, cfg: BrevoConfig, profileByCode: Record<string, Profile>
) {
  const now = Date.now()
  // Cible la fenêtre J+30 à J+30+window
  const windowStart = new Date(now - (AVIS_GOOGLE_DAYS_AFTER_SIGN + AVIS_GOOGLE_WINDOW_DAYS) * 86400000)
  const windowEnd = new Date(now - AVIS_GOOGLE_DAYS_AFTER_SIGN * 86400000)
  const cooldownAfter = new Date(now - COOLDOWN_AVIS_GOOGLE_DAYS * 86400000).toISOString()

  const { data: deals } = await supabase
    .from('deals')
    .select('id, client, client_id, product, pp_m, pu, advisor_code, status, created_at, date_signed')
    .eq('status', 'Signé')
    .gte('date_signed', windowStart.toISOString().slice(0, 10))
    .lte('date_signed', windowEnd.toISOString().slice(0, 10))

  if (!deals?.length) return { sent: 0, candidates: 0, errors: [] as string[] }

  const dealIds = deals.map(d => d.id)
  const { data: recentLogs } = await supabase
    .from('dossier_relance_log')
    .select('deal_id')
    .eq('type', 'avis_google')
    .in('deal_id', dealIds)
    .gte('sent_at', cooldownAfter)
  const inCooldown = new Set((recentLogs || []).map(l => l.deal_id))
  const toSend = deals.filter(d => !inCooldown.has(d.id))

  let sent = 0
  const errors: string[] = []

  for (const deal of toSend) {
    const profile = profileByCode[deal.advisor_code]
    if (!profile?.email || !deal.date_signed) continue
    const subject = `Avis Google · ${deal.client} a-t-il laissé un avis ?`
    const htmlContent = `
      <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:560px">
        <p>Bonjour ${firstName(profile)},</p>
        <p>Le dossier <strong>${deal.client}</strong> (${deal.product}) a été signé il y a 30 jours, le <strong>${fmtDate(deal.date_signed)}</strong>.</p>
        <p>👉 Le client a-t-il <strong>laissé un avis Google</strong> sur Entasis Conseil ?</p>
        <p>Si non, c'est le bon moment de lui demander — l'expérience est encore fraîche, et c'est crucial pour notre visibilité.</p>
        <p style="margin-top:16px"><a href="https://search.google.com/local/writereview?placeid=" style="display:inline-block;background:#C09B5A;color:white;padding:10px 18px;text-decoration:none;border-radius:6px;font-weight:600">Lien direct pour laisser un avis</a></p>
        <p style="font-size:12px;color:#999">(remplace l'URL ci-dessus avec celle de ta fiche Google)</p>
        <p>Réponds-moi simplement <em>oui</em> ou <em>non</em> à ce mail pour qu'on suive l'effort sur les avis.</p>
        <p style="color:#999;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">Relance automatique du CRM Entasis · Direction en copie.</p>
      </div>
    `
    const r = await sendMail(cfg, profile, subject, htmlContent)
    if (!r.ok) { errors.push(`${deal.id}: ${r.err}`); continue }
    const ageDays = Math.floor((now - new Date(deal.date_signed).getTime()) / 86400000)
    await supabase.from('dossier_relance_log').insert({
      deal_id: deal.id, type: 'avis_google',
      sent_to: profile.email, cc: cfg.cc.map(c => c.email).join(','),
      age_days: ageDays, status_at_send: deal.status,
    })
    sent++
  }
  return { sent, candidates: toSend.length, errors }
}

// ─────────────────────────────────────────────────────────────────────────────
// Type 3 : multi-équipement (client mono-produit signé depuis ≥30j)
// ─────────────────────────────────────────────────────────────────────────────

async function processMultiEquip(
  supabase: SupabaseClient, cfg: BrevoConfig, profileByCode: Record<string, Profile>
) {
  const now = Date.now()
  const minSignedBefore = new Date(now - MULTI_EQUIP_MIN_DAYS_SINCE_SIGN * 86400000).toISOString().slice(0, 10)
  const cooldownAfter = new Date(now - COOLDOWN_MULTI_EQUIP_DAYS * 86400000).toISOString()

  const { data: signedDeals } = await supabase
    .from('deals')
    .select('id, client, client_id, product, advisor_code, status, date_signed')
    .eq('status', 'Signé')
    .lte('date_signed', minSignedBefore)

  if (!signedDeals?.length) return { sent: 0, candidates: 0, errors: [] as string[] }

  // Group par client_id (fallback : client name + advisor)
  const byClient: Record<string, typeof signedDeals> = {}
  for (const d of signedDeals) {
    const key = d.client_id || `name:${d.client}__${d.advisor_code}`
    if (!byClient[key]) byClient[key] = []
    byClient[key].push(d)
  }

  // Mono-équipés = clients avec un seul type de produit distinct dans leurs deals signés.
  type Mono = { clientKey: string; deal: typeof signedDeals[number]; product: string }
  const monos: Mono[] = []
  for (const [clientKey, clientDeals] of Object.entries(byClient)) {
    const products = new Set(clientDeals.map(d => d.product))
    if (products.size === 1) {
      // Prendre le deal signé le plus récent comme deal référence pour le cooldown.
      const deal = clientDeals.sort((a, b) =>
        (b.date_signed || '').localeCompare(a.date_signed || '')
      )[0]
      monos.push({ clientKey, deal, product: deal.product })
    }
  }

  if (monos.length === 0) return { sent: 0, candidates: 0, errors: [] as string[] }

  // Filtre cooldown sur le deal_id de référence.
  const refDealIds = monos.map(m => m.deal.id)
  const { data: recentLogs } = await supabase
    .from('dossier_relance_log')
    .select('deal_id')
    .eq('type', 'multi_equip')
    .in('deal_id', refDealIds)
    .gte('sent_at', cooldownAfter)
  const inCooldown = new Set((recentLogs || []).map(l => l.deal_id))
  const toSend = monos.filter(m => !inCooldown.has(m.deal.id))

  let sent = 0
  const errors: string[] = []

  for (const mono of toSend) {
    const profile = profileByCode[mono.deal.advisor_code]
    if (!profile?.email) continue

    // Suggestions : tout sauf le produit déjà détenu, en priorisant Mutuelle / Prévoyance / SCPI.
    const priority = ['Mutuelle Santé', 'Prévoyance TNS', 'SCPI']
    const others = ['PER Individuel', 'Assurance Vie Française', 'Produits Structurés', 'Private Equity']
    const suggestions = [...priority, ...others].filter(p => p !== mono.product)
    const top3 = suggestions.slice(0, 3)

    const subject = `Multi-équipement · ${mono.deal.client} n'a qu'un ${mono.product}`
    const htmlContent = `
      <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:560px">
        <p>Bonjour ${firstName(profile)},</p>
        <p>Le client <strong>${mono.deal.client}</strong> est <strong>mono-équipé</strong> chez Entasis : un seul contrat à ce jour (<strong>${mono.product}</strong>, signé le ${mono.deal.date_signed ? fmtDate(mono.deal.date_signed) : '—'}).</p>
        <p>👉 <strong>Le multi-équipement est obligatoire</strong> chez Entasis : minimum <strong>2 contrats par client</strong>.</p>
        <p>Suggestions à proposer en priorité au prochain RDV :</p>
        <ul style="font-size:14px">
          ${top3.map(s => `<li><strong>${s}</strong></li>`).join('\n          ')}
        </ul>
        <p>Cale un point client dans les 2 semaines pour ouvrir le 2e contrat. Réponds à ce mail avec le plan d'action.</p>
        <p style="color:#999;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">Relance automatique du CRM Entasis · Direction en copie.</p>
      </div>
    `
    const r = await sendMail(cfg, profile, subject, htmlContent)
    if (!r.ok) { errors.push(`${mono.deal.id}: ${r.err}`); continue }
    const ageDays = mono.deal.date_signed
      ? Math.floor((now - new Date(mono.deal.date_signed).getTime()) / 86400000)
      : 0
    await supabase.from('dossier_relance_log').insert({
      deal_id: mono.deal.id, type: 'multi_equip',
      sent_to: profile.email, cc: cfg.cc.map(c => c.email).join(','),
      age_days: ageDays, status_at_send: mono.deal.status,
    })
    sent++
  }
  return { sent, candidates: toSend.length, errors }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const brevoKey = Deno.env.get('BREVO_API_KEY')
  const fromEmail = Deno.env.get('RELANCE_FROM_EMAIL') || 'noreply@entasis-conseil.fr'
  const fromName = Deno.env.get('RELANCE_FROM_NAME') || 'Entasis CRM'
  const ccRaw = Deno.env.get('RELANCE_CC') || 'louis.hatton@entasis-conseil.fr'
  const cc = ccRaw.split(',').map(s => s.trim()).filter(Boolean).map(email => ({ email }))

  if (!brevoKey) {
    return new Response(JSON.stringify({ error: 'BREVO_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Optionnel : POST { types: ["vieillissement"] } pour limiter à un type.
  let requestedTypes: string[] = ['vieillissement', 'avis_google', 'multi_equip']
  if (req.method === 'POST') {
    try {
      const body = await req.json().catch(() => ({}))
      if (Array.isArray(body?.types) && body.types.length > 0) {
        requestedTypes = body.types
      }
    } catch (_) { /* body vide ou invalide → defaults */ }
  }

  const cfg: BrevoConfig = { key: brevoKey, from: { email: fromEmail, name: fromName }, cc }

  // Charge tous les profiles actifs (utilisé par les 3 types).
  const { data: profiles } = await supabase
    .from('profiles')
    .select('advisor_code, email, full_name')
    .not('advisor_code', 'is', null)
  const profileByCode: Record<string, Profile> = {}
  for (const p of (profiles || [])) profileByCode[p.advisor_code] = p as any

  const results: Record<string, { sent: number; candidates: number; errors: string[] }> = {}
  if (requestedTypes.includes('vieillissement')) results.vieillissement = await processVieillissement(supabase, cfg, profileByCode)
  if (requestedTypes.includes('avis_google'))    results.avis_google    = await processAvisGoogle(supabase, cfg, profileByCode)
  if (requestedTypes.includes('multi_equip'))    results.multi_equip    = await processMultiEquip(supabase, cfg, profileByCode)

  const totalSent = Object.values(results).reduce((s, r) => s + r.sent, 0)
  return new Response(JSON.stringify({ ok: true, totalSent, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
