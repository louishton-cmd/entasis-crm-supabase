import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const MONTHS = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE']
const STATUS_OPTIONS = ['Signé', 'En cours', 'Prévu', 'Annulé']
const PRIORITY_OPTIONS = ['Normale', 'Haute', 'Urgente']
const PRODUCTS = ['PER Individuel', 'Assurance Vie Française', 'SCPI', 'Produits Structurés', 'Private Equity', 'Prévoyance TNS', 'Mutuelle Santé', 'Autre']
const COMPANIES = ['SwissLife', 'Abeille Assurances', 'Generali', 'Cardif (BNP Paribas)', 'Spirica', 'Autre']
const SOURCES = ['Téléprospection', 'Leads Facebook', 'Parrainage Client', 'Réseau Personnel', 'Site Web Entasis', 'LinkedIn', 'Autre']
const EMPTY_OBJECTIFS = MONTHS.reduce((acc, month) => {
  acc[month] = { pp_target: 0, pu_target: 0 }
  return acc
}, {})

function euro(value) {
  const n = Number(value || 0)
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function annualize(ppm) {
  return Number(ppm || 0) * 12
}

function id() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `deal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function currentMonth() {
  return MONTHS[new Date().getMonth()] || 'MARS'
}

function emptyDeal(advisorCode = '') {
  return {
    id: id(),
    month: currentMonth(),
    client: '',
    product: 'PER Individuel',
    pp_m: 0,
    pu: 0,
    advisor_code: advisorCode || '',
    co_advisor_code: '',
    source: 'Téléprospection',
    status: 'En cours',
    company: 'SwissLife',
    notes: '',
    priority: 'Normale',
    tags: [],
    date_expected: '',
    date_signed: '',
    client_phone: '',
    client_email: '',
    client_age: '',
  }
}

function normalizeDeal(deal) {
  return {
    ...deal,
    pp_m: Number(deal.pp_m || 0),
    pu: Number(deal.pu || 0),
    client_age: deal.client_age === '' || deal.client_age == null ? null : Number(deal.client_age),
  }
}

function statColor(status) {
  if (status === 'Signé') return '#4e8e66'
  if (status === 'Prévu') return '#6d86ae'
  if (status === 'Annulé') return '#b25f5b'
  return '#b67a2f'
}

function dealMatchesAdvisor(deal, advisorCode) {
  if (!advisorCode) return false
  return deal.advisor_code === advisorCode || deal.co_advisor_code === advisorCode
}

function isPipelineStatus(status) {
  return status === 'En cours' || status === 'Prévu'
}

function sumAnnualPp(deals) {
  return deals.reduce((sum, deal) => sum + annualize(deal.pp_m), 0)
}

function sumPu(deals) {
  return deals.reduce((sum, deal) => sum + Number(deal.pu || 0), 0)
}

function getForecastRow(signatures, month, advisorCode) {
  return signatures.find((entry) => entry.month === month && entry.advisor_code === advisorCode)
}

function advisorDealMetrics(deals, month, advisorCode) {
  const scoped = deals.filter((deal) => deal.month === month && dealMatchesAdvisor(deal, advisorCode))
  const signed = scoped.filter((deal) => deal.status === 'Signé')
  const pipeline = scoped.filter((deal) => isPipelineStatus(deal.status))
  return {
    signedDeals: signed.length,
    pipelineDeals: pipeline.length,
    ppSigned: sumAnnualPp(signed),
    puSigned: sumPu(signed),
    ppPipeline: sumAnnualPp(pipeline),
    puPipeline: sumPu(pipeline),
  }
}

function ConfigMissing() {
  return (
    <div className="center-screen">
      <div className="auth-card wide">
        <div className="brand-mark">ENTASIS</div>
        <h1>Configuration manquante</h1>
        <p>
          Ajoute <strong>VITE_SUPABASE_URL</strong> et <strong>VITE_SUPABASE_ANON_KEY</strong> dans Vercel ou dans ton fichier <code>.env</code>.
        </p>
        <pre className="code-block">VITE_SUPABASE_URL=https://...supabase.co{`\n`}VITE_SUPABASE_ANON_KEY=sb_publishable_...</pre>
      </div>
    </div>
  )
}

function AuthScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function signIn(e) {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setMessage(error.message)
  }

  async function signUp() {
    setLoading(true)
    setMessage('')
    const { error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) setMessage(error.message)
    else setMessage('Compte créé. Vérifie ton email si la confirmation est activée.')
  }

  async function magicLink() {
    setLoading(true)
    setMessage('')
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } })
    setLoading(false)
    if (error) setMessage(error.message)
    else setMessage('Lien de connexion envoyé par email.')
  }

  return (
    <div className="center-screen">
      <div className="auth-card">
        <div className="brand-mark">ENTASIS</div>
        <p className="eyebrow">CRM interne — Supabase Edition</p>
        <h1>Connexion équipe</h1>
        <p className="muted">Version sobre, premium et branchée à ta base Supabase.</p>
        <form onSubmit={signIn} className="auth-form">
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="louis.hatton@entasis-conseil.fr" required />
          </label>
          <label>
            Mot de passe
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" required />
          </label>
          <button className="btn btn-primary" disabled={loading} type="submit">{loading ? 'Connexion…' : 'Se connecter'}</button>
        </form>
        <div className="stack gap-sm">
          <button className="btn btn-secondary" disabled={loading} onClick={signUp}>Créer un compte</button>
          <button className="btn btn-ghost" disabled={loading || !email} onClick={magicLink}>Recevoir un lien magique</button>
        </div>
        {message ? <div className="notice">{message}</div> : null}
      </div>
    </div>
  )
}

function KpiCard({ label, value, hint }) {
  return (
    <div className="kpi-card">
      <div className="kpi-accent" />
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint ? <div className="kpi-hint">{hint}</div> : null}
    </div>
  )
}

function Header({ profile, month, setMonth, onNewDeal, onSignOut }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-brand">
          <div className="brand-line">ENTASIS CONSEIL</div>
          <div className="muted small">CRM patrimonial • Paris 8e • ORIAS 23003153</div>
        </div>
        <div className="topbar-actions">
          <div className="select-shell compact">
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary" onClick={onNewDeal}>Nouveau dossier</button>
          <div className="user-chip">
            <div className="user-chip-label">Session</div>
            <div>
              <strong>{profile?.full_name || profile?.email || 'Utilisateur'}</strong>
              <div className="muted tiny">{profile?.role === 'manager' ? 'Direction' : 'Conseiller'}{profile?.advisor_code ? ` • ${profile.advisor_code}` : ''}</div>
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onSignOut}>Déconnexion</button>
        </div>
      </div>
    </header>
  )
}

function TabNav({ activeTab, setActiveTab, profile }) {
  const tabs = [
    { key: 'vue', label: 'Vue mensuelle' },
    { key: 'dossiers', label: 'Dossiers' },
    { key: 'previsionnel', label: profile?.role === 'manager' ? 'Prévisionnels équipe' : 'Mon prévisionnel' },
  ]

  return (
    <div className="tabbar-shell">
      <div className="tabbar">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function CurvePanel({ title, actual, projected, target, note }) {
  const safeProjected = Math.max(projected, actual)
  const maxValue = Math.max(target || 0, safeProjected || 0, actual || 0, 1)

  const W = 392
  const H = 212
  const LEFT = 22
  const RIGHT = W - 18
  const TOP = 18
  const BOTTOM = 164

  const anchors = [
    { x: LEFT, v: Math.max(actual * 0.28, actual ? actual * 0.35 : 0) },
    { x: 126, v: actual },
    { x: 252, v: safeProjected },
    { x: RIGHT, v: Math.max(safeProjected, target || 0) },
  ]

  const toY = (v) => {
    const ratio = Math.max(0, Math.min(1, v / maxValue))
    return BOTTOM - ratio * (BOTTOM - TOP)
  }

  const pts = anchors.map((pt) => ({ x: pt.x, y: toY(pt.v) }))

  const catmull = (p0, p1, p2, p3) => {
    const t = 0.9
    return [
      { x: p1.x + ((p2.x - p0.x) / 6) * t, y: p1.y + ((p2.y - p0.y) / 6) * t },
      { x: p2.x - ((p3.x - p1.x) / 6) * t, y: p2.y - ((p3.y - p1.y) / 6) * t },
      { x: p2.x, y: p2.y },
    ]
  }

  const pExt = [pts[0], ...pts, pts[pts.length - 1]]
  let curvePath = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const [c1, c2, p2] = catmull(pExt[i - 1], pExt[i], pExt[i + 1], pExt[i + 2])
    curvePath += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`
  }

  const areaPath = `${curvePath} L ${pts[pts.length - 1].x} ${BOTTOM} L ${pts[0].x} ${BOTTOM} Z`
  const actualLineY = toY(actual)
  const projectedLineY = toY(safeProjected)
  const targetLineY = toY(target || 0)

  const pctSigned = target ? Math.round((actual / target) * 100) : Math.round((actual / maxValue) * 100)
  const pctProjected = target ? Math.round((safeProjected / target) * 100) : Math.round((safeProjected / maxValue) * 100)

  return (
    <div className="curve-card premium-curve">
      <div className="curve-head">
        <div>
          <div className="curve-title">{title}</div>
          {note ? <div className="muted small curve-note">{note}</div> : null}
        </div>
        <div className="curve-target">
          <div className="muted tiny">Objectif</div>
          <div className="curve-target-value">{euro(target || 0)}</div>
        </div>
      </div>

      <div className="curve-wrap dark-chart">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="curve-svg" aria-hidden="true">
          <defs>
            <linearGradient id="entasisProjectedFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(215, 185, 126, 0.82)" />
              <stop offset="100%" stopColor="rgba(215, 185, 126, 0.16)" />
            </linearGradient>
            <linearGradient id="entasisCurveLine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(243, 230, 207, 0.9)" />
              <stop offset="100%" stopColor="rgba(214, 174, 103, 1)" />
            </linearGradient>
            <filter id="curveGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.84 0 0 0 0 0.70 0 0 0 0 0.42 0 0 0 0.35 0" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {[0.25, 0.5, 0.75].map((tick) => {
            const y = BOTTOM - (BOTTOM - TOP) * tick
            return <line key={tick} x1={LEFT} y1={y} x2={RIGHT} y2={y} className="chart-grid" />
          })}
          <line x1={LEFT} y1={BOTTOM} x2={RIGHT} y2={BOTTOM} className="chart-axis" />

          {target ? <line x1={LEFT} y1={targetLineY} x2={RIGHT} y2={targetLineY} className="chart-target" /> : null}
          <path d={areaPath} fill="url(#entasisProjectedFill)" />
          <line x1={LEFT} y1={actualLineY} x2={RIGHT} y2={actualLineY} className="chart-actual-guide" />
          <path d={curvePath} fill="none" stroke="url(#entasisCurveLine)" strokeWidth="4" strokeLinecap="round" filter="url(#curveGlow)" />
          {pts.slice(1).map((pt, idx) => (
            <g key={idx}>
              <circle cx={pt.x} cy={pt.y} r="7" fill="#121417" stroke="rgba(214, 174, 103, 0.96)" strokeWidth="3" />
              <circle cx={pt.x} cy={pt.y} r="3" fill="#f5e7c8" />
            </g>
          ))}
        </svg>

        <div className="chart-axis-label chart-left">Réalisé</div>
        <div className="chart-axis-label chart-middle">Prévisionnel</div>
        <div className="chart-axis-label chart-right">Objectif</div>
      </div>

      <div className="curve-foot">
        <div>
          <div className="muted tiny">Réalisé</div>
          <div className="kpi">{euro(actual)}</div>
        </div>
        <div>
          <div className="muted tiny">Prévisionnel</div>
          <div className="kpi">{euro(safeProjected)}</div>
        </div>
        <div>
          <div className="muted tiny">Atterrissage</div>
          <div className="kpi">{pctSigned}% signé • {pctProjected}% projeté</div>
        </div>
      </div>
    </div>
  )
}

