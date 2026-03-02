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

const theme = {
  bg: '#f6f1e8',
  panel: '#fffdf9',
  panelAlt: '#f0e7d9',
  border: '#e5d7c6',
  text: '#171411',
  muted: '#6f6457',
  accent: '#9d7a33',
  accentSoft: 'rgba(157,122,51,0.10)',
  green: '#4e8e66',
  amber: '#b67a2f',
  red: '#b25f5b',
  blue: '#6d86ae',
}

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
  if (status === 'Signé') return theme.green
  if (status === 'Prévu') return theme.blue
  if (status === 'Annulé') return theme.red
  return theme.amber
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
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint ? <div className="kpi-hint">{hint}</div> : null}
    </div>
  )
}

function Header({ profile, month, setMonth, onNewDeal, onSignOut }) {
  return (
    <header className="topbar">
      <div>
        <div className="brand-line">ENTASIS CONSEIL</div>
        <div className="muted small">CRM patrimonial • Paris 8e • ORIAS 23003153</div>
      </div>
      <div className="topbar-actions">
        <select value={month} onChange={(e) => setMonth(e.target.value)}>
          {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <button className="btn btn-secondary" onClick={onNewDeal}>Nouveau dossier</button>
        <div className="user-chip">
          <div>
            <strong>{profile?.full_name || profile?.email || 'Utilisateur'}</strong>
            <div className="muted tiny">{profile?.role === 'manager' ? 'Direction' : 'Conseiller'}{profile?.advisor_code ? ` • ${profile.advisor_code}` : ''}</div>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={onSignOut}>Déconnexion</button>
      </div>
    </header>
  )
}

function Dashboard({ deals, objectifs, month }) {
  const monthDeals = deals.filter((deal) => deal.month === month)
  const signed = monthDeals.filter((deal) => deal.status === 'Signé')
  const inProgress = monthDeals.filter((deal) => deal.status === 'En cours')
  const ppSigned = signed.reduce((sum, deal) => sum + annualize(deal.pp_m), 0)
  const puSigned = signed.reduce((sum, deal) => sum + Number(deal.pu || 0), 0)
  const monthlyTargets = objectifs[month] || { pp_target: 0, pu_target: 0 }

  return (
    <section className="stack gap-lg">
      <div className="grid grid-4">
        <KpiCard label="Dossiers du mois" value={String(monthDeals.length)} hint={`${signed.length} signés • ${inProgress.length} en cours`} />
        <KpiCard label="PP signé annualisé" value={euro(ppSigned)} hint={`Objectif ${euro(monthlyTargets.pp_target)}`} />
        <KpiCard label="PU signé" value={euro(puSigned)} hint={`Objectif ${euro(monthlyTargets.pu_target)}`} />
        <KpiCard label="Ticket moyen PU" value={euro(signed.length ? puSigned / signed.length : 0)} hint="Dossiers signés du mois" />
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Vue manager du mois</h2>
          <div className="muted small">Lecture filtrée automatiquement par rôle et par RLS.</div>
        </div>
        <div className="progress-group">
          <ProgressBar label="Objectif PP" value={ppSigned} max={monthlyTargets.pp_target} />
          <ProgressBar label="Objectif PU" value={puSigned} max={monthlyTargets.pu_target} />
        </div>
      </div>
    </section>
  )
}

function ProgressBar({ label, value, max }) {
  const ratio = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="stack gap-sm">
      <div className="progress-row">
        <span>{label}</span>
        <span>{euro(value)} / {euro(max)}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${ratio}%` }} />
      </div>
    </div>
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
              <th>PP mensuel</th>
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
                <td>{euro(annualize(deal.pp_m))}</td>
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

function ObjectifsPanel({ objectifs, month, canEdit, onSave }) {
  const [form, setForm] = useState({ pp_target: '', pu_target: '' })

  useEffect(() => {
    const row = objectifs[month] || { pp_target: 0, pu_target: 0 }
    setForm({ pp_target: row.pp_target || 0, pu_target: row.pu_target || 0 })
  }, [objectifs, month])

  async function submit(e) {
    e.preventDefault()
    await onSave({ month, pp_target: Number(form.pp_target || 0), pu_target: Number(form.pu_target || 0) })
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Objectifs mensuels</h2>
        <div className="muted small">{canEdit ? 'Modifiables par la direction' : 'Lecture seule pour les conseillers'}</div>
      </div>
      <form className="grid grid-3" onSubmit={submit}>
        <label>
          PP annualisé cible
          <input type="number" value={form.pp_target} onChange={(e) => setForm((prev) => ({ ...prev, pp_target: e.target.value }))} disabled={!canEdit} />
        </label>
        <label>
          PU cible
          <input type="number" value={form.pu_target} onChange={(e) => setForm((prev) => ({ ...prev, pu_target: e.target.value }))} disabled={!canEdit} />
        </label>
        <div className="align-end">
          <button className="btn btn-primary full-width" type="submit" disabled={!canEdit}>Enregistrer</button>
        </div>
      </form>
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
              PP mensuel
              <input type="number" value={deal.pp_m || 0} onChange={(e) => setField('pp_m', e.target.value)} />
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
              <input value={deal.advisor_code || ''} onChange={(e) => setField('advisor_code', e.target.value.toUpperCase())} placeholder={profile?.advisor_code || 'LOUIS'} required />
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
  const [deals, setDeals] = useState([])
  const [objectifs, setObjectifs] = useState(EMPTY_OBJECTIFS)
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(currentMonth())
  const [modalOpen, setModalOpen] = useState(false)
  const [editingDeal, setEditingDeal] = useState(null)
  const [error, setError] = useState('')

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
      return
    }
    loadEverything()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  async function loadEverything() {
    setLoading(true)
    setError('')

    const [profileRes, dealsRes, objectifsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
      supabase.from('deals').select('*').order('created_at', { ascending: false }),
      supabase.from('objectifs').select('*'),
    ])

    if (profileRes.error) setError(profileRes.error.message)
    if (dealsRes.error) setError(dealsRes.error.message)
    if (objectifsRes.error) setError(objectifsRes.error.message)

    setProfile(profileRes.data || null)
    setDeals(dealsRes.data || [])

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
        <Dashboard deals={deals} objectifs={objectifs} month={month} />
        <div className="grid grid-main">
          <DealsTable deals={deals} month={month} profile={profile} onEdit={startEdit} onDelete={deleteDeal} onRefresh={loadEverything} />
          <ObjectifsPanel objectifs={objectifs} month={month} canEdit={profile?.role === 'manager'} onSave={saveObjectif} />
        </div>
      </main>
      <DealModal open={modalOpen} initialDeal={editingDeal} profile={profile} onClose={() => { setModalOpen(false); setEditingDeal(null) }} onSave={saveDeal} />
    </div>
  )
}
