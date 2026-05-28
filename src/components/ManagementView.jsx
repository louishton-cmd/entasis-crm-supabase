// ═══════════════════════════════════════════════════════════════════════════
// MANAGEMENT VIEW — Pilotage équipe (remplace l'ancien ForecastView)
//
// Vue manager-only qui permet d'identifier en un coup d'œil :
//   • Les KPIs globaux du cabinet ce mois (PP/PU signées vs objectif)
//   • Les top performeurs et ceux à booster
//   • Pour chaque conseiller : ses chiffres signés/projetés, son régime,
//     son écart vs M-1
//
// Phase 2 (à venir) : croiser avec Lead Room pour les RDV passés et
// outcomes (no-shows, joints, à relancer).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import {
  advisorMetrics,
  MONTHS,
  annualize,
  dealMatchesAdvisor,
  isPipeline,
} from '../lib/metrics'
import * as contratsService from '../services/conseillerContrats'
import * as profilesService from '../services/profiles'
import { evaluerRentabilite, codesContrat, dealsDuConseiller } from '../lib/calcul-commission'

const fmtEur = (v) => Number(v || 0).toLocaleString('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
})
const pctNum = (a, b) => (b > 0 ? Math.round((Number(a || 0) / Number(b)) * 100) : 0)
const safeDiv = (a, b) => (b > 0 ? a / b : 0)

const LEADROOM_API = import.meta.env.VITE_LEADROOM_URL || 'https://entasis-leadroom.vercel.app'