function Dashboard({ deals, objectifs, month, profile }) {
  const monthDeals = deals.filter((deal) => deal.month === month)
  const signed = monthDeals.filter((deal) => deal.status === 'Signé')
  const pipeline = monthDeals.filter((deal) => isPipelineStatus(deal.status))
  const ppSigned = sumAnnualPp(signed)
  const puSigned = sumPu(signed)
  const ppProjected = ppSigned + sumAnnualPp(pipeline)
  const puProjected = puSigned + sumPu(pipeline)
  const monthlyTargets = objectifs[month] || { pp_target: 0, pu_target: 0 }
  const title = 'Objectifs du mois en cours'
  const intro = profile?.role === 'manager'
    ? 'Le réalisé du cabinet provient uniquement des dossiers signés. Les dossiers en cours et prévus alimentent l’atterrissage projeté.'
    : 'Tes dossiers signés nourrissent le réalisé cabinet. Tes dossiers en cours et prévus alimentent l’atterrissage projeté.'

  return (
    <section className="stack gap-lg">
      <div className="grid grid-4">
        <KpiCard label="Dossiers du mois" value={String(monthDeals.length)} hint={`${signed.length} signés • ${pipeline.length} en cours / prévus`} />
        <KpiCard label="PP signée annualisée" value={euro(ppSigned)} hint="Réalisé cabinet" />
        <KpiCard label="PP prévisionnelle" value={euro(ppProjected)} hint="Réalisé + pipeline" />
        <KpiCard label="PU prévisionnelle" value={euro(puProjected)} hint="Réalisé + pipeline" />
      </div>

      <div className="panel panel-hero stack gap-lg">
        <div className="panel-head curve-intro-head">
          <div>
            <div className="section-kicker">Pilotage mensuel</div>
            <h2>{title}</h2>
            <div className="muted small">{intro}</div>
          </div>
          <div className="month-chip">
            <span className="muted tiny">Mois affiché</span>
            <strong>{month}</strong>
          </div>
        </div>
        <div className="grid grid-2">
          <CurvePanel title="PP annualisée" actual={ppSigned} projected={ppProjected} target={Number(monthlyTargets.pp_target || 0)} note="Lecture cabinet • réalisé vs atterrissage" />
          <CurvePanel title="PU" actual={puSigned} projected={puProjected} target={Number(monthlyTargets.pu_target || 0)} note="Lecture cabinet • réalisé vs atterrissage" />
        </div>
      </div>
    </section>
  )
}

