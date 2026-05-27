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
} from '../lib/metrics'
import * as contratsService from '../services/conseillerContrats'
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

  const activeAdvisors = useMemo(
    () => (teamProfiles || []).filter(p => p?.is_active && p?.advisor_code),
    [teamProfiles]
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

  // Totaux cabinet (basés sur les rows calculés)
  const cabinet = useMemo(() => {
    const ppSigned = rows.reduce((s, r) => s + r.m.ppSigned, 0)
    const puSigned = rows.reduce((s, r) => s + r.m.puSigned, 0)
    const ppProj = rows.reduce((s, r) => s + r.m.ppProjected, 0)
    const puProj = rows.reduce((s, r) => s + r.m.puProjected, 0)
    const totalSigned = rows.reduce((s, r) => s + r.m.signedCount, 0)
    const totalPipeline = rows.reduce((s, r) => s + r.m.pipelineCount, 0)
    return { ppSigned, puSigned, ppProj, puProj, totalSigned, totalPipeline }
  }, [rows])

  // Top performeurs (par variable estimé = ppSigned + puSigned / 10) — simple ranking
  const topPerformeurs = useMemo(
    () => [...rows].sort((a, b) => b.totalBrut - a.totalBrut).slice(0, 3),
    [rows]
  )
  // À booster : ceux qui ont 0 signature ce mois OU une chute > 50 % vs M-1
  const aBooster = useMemo(
    () => [...rows]
      .filter(r => r.m.signedCount === 0 || (r.prev && r.prev.signedCount > 0 && r.dSigned < 0))
      .sort((a, b) => a.totalBrut - b.totalBrut)
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
                <th style={{ textAlign: 'center' }} title="RDV Lead Room : joints / no-shows / refus">RDV LR</th>
                <th style={{ textAlign: 'center' }} title="Valeur cabinet cumulée depuis embauche vs salaire à rembourser">Rentable ?</th>
                <SortableTh label="Δ vs M-1" col="delta" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
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
              label="Δ vs M-1"
              value={`${row.dPp >= 0 ? '+' : ''}${fmtEur(row.dPp)}`}
              color={row.dPp >= 0 ? '#10B981' : '#EF4444'}
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
                <MiniKpi label="Joints" value={rdv.joined} color="#10B981" />
                <MiniKpi label="No-shows" value={rdv.no_show} color="#EF4444" />
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
    joined: { label: 'Joint', bg: 'rgba(16,185,129,0.12)', color: '#10B981' },
    joint: { label: 'Joint', bg: 'rgba(16,185,129,0.12)', color: '#10B981' },
    no_show: { label: 'No-show', bg: 'rgba(239,68,68,0.12)', color: '#EF4444' },
    noshow: { label: 'No-show', bg: 'rgba(239,68,68,0.12)', color: '#EF4444' },
    'no-show': { label: 'No-show', bg: 'rgba(239,68,68,0.12)', color: '#EF4444' },
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
          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap' }}>
            <span title="Joints" style={{ color: '#10B981', fontWeight: 700 }}>{rdv.joined}</span>
            <span style={{ color: 'var(--t3)' }}>·</span>
            <span title="No-shows" style={{ color: '#EF4444', fontWeight: 700 }}>{rdv.no_show}</span>
            <span style={{ color: 'var(--t3)' }}>·</span>
            <span title="Refus" style={{ color: 'var(--t3)', fontWeight: 600 }}>{rdv.refused}</span>
            {rdv.upcoming > 0 && (
              <span title={`${rdv.upcoming} RDV à venir`} style={{ marginLeft: 4, padding: '1px 5px', borderRadius: 3, background: 'rgba(0,113,227,0.10)', color: '#0071E3', fontWeight: 600, fontSize: 10 }}>
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