export default function ManagementView({ deals, objectifs, month, profile, teamProfiles, canEditObjectifs, onSaveObjectif }) {
  const isManager = profile?.role === 'manager'
  const [formObj, setFormObj] = useState({ pp_target: '', pu_target: '' })
  useEffect(() => {
    setFormObj({
      pp_target: objectifs?.[month]?.pp_target ?? '',
      pu_target: objectifs?.[month]?.pu_target ?? '',
    })
  }, [objectifs, month])

  // Contrats des conseillers (pour calculer la rentabilité)
  const [contrats, setContrats] = useState([])
  useEffect(() => {
    let alive = true
    contratsService.list().catch(() => []).then(list => {
      if (alive) setContrats(list || [])
    })
    return () => { alive = false }
  }, [])

  // Cross-référence Lead Room : stats RDV par conseiller (matchées par email)
  const [rdvStats, setRdvStats] = useState({ loading: true, byEmail: {} })
  useEffect(() => {
    let cancelled = false
    fetch(`${LEADROOM_API}/api/admin/advisor-rdv-stats`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (cancelled || !json) return
        const byEmail = {}
        for (const s of json.stats || []) {
          if (s.email) byEmail[s.email.toLowerCase()] = s
        }
        setRdvStats({ loading: false, byEmail })
      })
      .catch(() => { if (!cancelled) setRdvStats({ loading: false, byEmail: {} }) })
    return () => { cancelled = true }
  }, [])

  // Re-fetch les profils à chaque mount, indépendamment du cache parent.
  // Sans ça, si un conseiller est ajouté/modifié dans Pilotage RH après le
  // chargement initial de l'app, il n'apparaît jamais dans Management
  // tant qu'on n'a pas hard-refresh. C'était le cas Arthur Follezou
  // (advisor_code set après l'init, donc absent jusqu'au Ctrl+Shift+R).
  const [freshProfiles, setFreshProfiles] = useState(null)
  useEffect(() => {
    let alive = true
    profilesService.listTeam().catch(() => null).then(list => {
      if (alive && Array.isArray(list)) setFreshProfiles(list)
    })
    return () => { alive = false }
  }, [])

  // Source des profils, freshProfiles si disponible (re-fetch), sinon le
  // teamProfiles passé en props (fallback pendant le 1er render).
  const sourceProfiles = freshProfiles || teamProfiles || []

  // Liste des conseillers à suivre : actifs, avec advisor_code, et PAS manager
  // (les managers se pilotent eux-mêmes, pas besoin de les voir dans leur
  // propre vue Management).
  const activeAdvisors = useMemo(
    () => sourceProfiles.filter(p =>
      p?.is_active && p?.advisor_code && p?.role !== 'manager'
    ),
    [sourceProfiles]
  )

  // Calcule les stats du mois courant + delta vs mois précédent + rentabilité
  const rows = useMemo(() => {
    const prevIdx = MONTHS.indexOf(month) - 1
    const prevMonth = prevIdx >= 0 ? MONTHS[prevIdx] : null
    return activeAdvisors.map(p => {
      const m = advisorMetrics(deals, month, p.advisor_code)
      const prev = prevMonth ? advisorMetrics(deals, prevMonth, p.advisor_code) : null
      const dPp = prev ? m.ppSigned - prev.ppSigned : 0
      const dPu = prev ? m.puSigned - prev.puSigned : 0
      const dSigned = prev ? m.signedCount - prev.signedCount : 0
      // Trouve le contrat lié au profile (via profile_id ou advisor_code)
      const contrat = contrats.find(c =>
        c.actif && (
          c.profile_id === p.id ||
          (c.profile?.advisor_code && c.profile.advisor_code === p.advisor_code)
        )
      ) || null
      // Évalue la rentabilité depuis l'embauche (cumul valeur cabinet vs salaire cumulé)
      const dealsConseiller = contrat ? dealsDuConseiller(deals, codesContrat(contrat, p)) : []
      const rentab = contrat
        ? evaluerRentabilite(contrat, dealsConseiller, p)
        : { rentabilise: true, brutCumule: 0, valeurCumulee: 0, ecart: 0 }
      return {
        profile: p,
        contrat,
        rentab,
        m,
        prev,
        dPp,
        dPu,
        dSigned,
        totalBrut: m.ppSigned + m.puSigned,
      }
    })
  }, [deals, month, activeAdvisors, contrats])

  const targets = objectifs?.[month] || { pp_target: 0, pu_target: 0 }

  // Totaux cabinet — calculés DIRECTEMENT sur les deals du mois (pas en
  // sommant les rows). Sinon on perd la part 50/50 des co-conseillers qui
  // sont des managers exclus de la liste (ex: Louis co-conseiller d'Alexis
  // → la moitié du deal disparaissait du total cabinet).
  const cabinet = useMemo(() => {
    const ofMonth = (deals || []).filter(d => d.month === month)
    const signed = ofMonth.filter(d => d.status === 'Signé')
    const pipeline = ofMonth.filter(d => isPipeline(d.status))
    const ppSigned = signed.reduce((s, d) => s + annualize(d.pp_m), 0)
    const puSigned = signed.reduce((s, d) => s + Number(d.pu || 0), 0)
    const ppProj = ppSigned + pipeline.reduce((s, d) => s + annualize(d.pp_m), 0)
    const puProj = puSigned + pipeline.reduce((s, d) => s + Number(d.pu || 0), 0)
    return {
      ppSigned, puSigned, ppProj, puProj,
      totalSigned: signed.length,
      totalPipeline: pipeline.length,
    }
  }, [deals, month])

  // Top performeurs : trie d'abord par NOMBRE de dossiers signés (le plus
  // d'activité), puis par PP signée en cas d'égalité. La PU brute ne sert
  // pas au tri car elle peut être gonflée par 1 seul gros versement (ou
  // un ordre de placement non commissionné).
  const topPerformeurs = useMemo(
    () => [...rows]
      .filter(r => r.m.signedCount > 0)
      .sort((a, b) => {
        if (b.m.signedCount !== a.m.signedCount) return b.m.signedCount - a.m.signedCount
        return b.m.ppSigned - a.m.ppSigned
      })
      .slice(0, 3),
    [rows]
  )
  // À booster : ceux qui ont 0 signature ce mois OU une chute > 50 % vs M-1
  const aBooster = useMemo(
    () => [...rows]
      .filter(r => r.m.signedCount === 0 || (r.prev && r.prev.signedCount > 0 && r.dSigned < 0))
      .sort((a, b) => a.m.signedCount - b.m.signedCount || a.m.ppSigned - b.m.ppSigned)
      .slice(0, 3),
    [rows]
  )

  async function submitObj(e) {
    e.preventDefault()
    if (!canEditObjectifs) return
    await onSaveObjectif({
      month,
      pp_target: Number(formObj.pp_target || 0),
      pu_target: Number(formObj.pu_target || 0),
    })
  }

  // Tri du tableau
  const [sortKey, setSortKey] = useState('totalBrut')
  const [sortDir, setSortDir] = useState('desc')
  const sortedRows = useMemo(() => {
    const arr = [...rows]
    arr.sort((a, b) => {
      let av, bv
      switch (sortKey) {
        case 'nom': av = a.profile.full_name || a.profile.advisor_code; bv = b.profile.full_name || b.profile.advisor_code; break
        case 'signed': av = a.m.signedCount; bv = b.m.signedCount; break
        case 'pp': av = a.m.ppSigned; bv = b.m.ppSigned; break
        case 'pu': av = a.m.puSigned; bv = b.m.puSigned; break
        case 'pipeline': av = a.m.pipelineCount; bv = b.m.pipelineCount; break
        case 'delta': av = a.dPp; bv = b.dPp; break
        case 'totalBrut':
        default: av = a.totalBrut; bv = b.totalBrut
      }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return arr
  }, [rows, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  // Drill-down : conseiller sélectionné pour vue détaillée
  const [selectedAdvisor, setSelectedAdvisor] = useState(null)

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-kicker">Pilotage équipe · {month}</div>
          <div className="section-title">Management</div>
          <div className="section-sub">
            Vue d'ensemble équipe : performances individuelles, top, retardataires.
          </div>
        </div>
      </div>

      {/* ─── KPIs globaux cabinet ──────────────────────────────────── */}
      <div className="kpi-grid mb-24">
        <KpiCard
          label="PP signée cabinet"
          value={fmtEur(cabinet.ppSigned)}
          target={targets.pp_target}
          progress={pctNum(cabinet.ppSigned, targets.pp_target)}
          accent="gold"
        />
        <KpiCard
          label="PU signée cabinet"
          value={fmtEur(cabinet.puSigned)}
          target={targets.pu_target}
          progress={pctNum(cabinet.puSigned, targets.pu_target)}
          accent="blue"
        />
        <KpiCard
          label="Dossiers signés"
          value={cabinet.totalSigned.toFixed(0)}
          hint={`${cabinet.totalPipeline} en pipeline`}
          accent="green"
        />
        <KpiCard
          label="Conseillers actifs"
          value={activeAdvisors.length}
          hint={`${rows.filter(r => r.m.signedCount > 0).length} ont signé ce mois`}
          accent="amber"
        />
      </div>

      {/* ─── MODULE DÉDIÉ RDV LEAD ROOM ─────────────────────────────── */}
      <RdvLeadRoomSection
        rdvStats={rdvStats}
        activeAdvisors={activeAdvisors}
        onSelectAdvisor={(advisorEmail) => {
          const row = rows.find(r => (r.profile.email || '').toLowerCase() === (advisorEmail || '').toLowerCase())
          if (row) setSelectedAdvisor(row)
        }}
      />

      {/* ─── HEATMAP CRÉNEAUX RDV ────────────────────────────────────── */}
      <RdvHeatmapSection />

      {/* ─── MODULE RECYCLAGE REFUSÉS ────────────────────────────────── */}
      <RecyclageRefusesSection />

      {/* ─── Top performeurs + À booster ───────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16, marginBottom: 24 }}>
        <PodiumCard
          titre="Top performeurs"
          subtitle="Les 3 conseillers avec le plus de signatures ce mois"
          rows={topPerformeurs}
          color="#10B981"
          emoji="🏆"
        />
        <PodiumCard
          titre="À booster"
          subtitle="Conseillers à 0 signature ou en chute vs mois précédent"
          rows={aBooster}
          color="#EF4444"
          emoji="⚠"
        />
      </div>

      {/* ─── Tableau performance équipe ────────────────────────────── */}
      <div className="card mb-24" style={{ overflow: 'hidden' }}>
        <div className="panel-head">
          <div>
            <div className="section-kicker">Performance équipe</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>
              Détail par conseiller · clique sur une colonne pour trier
            </div>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', minWidth: 900 }}>
            <thead>
              <tr>
                <SortableTh label="Conseiller" col="nom" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th>Type</th>
                <SortableTh label="Signés" col="signed" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <SortableTh label="PP signée" col="pp" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <SortableTh label="PU signée" col="pu" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <SortableTh label="Pipeline" col="pipeline" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <th style={{ textAlign: 'center', minWidth: 150 }}>
                  <div>RDV Lead Room</div>
                  <div style={{ fontSize: 9, fontWeight: 500, color: 'var(--t3)', marginTop: 2, letterSpacing: '0.02em', textTransform: 'none' }}>
                    <span style={{ color: '#10B981' }}>✓ tenus</span>
                    {' · '}
                    <span style={{ color: '#EF4444' }}>✗ absents</span>
                    {' · '}
                    <span>refus</span>
                    {' · '}
                    <span style={{ color: '#0071E3' }}>+à venir</span>
                  </div>
                </th>
                <th style={{ textAlign: 'center' }} title="Valeur cabinet cumulée depuis embauche vs salaire à rembourser">Rentable ?</th>
                <SortableTh label="Δ PP vs M-1" col="delta" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(r => (
                <RowConseiller
                  key={r.profile.advisor_code}
                  r={r}
                  rdv={rdvStats.byEmail[(r.profile.email || '').toLowerCase()]}
                  rdvLoading={rdvStats.loading}
                  onSelect={() => setSelectedAdvisor(r)}
                />
              ))}
              {sortedRows.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32, color: 'var(--t3)' }}>
                  Aucun conseiller actif. Vérifie que les profils ont un <code>advisor_code</code> dans <code>profiles</code>.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Drill-down conseiller (modal) ──────────────────────────── */}
      {selectedAdvisor && (
        <AdvisorDetailModal
          row={selectedAdvisor}
          deals={deals}
          month={month}
          rdv={rdvStats.byEmail[(selectedAdvisor.profile.email || '').toLowerCase()]}
          onClose={() => setSelectedAdvisor(null)}
        />
      )}

      {/* ─── Objectifs cabinet (en bas, plus compact) ──────────────── */}
      {canEditObjectifs && (
        <div className="card card-p" style={{ background: 'var(--bg)', padding: '14px 20px' }}>
          <form onSubmit={submitObj} style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--gold)', textTransform: 'uppercase', marginBottom: 4 }}>
                Objectifs cabinet · {month}
              </div>
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>S'applique au cabinet entier (pas individuel).</div>
            </div>
            <div style={{ flex: '0 0 180px' }}>
              <label className="form-label" style={{ fontSize: 11 }}>PP annualisée (€)</label>
              <input className="form-input" type="number" value={formObj.pp_target}
                onChange={e => setFormObj(p => ({ ...p, pp_target: e.target.value }))} />
            </div>
            <div style={{ flex: '0 0 180px' }}>
              <label className="form-label" style={{ fontSize: 11 }}>PU (€)</label>
              <input className="form-input" type="number" value={formObj.pu_target}
                onChange={e => setFormObj(p => ({ ...p, pu_target: e.target.value }))} />
            </div>
            <button className="btn btn-primary btn-sm" type="submit">Enregistrer</button>
          </form>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Composants internes
// ─────────────────────────────────────────────────────────────────────────
function KpiCard({ label, value, target, progress, hint, accent = 'gold' }) {
  const colors = {
    gold: { bd: 'var(--gold)', txt: 'var(--gold-dk)' },
    blue: { bd: '#0071E3', txt: '#0071E3' },
    green: { bd: '#10B981', txt: '#10B981' },
    amber: { bd: '#F59E0B', txt: '#B45309' },
  }[accent] || { bd: 'var(--gold)', txt: 'var(--gold-dk)' }
  return (
    <div className="kpi-card" style={{ borderTop: `3px solid ${colors.bd}` }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color: 'var(--t1)' }}>{value}</div>
      {target ? (
        <div style={{ marginTop: 6 }}>
          <div style={{ height: 4, background: 'rgba(0,0,0,0.05)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, progress)}%`, height: '100%', background: colors.bd, transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
            <strong style={{ color: colors.txt }}>{progress}%</strong> de {fmtEur(target)}
          </div>
        </div>
      ) : (
        <div className="kpi-hint">{hint || ''}</div>
      )}
    </div>
  )
}

function PodiumCard({ titre, subtitle, rows, color, emoji }) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${color}`, overflow: 'hidden' }}>
      <div className="panel-head">
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: color, textTransform: 'uppercase' }}>
            {emoji} {titre}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{subtitle}</div>
        </div>
      </div>
      <div className="panel-body" style={{ padding: '4px 0' }}>
        {rows.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>
            Aucun conseiller dans cette catégorie.
          </div>
        ) : rows.map((r, i) => (
          <div key={r.profile.advisor_code} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
            borderBottom: i < rows.length - 1 ? '1px solid var(--bd)' : 'none',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: `${color}1A`, color, fontWeight: 700, fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: 'var(--t1)', fontSize: 14 }}>
                {r.profile.full_name || r.profile.advisor_code}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                {r.m.signedCount} dossier{r.m.signedCount !== 1 ? 's' : ''} · {fmtEur(r.totalBrut)} prod.
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtEur(r.m.ppSigned)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--t3)' }}>PP signée</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SortableTh({ label, col, sortKey, sortDir, onSort, align }) {
  const active = sortKey === col
  return (
    <th onClick={() => onSort(col)}
      style={{ cursor: 'pointer', userSelect: 'none', textAlign: align || 'left' }}
      title={`Trier par ${label}`}>
      {label}
      <span style={{ marginLeft: 4, color: active ? 'var(--gold)' : 'var(--t3)', fontSize: 10 }}>
        {active ? (sortDir === 'asc' ? '↑' : '↓') : '⇅'}
      </span>
    </th>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Modal drill-down : détail complet d'un conseiller
// ─────────────────────────────────────────────────────────────────────────
function AdvisorDetailModal({ row, deals, month, rdv, onClose }) {
  const code = row.profile.advisor_code
  // Historique 12 mois : pour chaque mois, PP signée + nb deals
  const history12 = useMemo(() => {
    const monthIdx = MONTHS.indexOf(month)
    const last12 = []
    for (let i = 11; i >= 0; i--) {
      const idx = monthIdx - i
      if (idx < 0) continue
      const mname = MONTHS[idx]
      const m = advisorMetrics(deals, mname, code)
      last12.push({ month: mname, pp: m.ppSigned, pu: m.puSigned, count: m.signedCount })
    }
    return last12
  }, [deals, month, code])

  // Derniers deals signés (top 8)
  const recentDeals = useMemo(() => {
    return deals
      .filter(d => d.status === 'Signé' && dealMatchesAdvisor(d, code))
      .slice()
      .sort((a, b) => {
        const da = a.date_signed ? new Date(a.date_signed).getTime() : 0
        const db = b.date_signed ? new Date(b.date_signed).getTime() : 0
        return db - da
      })
      .slice(0, 8)
  }, [deals, code])

  const maxPp = Math.max(1, ...history12.map(h => h.pp))

  return (
    <div className="modal-overlay" onClick={onClose} style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 900, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-head" style={{ position: 'sticky', top: 0, background: 'white', zIndex: 10, borderBottom: '1px solid var(--bd)' }}>
          <div>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-dk) 100%)',
                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 16,
              }}>
                {(row.profile.full_name || code).split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div>{row.profile.full_name || code}</div>
                <div style={{ fontSize: 12, color: 'var(--t3)', fontWeight: 400, marginTop: 2 }}>
                  {code} · {row.profile.role === 'manager' ? 'Manager' : 'Conseiller'}
                </div>
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ padding: 20 }}>
          {/* Rentabilité (si salarié) */}
          {row.contrat && Number(row.contrat.salaire_brut_mensuel || 0) > 0 && (
            <div className="card" style={{ marginBottom: 24, borderTop: `3px solid ${row.rentab.rentabilise ? '#10B981' : '#EF4444'}` }}>
              <div style={{ padding: '14px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: row.rentab.rentabilise ? '#10B981' : '#EF4444', textTransform: 'uppercase' }}>
                      {row.rentabilise ? 'Rentabilité confirmée' : 'En cours de rentabilisation'}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginTop: 4 }}>
                      {row.rentab.rentabilise
                        ? `✅ Conseiller rentable depuis son embauche`
                        : `⏳ Manque ${fmtEur(Math.max(0, row.rentab.brutCumule - row.rentab.valeurCumulee))} avant de rentabiliser son salaire`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--t1)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtEur(row.rentab.valeurCumulee)}
                      <span style={{ fontSize: 14, color: 'var(--t3)', fontWeight: 500 }}> / {fmtEur(row.rentab.brutCumule)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                      Valeur cabinet cumulée / Salaire à rembourser
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 12, height: 8, background: 'rgba(0,0,0,0.05)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    width: `${row.rentab.brutCumule > 0 ? Math.min(100, (row.rentab.valeurCumulee / row.rentab.brutCumule) * 100) : 0}%`,
                    height: '100%',
                    background: row.rentab.rentabilise
                      ? 'linear-gradient(90deg, #10B981 0%, #059669 100%)'
                      : 'linear-gradient(90deg, var(--gold) 0%, var(--gold-dk, #A6843F) 100%)',
                    transition: 'width 0.5s',
                  }} />
                </div>
              </div>
            </div>
          )}

          {/* KPIs du mois */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
            <MiniKpi label="Signés" value={row.m.signedCount.toFixed(0)} color="#10B981" />
            <MiniKpi label="PP signée" value={fmtEur(row.m.ppSigned)} color="var(--gold)" />
            <MiniKpi label="PU signée" value={fmtEur(row.m.puSigned)} color="#0071E3" />
            <MiniKpi label="Pipeline" value={fmtEur(row.m.ppPipeline)} color="#F59E0B" hint={`${row.m.pipelineCount} dossiers`} />
            <MiniKpi
              label="Δ PP vs M-1"
              value={`${row.dPp >= 0 ? '+' : ''}${fmtEur(row.dPp)}`}
              color={row.dPp >= 0 ? '#10B981' : '#EF4444'}
              hint="Variation PP signée"
            />
            <MiniKpi
              label="Δ PU vs M-1"
              value={`${row.dPu >= 0 ? '+' : ''}${fmtEur(row.dPu)}`}
              color={row.dPu >= 0 ? '#10B981' : '#EF4444'}
              hint="Variation PU signée"
            />
          </div>

          {/* Histo PP 12 mois */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="panel-head">
              <div>
                <div className="section-kicker">Tendance PP signée · 12 derniers mois</div>
              </div>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-end', gap: 6, height: 140 }}>
              {history12.map(h => {
                const heightPct = (h.pp / maxPp) * 100
                const isCurrent = h.month === month
                return (
                  <div key={h.month} style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                    <div title={`${h.month} · ${fmtEur(h.pp)} · ${h.count.toFixed(0)} dossiers`}
                      style={{
                        height: `${Math.max(2, heightPct)}%`,
                        background: isCurrent ? 'var(--gold)' : 'rgba(0,0,0,0.15)',
                        borderRadius: '4px 4px 0 0',
                        minHeight: 2,
                        transition: 'height 0.4s',
                      }} />
                    <div style={{ fontSize: 10, color: isCurrent ? 'var(--gold-dk)' : 'var(--t3)', fontWeight: isCurrent ? 700 : 500, marginTop: 4 }}>
                      {h.month.slice(0, 3)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* RDV Lead Room — outcomes */}
          {rdv && (rdv.total_rdv_passes > 0 || rdv.upcoming > 0) && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="panel-head">
                <div>
                  <div className="section-kicker">RDV Lead Room</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
                    {rdv.total_rdv_passes} RDV passés · {rdv.upcoming} à venir
                  </div>
                </div>
              </div>
              <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
                <MiniKpi label="RDV tenus" value={rdv.joined} color="#10B981" />
                <MiniKpi label="Absents" value={rdv.no_show} color="#EF4444" />
                <MiniKpi label="Refus" value={rdv.refused} color="var(--t2)" />
                <MiniKpi label="Signés" value={rdv.signed} color="var(--gold)" />
                <MiniKpi label="À venir" value={rdv.upcoming} color="#0071E3" />
              </div>
              {rdv.recent_rdvs && rdv.recent_rdvs.length > 0 && (
                <div style={{ borderTop: '1px solid var(--bd)', padding: '12px 20px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                    Derniers RDV
                  </div>
                  {rdv.recent_rdvs.map(r => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: 'var(--t1)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--t3)' }}>{r.campaign || '—'}</div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {new Date(r.rdv_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </div>
                      <RdvOutcomeBadge outcome={r.outcome} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Derniers deals signés */}
          <div className="card">
            <div className="panel-head">
              <div>
                <div className="section-kicker">Derniers dossiers signés</div>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
                  {recentDeals.length} dossier{recentDeals.length !== 1 ? 's' : ''} récent{recentDeals.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Produit</th>
                    <th style={{ textAlign: 'right' }}>PP/an</th>
                    <th style={{ textAlign: 'right' }}>PU</th>
                    <th>Signé le</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDeals.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--t3)', fontSize: 13 }}>
                      Aucun dossier signé pour ce conseiller.
                    </td></tr>
                  ) : recentDeals.map(d => (
                    <tr key={d.id}>
                      <td className="cell-primary">{d.client || '—'}</td>
                      <td>
                        <div>{d.product || '—'}</div>
                        <div className="cell-sub">{d.company || ''}</div>
                      </td>
                      <td className="cell-mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                        {fmtEur(annualize(d.pp_m))}
                      </td>
                      <td className="cell-mono" style={{ textAlign: 'right' }}>
                        {d.pu > 0 ? fmtEur(d.pu) : '—'}
                      </td>
                      <td className="cell-mono" style={{ fontSize: 12, color: 'var(--t2)' }}>
                        {d.date_signed ? new Date(d.date_signed).toLocaleDateString('fr-FR') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function RentabiliteBadge({ contrat, rentab }) {
  // Pas de contrat → on ne sait pas (souvent un manager sans contrat suivi)
  if (!contrat) {
    return <span style={{ fontSize: 10, color: 'var(--t3)' }}>—</span>
  }
  // Mandataire / gérant : pas de salaire à rembourser
  const sansSalaire = !contrat.salaire_brut_mensuel || Number(contrat.salaire_brut_mensuel) <= 0
  if (sansSalaire) {
    return (
      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(201,169,97,0.15)', color: 'var(--gold-dk, #A6843F)' }}
        title="Mandataire / sans salaire — pas de seuil applicable">
        N/A
      </span>
    )
  }
  const pct = rentab.brutCumule > 0 ? Math.min(100, (rentab.valeurCumulee / rentab.brutCumule) * 100) : 0
  const isRentable = rentab.rentabilise
  const ecartLabel = isRentable
    ? `✅ Rentable (+${Math.round((rentab.ecart / rentab.brutCumule) * 100) || 0}%)`
    : `${Math.round(pct)}% du seuil`
  const fmt = (v) => Number(v || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
      title={`Valeur cabinet cumulée : ${fmt(rentab.valeurCumulee)} / Salaire cumulé : ${fmt(rentab.brutCumule)}`}>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
        background: isRentable ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)',
        color: isRentable ? '#10B981' : '#EF4444',
        whiteSpace: 'nowrap',
      }}>
        {isRentable ? '✓ OUI' : '✗ NON'}
      </span>
      <span style={{ fontSize: 10, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
        {ecartLabel}
      </span>
    </div>
  )
}

function RdvOutcomeBadge({ outcome }) {
  const o = (outcome || '').toLowerCase()
  const map = {
    joined: { label: 'RDV tenu', bg: 'rgba(16,185,129,0.12)', color: '#10B981' },
    joint: { label: 'RDV tenu', bg: 'rgba(16,185,129,0.12)', color: '#10B981' },
    no_show: { label: 'Absent', bg: 'rgba(239,68,68,0.12)', color: '#EF4444' },
    noshow: { label: 'Absent', bg: 'rgba(239,68,68,0.12)', color: '#EF4444' },
    'no-show': { label: 'Absent', bg: 'rgba(239,68,68,0.12)', color: '#EF4444' },
    not_joined: { label: 'Absent', bg: 'rgba(239,68,68,0.12)', color: '#EF4444' },
    refused: { label: 'Refus', bg: 'rgba(0,0,0,0.06)', color: 'var(--t2)' },
    refus: { label: 'Refus', bg: 'rgba(0,0,0,0.06)', color: 'var(--t2)' },
    signed: { label: 'Signé', bg: 'rgba(201,169,97,0.15)', color: 'var(--gold-dk)' },
    signé: { label: 'Signé', bg: 'rgba(201,169,97,0.15)', color: 'var(--gold-dk)' },
  }
  const v = map[o]
  if (!v) {
    return <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.04)', color: 'var(--t3)' }}>—</span>
  }
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: v.bg, color: v.color, letterSpacing: '0.02em' }}>{v.label}</span>
}

function MiniKpi({ label, value, color, hint }) {
  return (
    <div style={{
      background: 'var(--bg)', padding: '12px 14px', borderRadius: 'var(--rad)',
      borderTop: `2px solid ${color}`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

function RowConseiller({ r, rdv, rdvLoading, onSelect }) {
  const code = r.profile.advisor_code
  const typeContrat = r.profile.role === 'manager' ? 'Manager' : 'Conseiller'
  const isAlerte = r.m.signedCount === 0
  return (
    <tr style={{ background: isAlerte ? 'rgba(239,68,68,0.03)' : undefined, cursor: 'pointer' }}
        onClick={onSelect}
        title="Clic pour voir le détail">
      <td>
        <div className="cell-primary">{r.profile.full_name || code}</div>
        <div className="cell-sub" style={{ fontFamily: 'monospace' }}>{code}</div>
      </td>
      <td>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
          background: 'var(--bg)', color: 'var(--t2)',
        }}>{typeContrat}</span>
      </td>
      <td className="cell-mono" style={{ textAlign: 'right', fontWeight: 600 }}>
        {r.m.signedCount.toFixed(r.m.signedCount % 1 === 0 ? 0 : 1)}
      </td>
      <td className="cell-mono" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtEur(r.m.ppSigned)}</td>
      <td className="cell-mono" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtEur(r.m.puSigned)}</td>
      <td className="cell-mono" style={{ textAlign: 'right', color: 'var(--t3)' }}>{fmtEur(r.m.ppPipeline)}</td>
      <td style={{ textAlign: 'center', fontSize: 11 }}>
        {rdvLoading ? (
          <span style={{ color: 'var(--t3)' }}>…</span>
        ) : rdv ? (
          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap' }}
               title={`${rdv.joined} RDV tenus · ${rdv.no_show} absents · ${rdv.refused} refus${rdv.upcoming > 0 ? ` · ${rdv.upcoming} à venir` : ''}`}>
            <span style={{ color: '#10B981', fontWeight: 700 }}>✓{rdv.joined}</span>
            <span style={{ color: '#EF4444', fontWeight: 700 }}>✗{rdv.no_show}</span>
            <span style={{ color: 'var(--t3)', fontWeight: 600 }}>·{rdv.refused}</span>
            {rdv.upcoming > 0 && (
              <span style={{ marginLeft: 2, padding: '1px 5px', borderRadius: 3, background: 'rgba(0,113,227,0.10)', color: '#0071E3', fontWeight: 600, fontSize: 10 }}>
                +{rdv.upcoming}
              </span>
            )}
          </div>
        ) : (
          <span style={{ color: 'var(--t3)' }}>—</span>
        )}
      </td>
      <td style={{ textAlign: 'center', fontSize: 11 }}>
        <RentabiliteBadge contrat={r.contrat} rentab={r.rentab} />
      </td>
      <td className="cell-mono" style={{ textAlign: 'right' }}>
        {r.prev ? (
          <span style={{
            color: r.dPp > 0 ? '#10B981' : r.dPp < 0 ? '#EF4444' : 'var(--t3)',
            fontWeight: 600,
          }}>
            {r.dPp > 0 ? '+' : ''}{fmtEur(r.dPp)}
          </span>
        ) : (
          <span style={{ color: 'var(--t3)' }}>—</span>
        )}
      </td>
      <td>
        {isAlerte ? (
          <span className="badge" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
            À booster
          </span>
        ) : r.m.signedCount >= 3 ? (
          <span className="badge badge-signed">Au top</span>
        ) : (
          <span className="badge" style={{ background: 'var(--bg)', color: 'var(--t2)' }}>OK</span>
        )}
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// MODULE RDV LEAD ROOM — Section dédiée demandée par Louis 28/05/2026.
// Vue manager focalisée sur l'activité RDV des conseillers, taux de
// notation, taux d'absent, taux de conversion (signés/tenus), RDV à noter.
//
// Source des données, /api/admin/advisor-rdv-stats (Lead Room) qui fournit
// pour chaque advisor, joined / no_show / refused / signed / to_note /
// past_7d / upcoming + total_rdv_passes.
// ─────────────────────────────────────────────────────────────────────────
function RdvLeadRoomSection({ rdvStats, activeAdvisors, onSelectAdvisor }) {
  // Drill-down sur les KPIs RDV. State = bucket courant (null = fermée).
  // Buckets, passes / tenus / absents / signes / a_noter / pipe_perdus / a_venir
  const [drilldownBucket, setDrilldownBucket] = useState(null)

  const rdvRows = useMemo(() => {
    return (activeAdvisors || [])
      .map(p => {
        const r = rdvStats.byEmail[(p.email || '').toLowerCase()]
        if (!r) return null
        const noted = (r.joined || 0) + (r.no_show || 0) + (r.refused || 0) + (r.signed || 0)
        const total = r.total_rdv_passes || 0
        const pctNoted = total > 0 ? Math.round((noted / total) * 100) : 0
        const pctAbsent = total > 0 ? Math.round(((r.no_show || 0) / total) * 100) : 0
        const pctConv = (r.joined || 0) > 0 ? Math.round(((r.signed || 0) / r.joined) * 100) : 0
        return {
          profile: p,
          stats: r,
          noted,
          total,
          pctNoted,
          pctAbsent,
          pctConv,
        }
      })
      .filter(Boolean)
  }, [rdvStats, activeAdvisors])

  // KPIs cabinet (somme de tous les conseillers actifs visibles)
  const cabinet = useMemo(() => {
    const agg = { past: 0, tenus: 0, absents: 0, refus: 0, signes: 0, aNoter: 0, futur: 0, absentsCovered: 0, absentsUncovered: 0 }
    for (const r of rdvRows) {
      agg.past += r.total
      agg.tenus += r.stats.joined || 0
      agg.absents += r.stats.no_show || 0
      agg.refus += r.stats.refused || 0
      agg.signes += r.stats.signed || 0
      agg.aNoter += r.stats.to_note || 0
      agg.futur += r.stats.upcoming || 0
      agg.absentsCovered += r.stats.no_show_with_callback || 0
      agg.absentsUncovered += r.stats.no_show_without_callback || 0
    }
    const noted = agg.tenus + agg.absents + agg.refus + agg.signes
    return {
      ...agg,
      pctNoted: agg.past > 0 ? Math.round((noted / agg.past) * 100) : 0,
      pctAbsent: agg.past > 0 ? Math.round((agg.absents / agg.past) * 100) : 0,
      pctConv: agg.tenus > 0 ? Math.round((agg.signes / agg.tenus) * 100) : 0,
      pctRecovery: agg.absents > 0 ? Math.round((agg.absentsCovered / agg.absents) * 100) : 0,
    }
  }, [rdvRows])

  // Tri : par à noter desc (priorité manager), puis par RDV passés desc
  const sortedRows = useMemo(
    () => [...rdvRows].sort((a, b) => {
      if (b.stats.to_note !== a.stats.to_note) return (b.stats.to_note || 0) - (a.stats.to_note || 0)
      return b.total - a.total
    }),
    [rdvRows]
  )

  if (rdvStats.loading) {
    return (
      <div className="card mb-24" style={{ padding: 24, textAlign: 'center', color: 'var(--t3)' }}>
        Chargement des stats RDV Lead Room…
      </div>
    )
  }
  if (rdvRows.length === 0) {
    return null
  }

  return (
    <div className="card mb-24" style={{ overflow: 'hidden', borderTop: '3px solid #0071E3' }}>
      <div className="panel-head">
        <div>
          <div className="section-kicker" style={{ color: '#0071E3' }}>📞 Module RDV Lead Room</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>
            Pilotage activité commerciale & notation
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
            Vue globale des RDV pris via la Lead Room. Clique sur une ligne pour le détail conseiller.
          </div>
        </div>
      </div>

      {/* ─── KPIs cabinet RDV (tous cliquables pour drill-down) ─────── */}
      <div style={{ padding: '12px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, borderBottom: '1px solid var(--bd)' }}>
        <ClickableRdvKpi label="RDV passés" value={cabinet.past} color="var(--t1)"
          hint={`${cabinet.futur} à venir`}
          onClick={() => setDrilldownBucket('passes')} />
        <ClickableRdvKpi label="✓ Tenus" value={cabinet.tenus} color="#10B981"
          hint="Clique pour la liste"
          onClick={() => setDrilldownBucket('tenus')} />
        <ClickableRdvKpi label="✗ Absents" value={cabinet.absents} color="#EF4444"
          hint={cabinet.pctAbsent > 0 ? `${cabinet.pctAbsent}% de no-show` : 'Aucun'}
          alert={cabinet.pctAbsent >= 40}
          onClick={() => setDrilldownBucket('absents')} />
        <ClickableRdvKpi label="💎 Signés" value={cabinet.signes} color="var(--gold-dk, #A6843F)"
          hint={cabinet.pctConv > 0 ? `${cabinet.pctConv}% conversion` : 'Aucun'}
          onClick={() => setDrilldownBucket('signes')} />
        <ClickableRdvKpi label="⚠ À noter" value={cabinet.aNoter} color="#F59E0B"
          hint="Saisie manquante"
          alert={cabinet.aNoter > 0}
          onClick={() => setDrilldownBucket('a_noter')} />
        {/* % Notation, pas drillable (c'est un dérivé), pas de onClick */}
        <RdvMiniKpi label="% Notation" value={`${cabinet.pctNoted}%`}
          color={cabinet.pctNoted === 100 ? '#10B981' : cabinet.pctNoted >= 80 ? '#F59E0B' : '#EF4444'}
          hint={cabinet.pctNoted < 100 ? 'Objectif 100 %' : 'Parfait'} />
        <ClickableRdvKpi label="📞 Pipe rappel" value={cabinet.absentsCovered}
          color="#0071E3"
          hint={cabinet.absentsUncovered > 0
            ? `${cabinet.absentsUncovered} perdu${cabinet.absentsUncovered > 1 ? 's' : ''} sans rappel`
            : 'Tous couverts ✓'}
          alert={cabinet.absentsUncovered > 0}
          onClick={() => setDrilldownBucket('pipe_perdus')} />
      </div>

      {/* Modal drill-down universel — selon bucket cliqué */}
      {drilldownBucket && (
        <RdvBucketDrilldownModal
          bucket={drilldownBucket}
          onClose={() => setDrilldownBucket(null)} />
      )}

      {/* ─── Tableau par conseiller ───────────────────────── */}
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ width: '100%', minWidth: 900 }}>
          <thead>
            <tr>
              <th>Conseiller</th>
              <th style={{ textAlign: 'right' }} title="RDV passés (total)">Passés</th>
              <th style={{ textAlign: 'right', color: '#10B981' }} title="RDV où le client s'est présenté">✓ Tenus</th>
              <th style={{ textAlign: 'right', color: '#EF4444' }} title="Client absent (no-show)">✗ Absents</th>
              <th style={{ textAlign: 'right' }} title="Refus client">Refus</th>
              <th style={{ textAlign: 'right', color: 'var(--gold-dk, #A6843F)' }} title="Contrat signé suite au RDV">💎 Signés</th>
              <th style={{ textAlign: 'right', color: '#F59E0B' }} title="RDV passés non notés (saisie manquante)">⚠ À noter</th>
              <th style={{ textAlign: 'right', color: '#0071E3' }} title="Absents avec rappel programmé / total absents — protection contre la perte de lead">📞 Pipe rappel</th>
              <th style={{ textAlign: 'right' }} title="Saisie correcte / total — Objectif 100 %">% Not.</th>
              <th style={{ textAlign: 'right' }} title="Taux de présence client (tenus / passés)">% Prés.</th>
              <th style={{ textAlign: 'right' }} title="Conversion Signés / Tenus">% Conv.</th>
              <th style={{ textAlign: 'right' }} title="RDV à venir (futur)">À venir</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(r => {
              const pctPresence = r.total > 0 ? Math.round(((r.stats.joined || 0) / r.total) * 100) : 0
              const isAlerte = (r.stats.to_note || 0) > 0
              const isAbsentChronique = r.total >= 5 && r.pctAbsent >= 50
              return (
                <tr key={r.profile.id} style={{ cursor: 'pointer', background: isAlerte ? 'rgba(245,158,11,0.05)' : undefined }}
                    onClick={() => onSelectAdvisor && onSelectAdvisor(r.profile.email)}
                    title="Clic pour voir le détail conseiller">
                  <td>
                    <div className="cell-primary">{r.profile.full_name || r.profile.advisor_code}</div>
                    <div className="cell-sub" style={{ fontFamily: 'monospace' }}>{r.profile.advisor_code}</div>
                  </td>
                  <td className="cell-mono" style={{ textAlign: 'right', fontWeight: 600 }}>{r.total}</td>
                  <td className="cell-mono" style={{ textAlign: 'right', color: '#10B981', fontWeight: 600 }}>{r.stats.joined || 0}</td>
                  <td className="cell-mono" style={{ textAlign: 'right', color: '#EF4444', fontWeight: 600 }}>{r.stats.no_show || 0}</td>
                  <td className="cell-mono" style={{ textAlign: 'right', color: 'var(--t3)' }}>{r.stats.refused || 0}</td>
                  <td className="cell-mono" style={{ textAlign: 'right', color: 'var(--gold-dk, #A6843F)', fontWeight: 700 }}>{r.stats.signed || 0}</td>
                  <td className="cell-mono" style={{ textAlign: 'right' }}>
                    {r.stats.to_note > 0 ? (
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                        background: 'rgba(245,158,11,0.15)', color: '#B45309',
                      }}>
                        {r.stats.to_note}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--t3)' }}>0</span>
                    )}
                  </td>
                  <td className="cell-mono" style={{ textAlign: 'right', fontSize: 11 }}>
                    {(r.stats.no_show || 0) === 0 ? (
                      <span style={{ color: 'var(--t3)' }}>—</span>
                    ) : (
                      <span title={`${r.stats.no_show_with_callback || 0} avec rappel programmé / ${r.stats.no_show_without_callback || 0} sans rappel`}>
                        <span style={{ color: '#0071E3', fontWeight: 700 }}>{r.stats.no_show_with_callback || 0}</span>
                        <span style={{ color: 'var(--t3)' }}> / </span>
                        <span style={{ color: (r.stats.no_show_without_callback || 0) > 0 ? '#EF4444' : 'var(--t3)', fontWeight: (r.stats.no_show_without_callback || 0) > 0 ? 700 : 400 }}>
                          {r.stats.no_show_without_callback || 0}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="cell-mono" style={{ textAlign: 'right' }}>
                    <PctBadge value={r.pctNoted} reverseColor={false} />
                  </td>
                  <td className="cell-mono" style={{ textAlign: 'right' }}>
                    <PctBadge value={pctPresence} reverseColor={false} />
                  </td>
                  <td className="cell-mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                    {(r.stats.joined || 0) > 0 ? (
                      <span style={{ color: r.pctConv >= 30 ? '#10B981' : r.pctConv > 0 ? 'var(--t1)' : 'var(--t3)' }}>
                        {r.pctConv}%
                      </span>
                    ) : (
                      <span style={{ color: 'var(--t3)' }}>—</span>
                    )}
                  </td>
                  <td className="cell-mono" style={{ textAlign: 'right' }}>
                    {(r.stats.upcoming || 0) > 0 ? (
                      <span style={{
                        padding: '1px 6px', borderRadius: 3, fontSize: 11,
                        background: 'rgba(0,113,227,0.10)', color: '#0071E3', fontWeight: 600,
                      }}>
                        +{r.stats.upcoming}
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    {isAlerte ? (
                      <span className="badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#B45309' }}>
                        Saisie KO
                      </span>
                    ) : isAbsentChronique ? (
                      <span className="badge" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
                        No-show élevé
                      </span>
                    ) : r.pctConv >= 30 ? (
                      <span className="badge badge-signed">Convertit</span>
                    ) : (
                      <span className="badge" style={{ background: 'var(--bg)', color: 'var(--t2)' }}>RAS</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// KPI cliquable — variante visuelle du RdvMiniKpi avec hover + curseur
// pointer + indicateur "🔍 Clic" pour montrer qu'on peut drill-down.
function ClickableRdvKpi({ label, value, color, hint, alert, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: alert ? 'rgba(245,158,11,0.07)' : hover ? 'rgba(0,113,227,0.05)' : 'var(--bg)',
        padding: '10px 12px', borderRadius: 'var(--rad)',
        borderTop: `2px solid ${color}`,
        cursor: 'pointer',
        transition: 'all 0.15s',
        transform: hover ? 'translateY(-1px)' : 'none',
        boxShadow: hover ? '0 4px 12px rgba(0,0,0,0.06)' : 'none',
        position: 'relative',
      }}
      title="Clique pour voir le détail">
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 10, color: hover ? '#0071E3' : 'var(--t3)', marginTop: 2, fontWeight: hover ? 600 : 400 }}>
        {hover ? '🔍 Clic pour le détail' : (hint || '')}
      </div>
    </div>
  )
}

// Mini-KPI dédié au module RDV (style légèrement différent des autres
// pour bien distinguer la section)
function RdvMiniKpi({ label, value, color, hint, alert }) {
  return (
    <div style={{
      background: alert ? 'rgba(245,158,11,0.07)' : 'var(--bg)',
      padding: '10px 12px', borderRadius: 'var(--rad)',
      borderTop: `2px solid ${color}`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

// Badge pourcentage avec code couleur (vert=bon, orange=moyen, rouge=mauvais)
function PctBadge({ value, reverseColor = false }) {
  const v = Number(value || 0)
  const isGood = reverseColor ? v <= 30 : v >= 80
  const isMid = reverseColor ? v <= 60 : v >= 50
  const color = isGood ? '#10B981' : isMid ? '#F59E0B' : '#EF4444'
  return (
    <span style={{
      padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700,
      background: `${color}1A`, color,
    }}>
      {v}%
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// HEATMAP CRÉNEAUX RDV — Identifie les meilleurs et pires créneaux
// (jour de la semaine × heure) selon le taux de tenue / no-show.
// Source, /api/admin/rdv-heatmap (90 derniers jours).
// Demandé par Louis 28/05/2026 (#7 dans la liste des 7 améliorations).
// ─────────────────────────────────────────────────────────────────────────
const DAYS_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const BIZ_HOURS = Array.from({ length: 13 }, (_, i) => i + 7) // 7h à 19h

function RdvHeatmapSection() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [metric, setMetric] = useState('tenue') // 'tenue' | 'no_show'

  useEffect(() => {
    fetch(`${LEADROOM_API}/api/admin/rdv-heatmap?days=90`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(json => setData(json))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Index par day-hour
  const byKey = useMemo(() => {
    const m = new Map()
    for (const b of (data?.buckets || [])) m.set(`${b.day}-${b.hour}`, b)
    return m
  }, [data])

  // Stats globales pour les top/flop
  const insights = useMemo(() => {
    if (!data?.buckets?.length) return null
    const significant = data.buckets.filter(b => b.total >= 3) // au moins 3 RDV pour être statistiquement valide
    if (significant.length === 0) return null
    const sortedByTenue = [...significant].sort((a, b) => b.pct_tenue - a.pct_tenue)
    const sortedByNoShow = [...significant].sort((a, b) => b.pct_no_show - a.pct_no_show)
    return {
      bestSlots: sortedByTenue.slice(0, 3),
      worstSlots: sortedByNoShow.slice(0, 3),
    }
  }, [data])

  // Couleur d'une cellule selon le score
  function cellColor(b) {
    if (!b || b.total === 0) return { bg: 'rgba(0,0,0,0.02)', txt: 'var(--t3)' }
    const score = metric === 'tenue' ? b.pct_tenue : 100 - b.pct_no_show
    // 0 = rouge, 50 = jaune, 100 = vert
    if (score >= 70) return { bg: 'rgba(16,185,129,0.35)', txt: '#065F46' }
    if (score >= 50) return { bg: 'rgba(245,158,11,0.30)', txt: '#92400E' }
    if (score >= 30) return { bg: 'rgba(239,68,68,0.20)', txt: '#7F1D1D' }
    return { bg: 'rgba(239,68,68,0.40)', txt: '#7F1D1D' }
  }

  return (
    <div className="card mb-24" style={{ overflow: 'hidden', borderTop: '3px solid #8B5CF6' }}>
      <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="section-kicker" style={{ color: '#8B5CF6' }}>📅 Heatmap créneaux RDV</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>
            Meilleurs créneaux par jour × heure (90 derniers jours)
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
            {loading ? 'Chargement…' : data ? `${data.total_rdv} RDV analysés` : 'Pas de données'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setMetric('tenue')} className={`btn btn-sm ${metric === 'tenue' ? 'btn-primary' : 'btn-ghost'}`}>
            Taux tenue
          </button>
          <button onClick={() => setMetric('no_show')} className={`btn btn-sm ${metric === 'no_show' ? 'btn-primary' : 'btn-ghost'}`}>
            Taux no-show
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 16, background: 'rgba(239,68,68,0.1)', color: '#EF4444', textAlign: 'center' }}>
          Erreur, {error}
        </div>
      )}

      {!loading && data && (
        <>
          {/* Insights top 3 / flop 3 */}
          {insights && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--bd)' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  🏆 Meilleurs créneaux
                </div>
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  {insights.bestSlots.map((s, i) => (
                    <div key={i} style={{ marginTop: 4 }}>
                      <strong>{DAYS_LABELS[s.day]} {s.hour}h</strong> · {s.pct_tenue}% de tenue ({s.total} RDV)
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  ⚠ Créneaux à éviter (no-show)
                </div>
                <div style={{ fontSize: 12, marginTop: 6 }}>
                  {insights.worstSlots.map((s, i) => (
                    <div key={i} style={{ marginTop: 4 }}>
                      <strong>{DAYS_LABELS[s.day]} {s.hour}h</strong> · {s.pct_no_show}% d'absent ({s.total} RDV)
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Heatmap grid */}
          <div style={{ padding: 16, overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 3, margin: '0 auto' }}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}></th>
                  {BIZ_HOURS.map(h => (
                    <th key={h} style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, padding: '2px 0', textAlign: 'center', width: 40 }}>
                      {h}h
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5, 6].map(day => ( // Lundi à Samedi (skip Dimanche, peu de data)
                  <tr key={day}>
                    <td style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', padding: '0 6px 0 0', textAlign: 'right' }}>
                      {DAYS_LABELS[day]}
                    </td>
                    {BIZ_HOURS.map(h => {
                      const b = byKey.get(`${day}-${h}`)
                      const c = cellColor(b)
                      const score = b ? (metric === 'tenue' ? b.pct_tenue : b.pct_no_show) : null
                      return (
                        <td key={h} title={b
                          ? `${DAYS_LABELS[day]} ${h}h · ${b.total} RDV · ${b.joined} tenus · ${b.not_joined} absents · ${b.refused} refus · ${b.signed} signés`
                          : `${DAYS_LABELS[day]} ${h}h · 0 RDV`
                        }
                        style={{
                          width: 40, height: 28, textAlign: 'center', fontSize: 10, fontWeight: 700,
                          background: c.bg, color: c.txt, borderRadius: 4,
                        }}>
                          {b && b.total > 0 ? (
                            <div>
                              <div>{score}%</div>
                              <div style={{ fontSize: 8, fontWeight: 400, opacity: 0.7 }}>{b.total}</div>
                            </div>
                          ) : '—'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--t3)', textAlign: 'center' }}>
              {metric === 'tenue'
                ? "Vert = bon taux de tenue · Rouge = beaucoup d'absents. Le petit chiffre = nombre de RDV total sur ce créneau."
                : "Vert = peu de no-show · Rouge = beaucoup de no-show."}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// RECYCLAGE REFUSÉS — Pipe gratuit, recontacter les leads qui ont refusé
// il y a >60 jours (peut-être un "pas maintenant" et pas un "jamais").
// Demandé par Louis 28/05/2026 (#4 dans la liste des 7 améliorations).
// ─────────────────────────────────────────────────────────────────────────
function RecyclageRefusesSection() {
  const [data, setData] = useState({ count: 0, leads: [], by_campaign: {}, min_days: 60 })
  const [loading, setLoading] = useState(false)
  const [minDays, setMinDays] = useState(60)
  const [campaignFilter, setCampaignFilter] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [working, setWorking] = useState(false)

  async function refresh() {
    setLoading(true)
    setSelectedIds(new Set())
    try {
      const params = new URLSearchParams({ minDays: String(minDays) })
      if (campaignFilter) params.set('campaign', campaignFilter)
      const r = await fetch(`${LEADROOM_API}/api/admin/refused-recyclables?${params}`)
      const json = await r.json()
      if (r.ok) setData(json)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { refresh() }, [minDays, campaignFilter])

  function toggle(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleAll() {
    if (selectedIds.size === data.leads.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(data.leads.map(l => l.id)))
  }

  async function doAction(action) {
    if (selectedIds.size === 0) return
    const label = action === 'recontact' ? 'recontacter' : 'archiver'
    if (!confirm(`Confirmer, ${label} ${selectedIds.size} lead(s) ?`)) return
    setWorking(true)
    try {
      const r = await fetch(`${LEADROOM_API}/api/admin/recycle-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: Array.from(selectedIds), action }),
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error || 'échec')
      const did = action === 'recontact' ? json.recycled : json.archived
      alert(`${did} lead(s) ${action === 'recontact' ? 'remis dans le pool' : 'archivés'}.`)
      refresh()
    } catch (e) {
      alert(`Erreur, ${e.message}`)
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="card mb-24" style={{ overflow: 'hidden', borderTop: '3px solid #F59E0B' }}>
      <div className="panel-head">
        <div>
          <div className="section-kicker" style={{ color: '#F59E0B' }}>♻ Recyclage refusés</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>
            Pipe gratuit · {data.count} lead(s) refusés depuis ≥{minDays}j
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
            Sélectionne les leads à recontacter (réinjection dans le pool Lead Room en mode shotgun).
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--bd)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: 'var(--t2)' }}>Ancienneté min,</label>
        <select value={minDays} onChange={e => setMinDays(parseInt(e.target.value, 10))} className="form-input" style={{ width: 130, fontSize: 12 }}>
          <option value={30}>30 jours</option>
          <option value={60}>60 jours</option>
          <option value={90}>90 jours</option>
          <option value={180}>6 mois</option>
        </select>
        <label style={{ fontSize: 12, color: 'var(--t2)', marginLeft: 8 }}>Campagne,</label>
        <select value={campaignFilter || ''} onChange={e => setCampaignFilter(e.target.value || null)} className="form-input" style={{ width: 180, fontSize: 12 }}>
          <option value="">Toutes ({data.count})</option>
          {Object.entries(data.by_campaign || {}).map(([k, v]) => (
            <option key={k} value={k}>{k} ({v})</option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={loading}>
          {loading ? '…' : '⟳'} Refresh
        </button>
        <button className="btn btn-sm" style={{ background: '#F59E0B', color: 'white' }}
          disabled={selectedIds.size === 0 || working}
          onClick={() => doAction('recontact')}>
          📞 Recontacter ({selectedIds.size})
        </button>
        <button className="btn btn-ghost btn-sm"
          disabled={selectedIds.size === 0 || working}
          onClick={() => doAction('archive')}>
          🗑 Archiver ({selectedIds.size})
        </button>
      </div>

      <div style={{ maxHeight: 480, overflowY: 'auto' }}>
        {data.leads.length === 0 && !loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>
            Aucun lead refusé depuis ≥{minDays}j
            {campaignFilter ? ` pour la campagne ${campaignFilter}` : ''}.
          </div>
        ) : (
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === data.leads.length}
                    onChange={toggleAll} />
                </th>
                <th>Nom</th>
                <th>Campagne</th>
                <th>Conseiller</th>
                <th style={{ textAlign: 'right' }}>Refusé il y a</th>
              </tr>
            </thead>
            <tbody>
              {data.leads.map(l => (
                <tr key={l.id} style={{ background: selectedIds.has(l.id) ? 'rgba(245,158,11,0.05)' : undefined, cursor: 'pointer' }}
                    onClick={() => toggle(l.id)}>
                  <td><input type="checkbox" checked={selectedIds.has(l.id)} onChange={() => toggle(l.id)} onClick={e => e.stopPropagation()} /></td>
                  <td>
                    <div className="cell-primary">{l.name}</div>
                    <div className="cell-sub" style={{ fontSize: 11 }}>
                      {l.email || ''} {l.phone ? `· ${l.phone}` : ''}
                    </div>
                    {l.notes_excerpt && (
                      <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--t3)', marginTop: 4 }}>
                        "{l.notes_excerpt.slice(0, 80)}{l.notes_excerpt.length > 80 ? '…' : ''}"
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>{l.campaign_slug || '∅'}</td>
                  <td style={{ fontSize: 12 }}>{l.last_advisor_name || '∅'}</td>
                  <td className="cell-mono" style={{ textAlign: 'right', fontSize: 12, color: 'var(--t2)' }}>
                    {l.days_ago != null ? `${l.days_ago}j` : '?'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// MODAL DRILL-DOWN UNIVERSELLE — Détail d'un bucket de RDV avec actions
// adaptées. Remplace l'ancienne JoinedLeadsDrilldownModal.
//
// Bucket → comportement,
//   • passes       (tous les RDV passés)         Lecture + actions par status
//   • tenus        (RDV s'est tenu)              Rappel / Signé / Perdu
//   • absents      (no-show)                     Rappel / Réessayer
//   • signes       (contrat signé)               Lecture seule
//   • a_noter      (saisie manquante)            Tenu / Absent / Refus / Signé
//   • pipe_perdus  (absents sans rappel)         Rappel / Archiver
//   • a_venir      (RDV futurs)                  Lecture seule
//
// Demandé par Louis 28/05/2026, "je veux pouvoir cliquer pour détail sur
// chaque chiffre (65 passes, 28 absents, etc)".
// ─────────────────────────────────────────────────────────────────────────
const BUCKET_LABELS = {
  passes: { title: 'Tous les RDV passés', emoji: '📋', color: 'var(--t1)' },
  tenus: { title: 'RDV tenus', emoji: '✓', color: '#10B981' },
  absents: { title: 'Absents (no-show)', emoji: '✗', color: '#EF4444' },
  signes: { title: 'Contrats signés', emoji: '💎', color: 'var(--gold-dk, #A6843F)' },
  a_noter: { title: 'RDV à noter (saisie manquante)', emoji: '⚠', color: '#F59E0B' },
  pipe_perdus: { title: 'Absents sans rappel (pipe en danger)', emoji: '📞', color: '#EF4444' },
  a_venir: { title: 'RDV à venir', emoji: '📅', color: '#0071E3' },
}

function RdvBucketDrilldownModal({ bucket, onClose }) {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState({})
  const [callbackFor, setCallbackFor] = useState(null)
  const [customDate, setCustomDate] = useState('')
  // Filtre par conseiller (utile sur passes/tenus/absents)
  const [advisorFilter, setAdvisorFilter] = useState('all')

  const meta = BUCKET_LABELS[bucket] || { title: bucket, emoji: '🔍', color: 'var(--t1)' }

  async function refresh() {
    setLoading(true)
    try {
      const r = await fetch(`${LEADROOM_API}/api/admin/rdv-bucket-detail?bucket=${bucket}`)
      const json = await r.json()
      if (r.ok) setLeads(json.leads || [])
      else setError(json.error || 'erreur')
    } catch (e) {
      setError(e.message || 'réseau')
    } finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [bucket])

  const advisors = useMemo(() => {
    const set = new Map()
    for (const l of leads) {
      if (l.advisor_id && !set.has(l.advisor_id)) {
        set.set(l.advisor_id, l.advisor_name)
      }
    }
    return Array.from(set.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [leads])

  const displayed = useMemo(() => {
    const filtered = advisorFilter === 'all' ? leads : leads.filter(l => l.advisor_id === advisorFilter)
    return [...filtered].sort((a, b) => {
      if (bucket === 'a_venir') {
        // ordre asc pour les futurs
        return (a.rdv_date || '').localeCompare(b.rdv_date || '')
      }
      // Par défaut, les plus vieux (qui traînent) en premier
      return (b.days_since_rdv || 0) - (a.days_since_rdv || 0)
    })
  }, [leads, advisorFilter, bucket])

  // Breakdown par conseiller pour stats header
  const byAdvisor = useMemo(() => {
    const m = new Map()
    for (const l of leads) {
      const k = l.advisor_id || 'none'
      m.set(k, (m.get(k) || 0) + 1)
    }
    return m
  }, [leads])

  async function doAction(leadId, action, callbackAtIso) {
    setBusy(b => ({ ...b, [leadId]: true }))
    try {
      const r = await fetch(`${LEADROOM_API}/api/admin/lead-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, action, callbackAtIso }),
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error || 'échec action')
      // Retire localement les leads qui sortent du bucket
      if (action === 'sign' || action === 'lose') {
        setLeads(prev => prev.filter(l => l.id !== leadId))
      } else if (action === 'callback') {
        setLeads(prev => prev.map(l => l.id === leadId
          ? { ...l, callback_at: callbackAtIso, has_callback_future: true, is_stale: false }
          : l))
        // Sur bucket pipe_perdus, le lead sort
        if (bucket === 'pipe_perdus') {
          setLeads(prev => prev.filter(l => l.id !== leadId))
        }
      }
    } catch (e) {
      alert(`Action impossible, ${e.message}`)
    } finally {
      setBusy(b => { const { [leadId]: _, ...rest } = b; return rest })
    }
  }

  function isoInDays(n) {
    const d = new Date()
    d.setDate(d.getDate() + n)
    d.setHours(9, 0, 0, 0)
    return d.toISOString()
  }
  function fmtDate(iso) {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) }
    catch { return iso }
  }

  // Détermine quelles actions afficher selon le bucket
  function getActions(l) {
    const isBusy = !!busy[l.id]
    const a = []
    if (['passes', 'tenus', 'absents', 'a_noter', 'pipe_perdus'].includes(bucket)) {
      a.push(<button key="cb" className="btn btn-sm" disabled={isBusy}
        onClick={() => { setCustomDate(''); setCallbackFor(l) }}
        style={{ background: 'rgba(0,113,227,0.10)', color: '#0071E3', fontSize: 11 }}>
        📞 Rappel
      </button>)
    }
    if (['passes', 'tenus', 'absents', 'a_noter'].includes(bucket)) {
      a.push(<button key="sg" className="btn btn-sm" disabled={isBusy}
        onClick={() => doAction(l.id, 'sign')}
        style={{ background: 'rgba(201,169,97,0.15)', color: 'var(--gold-dk, #A6843F)', fontSize: 11, fontWeight: 700 }}>
        💎 Signé
      </button>)
    }
    if (['passes', 'tenus', 'absents', 'pipe_perdus'].includes(bucket)) {
      a.push(<button key="ls" className="btn btn-sm" disabled={isBusy}
        onClick={() => { if (confirm(`Marquer "${l.name}" comme perdu ?`)) doAction(l.id, 'lose') }}
        style={{ background: 'rgba(239,68,68,0.10)', color: '#EF4444', fontSize: 11 }}>
        ✗ Perdu
      </button>)
    }
    return a
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-box" onClick={e => e.stopPropagation()}
        style={{ maxWidth: 1200, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-head" style={{ position: 'sticky', top: 0, background: 'white', zIndex: 10, borderBottom: `2px solid ${meta.color}` }}>
          <div>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: meta.color, fontSize: 22 }}>{meta.emoji}</span>
              <span>{meta.title}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
              {loading ? 'Chargement…' : `${displayed.length} lead${displayed.length > 1 ? 's' : ''}${advisorFilter !== 'all' ? ` (filtré sur 1 conseiller)` : ''}`}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ padding: 20 }}>
          {/* Filtre par conseiller */}
          {advisors.length > 1 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--t2)' }}>Filtrer par conseiller :</span>
              <button onClick={() => setAdvisorFilter('all')}
                className={`btn btn-sm ${advisorFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: 11 }}>
                Tous ({leads.length})
              </button>
              {advisors.map(a => (
                <button key={a.id} onClick={() => setAdvisorFilter(a.id)}
                  className={`btn btn-sm ${advisorFilter === a.id ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: 11 }}>
                  {a.name} ({byAdvisor.get(a.id) || 0})
                </button>
              ))}
            </div>
          )}

          {error && (
            <div style={{ padding: 16, background: 'rgba(239,68,68,0.1)', color: '#EF4444', borderRadius: 8, marginBottom: 12 }}>
              Erreur, {error}
            </div>
          )}

          {/* Tableau */}
          {displayed.length === 0 && !loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>
              Aucun lead dans cette catégorie 🎉
            </div>
          ) : (
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Conseiller</th>
                  <th style={{ textAlign: 'right' }}>RDV</th>
                  <th style={{ textAlign: 'right' }}>{bucket === 'a_venir' ? 'Dans' : 'Âge'}</th>
                  <th>Statut / Suivi</th>
                  {bucket !== 'signes' && bucket !== 'a_venir' && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {displayed.map(l => (
                  <tr key={l.id} style={{ background: l.is_stale ? 'rgba(239,68,68,0.04)' : undefined }}>
                    <td>
                      <div className="cell-primary">{l.name}</div>
                      <div className="cell-sub" style={{ fontSize: 11 }}>
                        {l.campaign_slug || '∅'}{l.email ? ` · ${l.email}` : ''}
                      </div>
                      {l.notes_excerpt && (
                        <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--t3)', marginTop: 4, lineHeight: 1.4 }}
                             title={l.notes_excerpt}>
                          "{l.notes_excerpt.slice(0, 60)}{l.notes_excerpt.length > 60 ? '…' : ''}"
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{l.advisor_name}</div>
                    </td>
                    <td className="cell-mono" style={{ textAlign: 'right', fontSize: 12 }}>
                      {fmtDate(l.rdv_date)}
                    </td>
                    <td className="cell-mono" style={{ textAlign: 'right' }}>
                      {bucket === 'a_venir' ? (
                        <span style={{
                          padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                          background: 'rgba(0,113,227,0.15)', color: '#0071E3',
                        }}>
                          J{l.days_until_rdv >= 0 ? '+' : ''}{l.days_until_rdv}
                        </span>
                      ) : (
                        <span style={{
                          padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                          background: l.days_since_rdv > 14 ? 'rgba(239,68,68,0.15)' : l.days_since_rdv > 7 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
                          color: l.days_since_rdv > 14 ? '#EF4444' : l.days_since_rdv > 7 ? '#B45309' : '#10B981',
                        }}>
                          J+{l.days_since_rdv}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 11 }}>
                      <StatusBadge status={l.status} />
                      {l.has_callback_future ? (
                        <div style={{ color: '#0071E3', fontWeight: 600, marginTop: 4 }}>
                          📞 Rappel {fmtDate(l.callback_at)}
                        </div>
                      ) : l.is_stale ? (
                        <div style={{ color: '#EF4444', fontWeight: 600, marginTop: 4 }}>⚠ À recontacter</div>
                      ) : null}
                    </td>
                    {bucket !== 'signes' && bucket !== 'a_venir' && (
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                          {getActions(l)}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Sub-modal "Quand rappeler ?" */}
        {callbackFor && (
          <div className="modal-overlay" onClick={() => setCallbackFor(null)} style={{ background: 'rgba(0,0,0,0.6)', zIndex: 100 }}>
            <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
              <div className="modal-head">
                <div>
                  <div className="modal-title" style={{ fontSize: 16 }}>
                    Programmer un rappel
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
                    {callbackFor.name} (conseiller, {callbackFor.advisor_name})
                  </div>
                </div>
              </div>
              <div className="modal-body" style={{ padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                  {[1, 3, 7].map(d => (
                    <button key={d} className="btn btn-sm" style={{ fontSize: 12, padding: '10px 4px' }}
                      onClick={() => { doAction(callbackFor.id, 'callback', isoInDays(d)); setCallbackFor(null) }}>
                      {d === 1 ? 'Demain' : d === 3 ? 'Dans 3 jours' : 'Semaine pro'}
                      <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{fmtDate(isoInDays(d))}</div>
                    </button>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 6 }}>Ou choisir une date,</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="datetime-local" value={customDate}
                      onChange={e => setCustomDate(e.target.value)}
                      className="form-input" style={{ flex: 1, fontSize: 13 }}
                      min={new Date().toISOString().slice(0, 16)} />
                    <button className="btn btn-primary btn-sm" disabled={!customDate}
                      onClick={() => {
                        const iso = new Date(customDate).toISOString()
                        doAction(callbackFor.id, 'callback', iso)
                        setCallbackFor(null)
                      }}>
                      Programmer
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 16, textAlign: 'center' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setCallbackFor(null)}
                    style={{ fontSize: 11, color: 'var(--t3)' }}>
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Badge status d'un lead (réutilisé dans la modal universelle)
function StatusBadge({ status }) {
  const map = {
    joined: { label: '✓ Tenu', bg: 'rgba(16,185,129,0.12)', color: '#10B981' },
    not_joined: { label: '✗ Absent', bg: 'rgba(239,68,68,0.12)', color: '#EF4444' },
    refused: { label: 'Refus', bg: 'rgba(0,0,0,0.06)', color: 'var(--t2)' },
    signed: { label: '💎 Signé', bg: 'rgba(201,169,97,0.15)', color: 'var(--gold-dk, #A6843F)' },
    rdv: { label: '⚠ À noter', bg: 'rgba(245,158,11,0.15)', color: '#B45309' },
  }
  const v = map[status]
  if (!v) return <span style={{ fontSize: 11, color: 'var(--t3)' }}>{status}</span>
  return (
    <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: v.bg, color: v.color }}>
      {v.label}
    </span>
  )
}

// Ancien composant gardé pour compat (vide, redirige vers la modal universelle)
function JoinedLeadsDrilldownModal({ onClose }) {
  return <RdvBucketDrilldownModal bucket="tenus" onClose={onClose} />
}

// ─────────────────────────────────────────────────────────────────────────
// MODAL DRILL-DOWN — Détail des RDV tenus avec actions manager (legacy)
// (le contenu ci-dessous est conservé pour ref mais n'est plus utilisé,
// remplacé par RdvBucketDrilldownModal au-dessus)
// ─────────────────────────────────────────────────────────────────────────
function JoinedLeadsDrilldownModal_DEPRECATED({ onClose }) {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterStale, setFilterStale] = useState(false)
  const [busy, setBusy] = useState({}) // {leadId: true} pendant action en cours
  const [callbackFor, setCallbackFor] = useState(null) // lead pour lequel on choisit une date de rappel
  const [customDate, setCustomDate] = useState('')

  // Fetch initial + après chaque action
  async function refresh() {
    setLoading(true)
    try {
      const r = await fetch(`${LEADROOM_API}/api/admin/joined-leads-detail`)
      const json = await r.json()
      if (r.ok) setLeads(json.leads || [])
      else setError(json.error || 'erreur')
    } catch (e) {
      setError(e.message || 'réseau')
    } finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  // Filtre + tri
  const displayed = useMemo(() => {
    const filtered = filterStale ? leads.filter(l => l.is_stale) : leads
    return [...filtered].sort((a, b) => (b.days_since_rdv || 0) - (a.days_since_rdv || 0))
  }, [leads, filterStale])

  // Stats compteur dans le header
  const stats = useMemo(() => ({
    total: leads.length,
    stale: leads.filter(l => l.is_stale).length,
    withCallback: leads.filter(l => l.has_callback_future).length,
  }), [leads])

  async function doAction(leadId, action, callbackAtIso) {
    setBusy(b => ({ ...b, [leadId]: true }))
    try {
      const r = await fetch(`${LEADROOM_API}/api/admin/lead-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, action, callbackAtIso }),
      })
      const json = await r.json()
      if (!r.ok) throw new Error(json.error || 'échec action')
      // Soft refresh, on retire le lead localement (il n'est plus joined ou a un callback)
      if (action === 'sign' || action === 'lose') {
        setLeads(prev => prev.filter(l => l.id !== leadId))
      } else if (action === 'callback') {
        setLeads(prev => prev.map(l => l.id === leadId
          ? { ...l, callback_at: callbackAtIso, has_callback_future: true, is_stale: false }
          : l))
      }
    } catch (e) {
      alert(`Action impossible, ${e.message}`)
    } finally {
      setBusy(b => { const { [leadId]: _, ...rest } = b; return rest })
    }
  }

  function isoInDays(n) {
    const d = new Date()
    d.setDate(d.getDate() + n)
    d.setHours(9, 0, 0, 0)
    return d.toISOString()
  }
  function fmtDate(iso) {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) }
    catch { return iso }
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-box" onClick={e => e.stopPropagation()}
        style={{ maxWidth: 1100, maxHeight: '92vh', overflowY: 'auto' }}>
        {/* Header */}
        <div className="modal-head" style={{ position: 'sticky', top: 0, background: 'white', zIndex: 10, borderBottom: '1px solid var(--bd)' }}>
          <div>
            <div className="modal-title">
              📞 Pipeline RDV tenus
            </div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
              {loading ? 'Chargement…' : `${stats.total} RDV tenus · ${stats.stale} qui traînent (>14j sans rappel) · ${stats.withCallback} avec rappel programmé`}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ padding: 20 }}>
          {/* Filtres */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
            <button onClick={() => setFilterStale(false)}
              className={`btn ${!filterStale ? 'btn-primary' : 'btn-ghost'} btn-sm`}>
              Tous ({stats.total})
            </button>
            <button onClick={() => setFilterStale(true)}
              className={`btn ${filterStale ? 'btn-primary' : 'btn-ghost'} btn-sm`}>
              ⚠ Qui traînent ({stats.stale})
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={refresh} className="btn btn-ghost btn-sm" disabled={loading}>
              {loading ? '…' : '⟳ Refresh'}
            </button>
          </div>

          {error && (
            <div style={{ padding: 16, background: 'rgba(239,68,68,0.1)', color: '#EF4444', borderRadius: 8, marginBottom: 12 }}>
              Erreur, {error}
            </div>
          )}

          {/* Tableau */}
          {displayed.length === 0 && !loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>
              {filterStale ? 'Aucun RDV qui traîne — 🎉' : 'Aucun RDV tenu à traiter'}
            </div>
          ) : (
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Conseiller</th>
                  <th style={{ textAlign: 'right' }}>RDV</th>
                  <th style={{ textAlign: 'right' }}>Âge</th>
                  <th>Suivi</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(l => {
                  const isBusy = !!busy[l.id]
                  return (
                    <tr key={l.id} style={{ background: l.is_stale ? 'rgba(239,68,68,0.04)' : undefined }}>
                      <td>
                        <div className="cell-primary">{l.name}</div>
                        <div className="cell-sub" style={{ fontSize: 11 }}>
                          {l.campaign_slug || '∅'}{l.email ? ` · ${l.email}` : ''}
                        </div>
                        {l.notes_excerpt && (
                          <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--t3)', marginTop: 4, lineHeight: 1.4 }}
                               title={l.notes_excerpt}>
                            "{l.notes_excerpt.slice(0, 60)}{l.notes_excerpt.length > 60 ? '…' : ''}"
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{l.advisor_name}</div>
                      </td>
                      <td className="cell-mono" style={{ textAlign: 'right', fontSize: 12 }}>
                        {fmtDate(l.rdv_date)}
                      </td>
                      <td className="cell-mono" style={{ textAlign: 'right' }}>
                        <span style={{
                          padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                          background: l.days_since_rdv > 14 ? 'rgba(239,68,68,0.15)' : l.days_since_rdv > 7 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
                          color: l.days_since_rdv > 14 ? '#EF4444' : l.days_since_rdv > 7 ? '#B45309' : '#10B981',
                        }}>
                          J+{l.days_since_rdv}
                        </span>
                      </td>
                      <td style={{ fontSize: 11 }}>
                        {l.has_callback_future ? (
                          <span style={{ color: '#0071E3', fontWeight: 600 }}>
                            📞 Rappel {fmtDate(l.callback_at)}
                          </span>
                        ) : l.is_stale ? (
                          <span style={{ color: '#EF4444', fontWeight: 600 }}>⚠ À recontacter</span>
                        ) : (
                          <span style={{ color: 'var(--t3)' }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                          <button className="btn btn-sm" disabled={isBusy}
                            onClick={() => { setCustomDate(''); setCallbackFor(l) }}
                            style={{ background: 'rgba(0,113,227,0.10)', color: '#0071E3', fontSize: 11 }}>
                            📞 Rappel
                          </button>
                          <button className="btn btn-sm" disabled={isBusy}
                            onClick={() => doAction(l.id, 'sign')}
                            style={{ background: 'rgba(201,169,97,0.15)', color: 'var(--gold-dk, #A6843F)', fontSize: 11, fontWeight: 700 }}>
                            💎 Signé
                          </button>
                          <button className="btn btn-sm" disabled={isBusy}
                            onClick={() => { if (confirm(`Marquer "${l.name}" comme perdu ?`)) doAction(l.id, 'lose') }}
                            style={{ background: 'rgba(239,68,68,0.10)', color: '#EF4444', fontSize: 11 }}>
                            ✗ Perdu
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Sub-modal "Quand rappeler ?" */}
        {callbackFor && (
          <div className="modal-overlay" onClick={() => setCallbackFor(null)} style={{ background: 'rgba(0,0,0,0.6)', zIndex: 100 }}>
            <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
              <div className="modal-head">
                <div>
                  <div className="modal-title" style={{ fontSize: 16 }}>
                    Programmer un rappel
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
                    {callbackFor.name} (conseiller, {callbackFor.advisor_name})
                  </div>
                </div>
              </div>
              <div className="modal-body" style={{ padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                  {[1, 3, 7].map(d => (
                    <button key={d} className="btn btn-sm" style={{ fontSize: 12, padding: '10px 4px' }}
                      onClick={() => { doAction(callbackFor.id, 'callback', isoInDays(d)); setCallbackFor(null) }}>
                      {d === 1 ? 'Demain' : d === 3 ? 'Dans 3 jours' : 'Semaine pro'}
                      <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{fmtDate(isoInDays(d))}</div>
                    </button>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid var(--bd)', paddingTop: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 6 }}>Ou choisir une date,</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="datetime-local" value={customDate}
                      onChange={e => setCustomDate(e.target.value)}
                      className="form-input" style={{ flex: 1, fontSize: 13 }}
                      min={new Date().toISOString().slice(0, 16)} />
                    <button className="btn btn-primary btn-sm" disabled={!customDate}
                      onClick={() => {
                        const iso = new Date(customDate).toISOString()
                        doAction(callbackFor.id, 'callback', iso)
                        setCallbackFor(null)
                      }}>
                      Programmer
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 16, textAlign: 'center' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setCallbackFor(null)}
                    style={{ fontSize: 11, color: 'var(--t3)' }}>
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