function DealsTable({ deals, month, profile, onEdit, onDelete, onRefresh }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('Tous')

  const filtered = useMemo(() => {
    return deals
      .filter((deal) => deal.month === month)
      .filter((deal) => status === 'Tous' ? true : deal.status === status)
      .filter((deal) => {
        const hay = `${deal.client} ${deal.product} ${deal.company} ${deal.advisor_code} ${deal.co_advisor_code || ''}`.toLowerCase()
        return hay.includes(search.toLowerCase())
      })
  }, [deals, month, search, status])

  return (
    <section className="panel">
      <div className="panel-head wrap">
        <div>
          <h2>Dossiers</h2>
          <div className="muted small">{filtered.length} résultat(s) • accès limité par rôle</div>
        </div>
        <div className="toolbar wrap">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Recherche client, produit, conseiller…" />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>Tous</option>
            {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={onRefresh}>Rafraîchir</button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Produit</th>
              <th>PP annualisée</th>
              <th>PU</th>
              <th>Conseiller</th>
              <th>Statut</th>
              <th>Compagnie</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((deal) => (
              <tr key={deal.id}>
                <td>
                  <div className="cell-title">{deal.client}</div>
                  <div className="muted tiny">{deal.source || '—'}</div>
                </td>
                <td>{deal.product}</td>
                <td>
                  <strong>{euro(annualize(deal.pp_m))}</strong>
                  <div className="muted tiny">saisi {euro(deal.pp_m)} / mois</div>
                </td>
                <td>{euro(deal.pu)}</td>
                <td>
                  {deal.advisor_code}
                  {deal.co_advisor_code ? <span className="muted tiny"> • co: {deal.co_advisor_code}</span> : null}
                </td>
                <td><span className="pill" style={{ color: statColor(deal.status), borderColor: `${statColor(deal.status)}44`, background: `${statColor(deal.status)}14` }}>{deal.status}</span></td>
                <td>{deal.company || '—'}</td>
                <td>
                  <div className="row-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => onEdit(deal)}>Éditer</button>
                    <button className="btn btn-danger btn-sm" onClick={() => onDelete(deal)}>Supprimer</button>
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length ? (
              <tr>
                <td colSpan="8" className="empty-cell">Aucun dossier sur ce filtre.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="muted tiny top-margin">
        Connecté en tant que <strong>{profile?.role === 'manager' ? 'manager' : 'advisor'}</strong>. Les lignes visibles viennent des policies Supabase.
      </div>
    </section>
  )
}

function ForecastPanel({ objectifs, month, profile, teamProfiles, deals }) {
  const visibleProfiles = useMemo(() => {
    const base = (teamProfiles || []).filter((item) => item?.is_active && item?.advisor_code)
    if (profile?.role === 'manager') return base
    return base.filter((item) => item.advisor_code === profile?.advisor_code)
  }, [teamProfiles, profile])

  const title = profile?.role === 'manager' ? 'Prévisionnels équipe' : 'Prévisionnel personnel'
  const subtitle = profile?.role === 'manager'
    ? 'Vision consolidée par conseiller. Les courbes reposent uniquement sur les dossiers Signé, En cours et Prévu.'
    : 'Vision personnelle. Les courbes reposent uniquement sur tes dossiers Signé, En cours et Prévu.'

  return (
    <section className="panel panel-hero">
      <div className="panel-head align-start wrap">
        <div>
          <div className="section-kicker">Atterrissage commercial</div>
          <h2>{title}</h2>
          <div className="muted small">{subtitle}</div>
        </div>
      </div>

      <div className="stack gap-md">
        {visibleProfiles.map((item) => {
          const advisorCode = item.advisor_code
          const metrics = advisorDealMetrics(deals, month, advisorCode)
          const ppProjection = metrics.ppSigned + metrics.ppPipeline
          const puProjection = metrics.puSigned + metrics.puPipeline

          return (
            <div key={advisorCode} className="signature-row-card premium-block">
              <div className="signature-row-head">
                <div>
                  <div className="cell-title premium-name">{item.full_name || advisorCode}</div>
                  <div className="muted tiny">{advisorCode}{item.role === 'manager' ? ' • direction' : ' • conseiller'}</div>
                </div>
                <div className="metrics-inline">
                  <span className="inline-metric"><span>PP signé</span><strong>{euro(metrics.ppSigned)}</strong></span>
                  <span className="inline-metric"><span>PP projeté</span><strong>{euro(ppProjection)}</strong></span>
                  <span className="inline-metric"><span>PU projetée</span><strong>{euro(puProjection)}</strong></span>
                </div>
              </div>

              <div className="grid grid-2 top-margin">
                <CurvePanel
                  title={`PP ${advisorCode}`}
                  actual={metrics.ppSigned}
                  projected={ppProjection}
                  target={objectifs?.[month]?.pp_target || 0}
                  note="Dossiers signés, en cours et prévus uniquement"
                />
                <CurvePanel
                  title={`PU ${advisorCode}`}
                  actual={metrics.puSigned}
                  projected={puProjection}
                  target={objectifs?.[month]?.pu_target || 0}
                  note="Dossiers signés, en cours et prévus uniquement"
                />
              </div>
            </div>
          )
        })}
        {!visibleProfiles.length ? (
          <div className="notice">
            Aucun conseiller avec <code>advisor_code</code> actif n’est encore visible. Renseigne les profils dans <strong>public.profiles</strong>.
          </div>
        ) : null}
      </div>
    </section>
  )
}

function ObjectifsPanel({ objectifs, month, canEdit, onSave, profile }) {
  const [form, setForm] = useState({ pp_target: '', pu_target: '' })

  useEffect(() => {
    setForm({
      pp_target: objectifs?.[month]?.pp_target ?? '',
      pu_target: objectifs?.[month]?.pu_target ?? '',
    })
  }, [objectifs, month])

  async function submit(e) {
    e.preventDefault()
    if (!canEdit) return
    await onSave({
      pp_target: Number(form.pp_target || 0),
      pu_target: Number(form.pu_target || 0),
    })
  }

  return (
    <section className="panel panel-side">
      <div className="panel-head align-start wrap">
        <div>
          <div className="section-kicker">Référentiel cabinet</div>
          <h2>Objectifs du cabinet</h2>
          <div className="muted small">{canEdit ? 'Modification réservée à la direction.' : 'Lecture seule pour les conseillers.'}</div>
        </div>
        {!canEdit ? <div className="space-chip">Espace {profile?.advisor_code || profile?.full_name || ''}</div> : null}
      </div>

      {canEdit ? (
        <form className="stack gap-md" onSubmit={submit}>
          <div className="grid grid-2">
            <label>
              PP annualisée cible
              <input type="number" value={form.pp_target} onChange={(e) => setForm((prev) => ({ ...prev, pp_target: e.target.value }))} />
            </label>
            <label>
              PU cible
              <input type="number" value={form.pu_target} onChange={(e) => setForm((prev) => ({ ...prev, pu_target: e.target.value }))} />
            </label>
          </div>
          <button className="btn btn-primary" type="submit">Enregistrer</button>
        </form>
      ) : (
        <div className="grid grid-2">
          <div className="goal-card">
            <div className="muted">PP annualisée cible</div>
            <div className="goal-value">{euro(objectifs?.[month]?.pp_target || 0)}</div>
          </div>
          <div className="goal-card">
            <div className="muted">PU cible</div>
            <div className="goal-value">{euro(objectifs?.[month]?.pu_target || 0)}</div>
          </div>
        </div>
      )}
    </section>
  )
}

function DealModal({ open, initialDeal, profile, onClose, onSave }) {
  const [deal, setDeal] = useState(initialDeal)

  useEffect(() => {
    setDeal(initialDeal)
  }, [initialDeal])

  if (!open || !deal) return null

  function setField(name, value) {
    setDeal((prev) => ({ ...prev, [name]: value }))
  }

  async function submit(e) {
    e.preventDefault()
    await onSave(normalizeDeal(deal))
  }

  const isManager = profile?.role === 'manager'

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <h2>{initialDeal?.created_at ? 'Éditer le dossier' : 'Nouveau dossier'}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Fermer</button>
        </div>
        <form className="stack gap-md" onSubmit={submit}>
          <div className="grid grid-2">
            <label>
              Client
              <input value={deal.client || ''} onChange={(e) => setField('client', e.target.value)} required />
            </label>
            <label>
              Mois
              <select value={deal.month} onChange={(e) => setField('month', e.target.value)}>
                {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-2">
            <label>
              Produit
              <select value={deal.product} onChange={(e) => setField('product', e.target.value)}>
                {PRODUCTS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              Compagnie
              <select value={deal.company || ''} onChange={(e) => setField('company', e.target.value)}>
                {COMPANIES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-3">
            <label>
              PP mensuel (x12 = PP annualisée)
              <input type="number" value={deal.pp_m || 0} onChange={(e) => setField('pp_m', e.target.value)} />
              <span className="muted tiny">Le CRM affichera automatiquement la PP annualisée.</span>
            </label>
            <label>
              PU
              <input type="number" value={deal.pu || 0} onChange={(e) => setField('pu', e.target.value)} />
            </label>
            <label>
              Statut
              <select value={deal.status} onChange={(e) => setField('status', e.target.value)}>
                {STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-3">
            <label>
              Conseiller principal
              <input
                value={deal.advisor_code || ''}
                onChange={(e) => setField('advisor_code', e.target.value.toUpperCase())}
                placeholder={profile?.advisor_code || 'LOUIS'}
                required
                disabled={!isManager}
              />
            </label>
            <label>
              Co-conseiller
              <input value={deal.co_advisor_code || ''} onChange={(e) => setField('co_advisor_code', e.target.value.toUpperCase())} placeholder="JEAN" />
            </label>
            <label>
              Priorité
              <select value={deal.priority} onChange={(e) => setField('priority', e.target.value)}>
                {PRIORITY_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-2">
            <label>
              Email client
              <input value={deal.client_email || ''} onChange={(e) => setField('client_email', e.target.value)} type="email" />
            </label>
            <label>
              Téléphone client
              <input value={deal.client_phone || ''} onChange={(e) => setField('client_phone', e.target.value)} />
            </label>
          </div>

          <label>
            Source
            <select value={deal.source || ''} onChange={(e) => setField('source', e.target.value)}>
              {SOURCES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label>
            Notes
            <textarea rows="5" value={deal.notes || ''} onChange={(e) => setField('notes', e.target.value)} placeholder="Contexte, prochain contact, objections, pièces manquantes…" />
          </label>

          <div className="modal-actions">
            <button className="btn btn-ghost" type="button" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary" type="submit">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [teamProfiles, setTeamProfiles] = useState([])
  const [deals, setDeals] = useState([])
  const [objectifs, setObjectifs] = useState(EMPTY_OBJECTIFS)
  const [signatures, setSignatures] = useState([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(currentMonth())
  const [modalOpen, setModalOpen] = useState(false)
  const [editingDeal, setEditingDeal] = useState(null)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('vue')

  useEffect(() => {
    if (!isSupabaseConfigured) return

    let active = true

    async function boot() {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      setSession(data.session || null)
      setLoading(false)
    }

    boot()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      setDeals([])
      setTeamProfiles([])
      setSignatures([])
      return
    }
    loadEverything()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  async function loadEverything() {
    setLoading(true)
    setError('')

    const [profileRes, teamProfilesRes, dealsRes, objectifsRes, signaturesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
      supabase.from('profiles').select('id,email,full_name,role,advisor_code,is_active').order('full_name', { ascending: true }),
      supabase.from('deals').select('*').order('created_at', { ascending: false }),
      supabase.from('objectifs').select('*'),
      supabase.from('advisor_monthly_signatures').select('*').order('advisor_code', { ascending: true }),
    ])

    if (profileRes.error) setError(profileRes.error.message)
    if (teamProfilesRes.error) setError(teamProfilesRes.error.message)
    if (dealsRes.error) setError(dealsRes.error.message)
    if (objectifsRes.error) setError(objectifsRes.error.message)
    if (signaturesRes.error) setError(signaturesRes.error.message)

    setProfile(profileRes.data || null)
    setTeamProfiles(teamProfilesRes.data || [])
    setDeals(dealsRes.data || [])
    setSignatures(signaturesRes.data || [])

    const map = { ...EMPTY_OBJECTIFS }
    ;(objectifsRes.data || []).forEach((row) => {
      map[row.month] = row
    })
    setObjectifs(map)
    setLoading(false)
  }

  async function saveDeal(deal) {
    const payload = {
      ...deal,
      advisor_code: profile?.role === 'manager' ? deal.advisor_code : (profile?.advisor_code || deal.advisor_code),
      created_by: session.user.id,
    }

    const existing = deals.some((item) => item.id === deal.id)
    const query = existing
      ? supabase.from('deals').update(payload).eq('id', deal.id)
      : supabase.from('deals').insert(payload)

    const { error: saveError } = await query
    if (saveError) {
      alert(saveError.message)
      return
    }

    setModalOpen(false)
    setEditingDeal(null)
    await loadEverything()
  }

  async function deleteDeal(deal) {
    const ok = window.confirm(`Supprimer définitivement le dossier ${deal.client} ?`)
    if (!ok) return
    const { error: deleteError } = await supabase.from('deals').delete().eq('id', deal.id)
    if (deleteError) {
      alert(deleteError.message)
      return
    }
    await loadEverything()
  }

  async function saveObjectif(row) {
    const { error: saveError } = await supabase.from('objectifs').upsert(row)
    if (saveError) {
      alert(saveError.message)
      return
    }
    await loadEverything()
  }

  async function saveSignature(row) {
    const payload = {
      ...row,
      updated_by: session.user.id,
    }
    const { error: saveError } = await supabase.from('advisor_monthly_signatures').upsert(payload)
    if (saveError) {
      alert(saveError.message)
      return
    }
    await loadEverything()
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  function startCreate() {
    setEditingDeal(emptyDeal(profile?.advisor_code))
    setModalOpen(true)
  }

  function startEdit(deal) {
    setEditingDeal({ ...deal })
    setModalOpen(true)
  }

  if (!isSupabaseConfigured) return <ConfigMissing />
  if (!session) return <AuthScreen />
  if (loading) return <div className="center-screen"><div className="loading-card">Chargement du CRM…</div></div>

  return (
    <div className="app-shell">
      <Header profile={profile} month={month} setMonth={setMonth} onNewDeal={startCreate} onSignOut={signOut} />
      <main className="page">
        {error ? <div className="notice error">{error}</div> : null}
        {!profile ? (
          <div className="notice">
            Ton profil n'existe pas encore dans <code>public.profiles</code> ou n'est pas lisible. Vérifie la table <strong>profiles</strong> dans Supabase.
          </div>
        ) : null}

        <TabNav activeTab={activeTab} setActiveTab={setActiveTab} profile={profile} />

        {activeTab === 'vue' ? <Dashboard deals={deals} objectifs={objectifs} month={month} profile={profile} /> : null}

        {activeTab === 'dossiers' ? (
          <DealsTable deals={deals} month={month} profile={profile} onEdit={startEdit} onDelete={deleteDeal} onRefresh={loadEverything} />
        ) : null}

        {activeTab === 'previsionnel' ? (
          <div className="grid grid-main">
            <ForecastPanel month={month} profile={profile} teamProfiles={teamProfiles} deals={deals} />
            <ObjectifsPanel objectifs={objectifs} month={month} canEdit={profile?.role === 'manager'} onSave={saveObjectif} profile={profile} />
          </div>
        ) : null}
      </main>
      <DealModal open={modalOpen} initialDeal={editingDeal} profile={profile} onClose={() => { setModalOpen(false); setEditingDeal(null) }} onSave={saveDeal} />
    </div>
  )
}
