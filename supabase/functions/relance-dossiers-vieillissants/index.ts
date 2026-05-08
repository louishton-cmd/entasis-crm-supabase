// Edge Function : relance automatique des conseillers sur les dossiers
// vieillissants (>30j sans création/mouvement, statut En cours ou Prévu).
//
// Déclenchée par pg_cron (cf migration 20260508_cron_relance_dossiers.sql).
// Envoie 1 mail / dossier / 7j max via Brevo (api.brevo.com), conseiller en
// `to:`, louis.hatton en `cc:`. Logge chaque envoi dans dossier_relance_log.
//
// Variables d'environnement requises :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injectées par Supabase)
//   BREVO_API_KEY                           (à configurer manuellement)
//   RELANCE_FROM_EMAIL  (ex. "noreply@entasis-conseil.fr")
//   RELANCE_FROM_NAME   (ex. "Entasis CRM" — défaut)
//   RELANCE_CC          (défaut: louis.hatton@entasis-conseil.fr)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const STALE_DAYS = 30
const COOLDOWN_DAYS = 7

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const fmtEuro = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const brevoKey = Deno.env.get('BREVO_API_KEY')
  const fromEmail = Deno.env.get('RELANCE_FROM_EMAIL') || 'noreply@entasis-conseil.fr'
  const fromName = Deno.env.get('RELANCE_FROM_NAME') || 'Entasis CRM'
  const cc = Deno.env.get('RELANCE_CC') || 'louis.hatton@entasis-conseil.fr'

  if (!brevoKey) {
    return new Response(JSON.stringify({ error: 'BREVO_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const now = Date.now()
  const staleBefore = new Date(now - STALE_DAYS * 86400000).toISOString()
  const cooldownAfter = new Date(now - COOLDOWN_DAYS * 86400000).toISOString()

  // 1. Dossiers en pipeline créés il y a plus de STALE_DAYS jours.
  const { data: deals, error: dealsErr } = await supabase
    .from('deals')
    .select('id, client, product, pp_m, pu, advisor_code, status, created_at')
    .in('status', ['En cours', 'Prévu'])
    .lt('created_at', staleBefore)

  if (dealsErr) {
    return new Response(JSON.stringify({ error: dealsErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (!deals || deals.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, scanned: 0, message: 'no stale deals' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // 2. Filtrer ceux déjà relancés dans les COOLDOWN_DAYS.
  const dealIds = deals.map(d => d.id)
  const { data: recentLogs } = await supabase
    .from('dossier_relance_log')
    .select('deal_id')
    .in('deal_id', dealIds)
    .gte('sent_at', cooldownAfter)

  const relancedRecently = new Set((recentLogs || []).map(l => l.deal_id))
  const toRelance = deals.filter(d => !relancedRecently.has(d.id))

  if (toRelance.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, scanned: deals.length, message: 'all in cooldown' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // 3. Profils des conseillers concernés (pour récupérer email + prénom).
  const advisorCodes = [...new Set(toRelance.map(d => d.advisor_code).filter(Boolean))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('advisor_code, email, full_name')
    .in('advisor_code', advisorCodes)

  const profileByCode: Record<string, { email: string; full_name: string }> = {}
  for (const p of (profiles || [])) {
    if (p.advisor_code) profileByCode[p.advisor_code] = p as any
  }

  // 4. Envoi des mails + log.
  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const deal of toRelance) {
    const profile = profileByCode[deal.advisor_code]
    if (!profile?.email) { skipped++; continue }

    const ageDays = Math.floor((now - new Date(deal.created_at).getTime()) / 86400000)
    const firstName = profile.full_name?.split(' ')[0] || deal.advisor_code
    const ppAnnual = Number(deal.pp_m || 0) * 12
    const pu = Number(deal.pu || 0)

    const subject = `Relance dossier ${deal.client} (${deal.product}) — ${ageDays}j sans mouvement`
    const htmlContent = `
      <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:560px">
        <p>Bonjour ${firstName},</p>
        <p>Le dossier client <strong>${deal.client}</strong> sur produit <strong>${deal.product}</strong> n'a pas évolué depuis <strong>${ageDays} jours</strong>.</p>
        <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
          <tr><td style="padding:4px 12px 4px 0;color:#666">Statut actuel</td><td style="padding:4px 0"><strong>${deal.status}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#666">PP annualisée</td><td style="padding:4px 0"><strong>${fmtEuro(ppAnnual)}</strong></td></tr>
          ${pu > 0 ? `<tr><td style="padding:4px 12px 4px 0;color:#666">PU</td><td style="padding:4px 0"><strong>${fmtEuro(pu)}</strong></td></tr>` : ''}
        </table>
        <p>Quel est le retour client ? Merci de mettre à jour le dossier dans le CRM ou de répondre à ce mail.</p>
        <p style="color:#999;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
          Relance automatique du CRM Entasis · Direction en copie.
        </p>
      </div>
    `

    try {
      const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          sender: { email: fromEmail, name: fromName },
          to: [{ email: profile.email, name: profile.full_name || undefined }],
          cc: [{ email: cc }],
          subject,
          htmlContent,
        })
      })

      if (!resp.ok) {
        const body = await resp.text()
        errors.push(`${deal.id}: HTTP ${resp.status} ${body.slice(0, 200)}`)
        continue
      }

      await supabase.from('dossier_relance_log').insert({
        deal_id: deal.id,
        sent_to: profile.email,
        cc,
        age_days: ageDays,
        status_at_send: deal.status,
      })
      sent++
    } catch (e) {
      errors.push(`${deal.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return new Response(JSON.stringify({
    ok: true, sent, skipped, scanned: deals.length,
    candidates: toRelance.length, errors
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
