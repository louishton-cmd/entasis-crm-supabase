import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'

// ─────────────────────────────────────────────────────────────────────────────
//   FONCTIONS UTILITAIRES SEMAINE
// ─────────────────────────────────────────────────────────────────────────────

// Calcul lundi de la semaine pour une date donnée
function getMondayOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(new Date(date).setDate(diff))
}

// Numéro de semaine ISO
function getISOWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d.getTime() - week1.getTime())
    / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
}

// Clé de semaine format 2026-W15
function getWeekKey(date) {
  const week = getISOWeek(date)
  const year = new Date(date).getFullYear()
  return `${year}-W${String(week).padStart(2, '0')}`
}

// Date de signature effective d'un deal
function getSignedDate(deal) {
  if (deal.date_signed) return new Date(deal.date_signed)
  if (deal.status === 'Signé') return new Date(deal.updated_at)
  return null
}

// Deals signés dans une plage de dates
function getSignedDealsInRange(deals, startDate, endDate) {
  return deals.filter(d => {
    if (d.status !== 'Signé') return false
    const signedDate = getSignedDate(d)
    if (!signedDate) return false
    return signedDate >= startDate && signedDate <= endDate
  })
}

// PP attribuée à un conseiller (règle 50/50)
function getPpForAdvisor(deal, advisorCode) {
  const pp = (deal.pp_m || 0) * 12
  const pu = deal.pu || 0
  if (deal.co_advisor_code) return { pp: pp * 0.5, pu: pu * 0.5 }
  return { pp, pu }
}

// Calcul historique des semaines
function getWeeklyHistory(deals) {
  if (!deals || deals.length === 0) return []

  const signedDeals = deals.filter(d => d.status === 'Signé')
  if (signedDeals.length === 0) return []

  // Grouper par semaine
  const weekMap = {}
  signedDeals.forEach(deal => {
    const signedDate = deal.date_signed
      ? new Date(deal.date_signed)
      : new Date(deal.updated_at)

    const weekKey = getWeekKey(signedDate)
    const weekNum = getISOWeek(signedDate)
    const year = signedDate.getFullYear()
    const monday = getMondayOfWeek(signedDate)

    if (!weekMap[weekKey]) {
      weekMap[weekKey] = {
        weekKey,
        weekNum,
        year,
        monday,
        label: `S${String(weekNum).padStart(2,'0')}`,
        signatures: 0,
        pp: 0,
        pu: 0
      }
    }

    // Règle 50/50 non applicable ici
    // (on veut le total cabinet réel)
    weekMap[weekKey].signatures += 1
    weekMap[weekKey].pp += (deal.pp_m || 0) * 12
    weekMap[weekKey].pu += deal.pu || 0
  })

  // Trier par date chronologique
  return Object.values(weekMap)
    .sort((a, b) => new Date(a.monday) - new Date(b.monday))
    // Garder max 8 semaines (fenêtre glissante)
    .slice(-8)
}

const euro = (v) => Number(v||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0})

// ─────────────────────────────────────────────────────────────────────────────
//   COMPOSANTS UI
// ─────────────────────────────────────────────────────────────────────────────

function KpiCard({label, value, hint, accent, progressValue, delta}) {
  const accentClass = accent ? `kpi-card-${accent}` : ''
  const fill = progressValue != null ? Math.min(100, progressValue) : null
  const hasDelta = delta != null && delta.raw !== 0
  const deltaUp = delta?.raw > 0

  return (
    <div className={`kpi-card ${accentClass}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hasDelta && (
        <div style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:11.5,fontWeight:500,marginTop:4,color:deltaUp?'var(--signed)':'var(--cancelled)'}}>
          <span style={{fontSize:10}}>{deltaUp?'▲':'▼'}</span>
          {deltaUp?'+':''}{delta.label} vs S-1
        </div>
      )}
      {!hasDelta && hint && <div className="kpi-hint">{hint}</div>}
      {fill != null && (
        <>
          <div className="kpi-progress-bar">
            <div className={`kpi-progress-fill${fill>=100?' over':''}`} style={{width:`${Math.min(100,fill)}%`}}/>
          </div>
          <div className="kpi-hint" style={{marginTop:4}}>{fill}% de l'objectif</div>
        </>
      )}
    </div>
  )
}

function ObjectiveModal({show, objective, onSave, onClose}) {
  const [tempObjective, setTempObjective] = useState(objective)

  useEffect(() => {
    setTempObjective(objective)
  }, [objective])

  if (!show) return null

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h3>Objectifs de la semaine</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Objectif signatures cette semaine</label>
            <input
              className="form-input"
              type="number"
              min="0"
              value={tempObjective.signatures_target || 0}
              onChange={e => setTempObjective({
                ...tempObjective,
                signatures_target: Number(e.target.value)
              })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Objectif RDV cette semaine</label>
            <input
              className="form-input"
              type="number"
              min="0"
              value={tempObjective.rdv_target || 0}
              onChange={e => setTempObjective({
                ...tempObjective,
                rdv_target: Number(e.target.value)
              })}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn btn-gold" onClick={() => onSave(tempObjective)}>Sauvegarder</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//   COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export default function WeeklyReview({deals, teamProfiles, supabase}) {
  const now = new Date()
  const currentMonday = getMondayOfWeek(now)
  const currentSunday = new Date(currentMonday)
  currentSunday.setDate(currentMonday.getDate() + 6)
  currentSunday.setHours(23, 59, 59, 999)

  const previousMonday = getMondayOfWeek(
    new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  )
  const previousSunday = new Date(previousMonday)
  previousSunday.setDate(previousMonday.getDate() + 6)
  previousSunday.setHours(23, 59, 59, 999)

  const currentWeekKey = getWeekKey(now)
  const weekNumber = getISOWeek(now)
  const currentYear = now.getFullYear()

  // États du composant
  const [weekObjective, setWeekObjective] = useState({
    signatures_target: 0, rdv_target: 0
  })
  const [showObjectiveModal, setShowObjectiveModal] = useState(false)
  const [loadingObjective, setLoadingObjective] = useState(true)
  const [exportLoading, setExportLoading] = useState(false)

  // Chargement de l'objectif semaine
  useEffect(() => {
    async function loadObjective() {
      try {
        const { data, error } = await supabase
          .from('weekly_objectives')
          .select('*')
          .eq('week_key', currentWeekKey)
          .single()

        if (data && !error) {
          setWeekObjective(data)
        }
      } catch (err) {
        // Table n'existe pas encore, c'est normal
        console.log('Table weekly_objectives pas encore créée')
      }
      setLoadingObjective(false)
    }
    loadObjective()
  }, [currentWeekKey, supabase])

  // Calcul des métriques par conseiller
  const advisorRows = useMemo(() => {
    const activeAdvisors = teamProfiles.filter(
      p => p.is_active && p.advisor_code
    )

    const currentDeals = getSignedDealsInRange(
      deals, currentMonday, currentSunday
    )
    const previousDeals = getSignedDealsInRange(
      deals, previousMonday, previousSunday
    )

    return activeAdvisors.map(advisor => {
      const code = advisor.advisor_code

      // Deals semaine courante pour ce conseiller
      const myCurrentDeals = currentDeals.filter(d =>
        d.advisor_code === code || d.co_advisor_code === code
      )
      // Deals semaine précédente
      const myPreviousDeals = previousDeals.filter(d =>
        d.advisor_code === code || d.co_advisor_code === code
      )

      // CA avec règle 50/50
      const currentPp = myCurrentDeals.reduce((s, d) => {
        return s + getPpForAdvisor(d, code).pp
      }, 0)
      const currentPu = myCurrentDeals.reduce((s, d) => {
        return s + getPpForAdvisor(d, code).pu
      }, 0)
      const previousPp = myPreviousDeals.reduce((s, d) => {
        return s + getPpForAdvisor(d, code).pp
      }, 0)

      // Nombre de signatures (0.5 si co-conseil)
      const currentSigs = myCurrentDeals.reduce((s, d) =>
        s + (d.co_advisor_code ? 0.5 : 1), 0
      )
      const previousSigs = myPreviousDeals.reduce((s, d) =>
        s + (d.co_advisor_code ? 0.5 : 1), 0
      )

      // Tendance vs S-1
      const trend = currentSigs >= previousSigs ? 'up' : 'down'

      return {
        advisor,
        currentSigs,
        previousSigs,
        currentPp,
        currentPu,
        trend,
        deals: myCurrentDeals
      }
    }).sort((a, b) => b.currentSigs - a.currentSigs)
  }, [deals, teamProfiles, currentMonday, currentSunday,
      previousMonday, previousSunday])

  // Totaux cabinet
  const totalCurrentSigs = advisorRows.reduce(
    (s, r) => s + r.currentSigs, 0
  )
  const totalCurrentPp = advisorRows.reduce(
    (s, r) => s + r.currentPp, 0
  )
  const totalCurrentPu = advisorRows.reduce(
    (s, r) => s + r.currentPu, 0
  )
  const totalPreviousSigs = advisorRows.reduce(
    (s, r) => s + r.previousSigs, 0
  )

  // Projection vendredi
  const today = now.getDay() // 1=lundi ... 5=vendredi
  const daysElapsed = Math.max(today === 0 ? 7 : today, 1)
  const daysInWeek = 5
  const projectedSigs = daysElapsed >= daysInWeek
    ? totalCurrentSigs
    : Math.round((totalCurrentSigs / daysElapsed) * daysInWeek * 10) / 10

  // Statut alertes
  const objectiveProgress = weekObjective.signatures_target > 0
    ? (totalCurrentSigs / weekObjective.signatures_target) * 100
    : null

  const alertStatus = objectiveProgress === null ? 'none'
    : objectiveProgress >= 100 ? 'green'
    : objectiveProgress >= 60 ? 'orange'
    : 'red'

  // Historique des semaines
  const weeklyHistory = useMemo(() =>
    getWeeklyHistory(deals), [deals]
  )

  // Sauvegarde objectif
  async function saveObjective(newObjective) {
    try {
      const { error } = await supabase
        .from('weekly_objectives')
        .upsert({
          week_key: currentWeekKey,
          signatures_target: newObjective.signatures_target,
          rdv_target: newObjective.rdv_target,
          updated_at: new Date().toISOString()
        })

      if (!error) {
        setWeekObjective(newObjective)
        setShowObjectiveModal(false)
        toast.success('Objectif sauvegardé')
      } else {
        toast.error('Erreur lors de la sauvegarde')
      }
    } catch (err) {
      toast.error('Table weekly_objectives non créée. Voir la documentation.')
    }
  }

  // Export CSV
  function exportCSV() {
    setExportLoading(true)
    const rows = [
      ['Conseiller', 'Signatures', 'PP Annualisée', 'PU', 'Tendance vs S-1'],
      ...advisorRows.map(r => [
        r.advisor.full_name || r.advisor.advisor_code,
        r.currentSigs,
        Math.round(r.currentPp),
        Math.round(r.currentPu),
        r.trend === 'up' ? '↑' : '↓'
      ]),
      ['TOTAL CABINET', totalCurrentSigs,
       Math.round(totalCurrentPp), Math.round(totalCurrentPu), '']
    ]

    const csv = rows.map(r => r.join(';')).join('\n')
    const blob = new Blob(['\ufeff' + csv],
      { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `entasis-revue-S${String(weekNumber).padStart(2,'0')}-${currentYear}.csv`
    link.click()
    URL.revokeObjectURL(url)
    setExportLoading(false)
    toast.success('Export téléchargé')
  }

  // Formatage des dates
  const mondayStr = `${currentMonday.getDate()}/${currentMonday.getMonth() + 1}`
  const fridayStr = `${new Date(currentMonday.getTime() + 4*24*60*60*1000).getDate()}/${new Date(currentMonday.getTime() + 4*24*60*60*1000).getMonth() + 1}`

  return (
    <div>
      {/* BANDEAU D'ALERTE */}
      {objectiveProgress !== null && (
        <div className={`alert-banner alert-${alertStatus}`} style={{
          padding: '12px 24px',
          marginBottom: '24px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '500',
          backgroundColor: alertStatus === 'red' ? 'var(--cancelled-bg)' :
                          alertStatus === 'orange' ? 'var(--progress-bg)' : 'var(--signed-bg)',
          color: alertStatus === 'red' ? 'var(--cancelled)' :
                alertStatus === 'orange' ? 'var(--progress)' : 'var(--signed)',
          border: `1px solid ${alertStatus === 'red' ? 'var(--cancelled-bd)' :
                                alertStatus === 'orange' ? 'var(--progress-bd)' : 'var(--signed-bd)'}`
        }}>
          {alertStatus === 'red' && `⚠️ Projection insuffisante — ${projectedSigs} signatures prévues vendredi sur ${weekObjective.signatures_target} objectif`}
          {alertStatus === 'orange' && `🔶 En cours — ${projectedSigs} projections sur ${weekObjective.signatures_target} objectif`}
          {alertStatus === 'green' && `✅ Objectif atteint ! ${totalCurrentSigs} signatures cette semaine`}
        </div>
      )}

      {/* HEADER */}
      <div className="section-header">
        <div>
          <div className="section-kicker">Semaine {weekNumber} · {currentYear}</div>
          <div className="section-title">Revue hebdomadaire</div>
          <div className="section-sub">Du {mondayStr} au {fridayStr} en cours</div>
        </div>
        <div style={{display: 'flex', gap: '12px'}}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowObjectiveModal(true)}
            disabled={loadingObjective}
          >
            ⚙️ Objectifs
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={exportCSV}
            disabled={exportLoading}
          >
            {exportLoading ? 'Export...' : '📥 Exporter CSV'}
          </button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="kpi-grid mb-24">
        <KpiCard
          label="Signatures semaine"
          value={totalCurrentSigs.toString()}
          accent="gold"
          delta={{
            raw: totalCurrentSigs - totalPreviousSigs,
            label: Math.abs(totalCurrentSigs - totalPreviousSigs).toString()
          }}
        />
        <KpiCard
          label="PP Annualisée"
          value={euro(totalCurrentPp)}
          accent="amber"
        />
        <KpiCard
          label="PU"
          value={euro(totalCurrentPu)}
          accent="green"
        />
        <KpiCard
          label="Projection vendredi"
          value={`${projectedSigs} signatures`}
          accent="blue"
        />
      </div>

      {/* BARRE DE PROGRESSION OBJECTIF */}
      {weekObjective.signatures_target > 0 && (
        <div className="card mb-24" style={{padding: '20px'}}>
          <div style={{marginBottom: '12px', fontSize: '14px', fontWeight: '600', color: 'var(--t1)'}}>
            Objectif {weekObjective.signatures_target} signatures
          </div>
          <div className="kpi-progress-bar" style={{height: '8px'}}>
            <div
              className="kpi-progress-fill"
              style={{
                width: `${Math.min(100, objectiveProgress)}%`,
                backgroundColor: alertStatus === 'red' ? 'var(--cancelled)' :
                                alertStatus === 'orange' ? 'var(--progress)' : 'var(--signed)'
              }}
            />
          </div>
          <div style={{marginTop: '8px', fontSize: '12px', color: 'var(--t3)'}}>
            {Math.max(0, weekObjective.signatures_target - totalCurrentSigs) > 0
              ? `Il manque ${Math.max(0, weekObjective.signatures_target - totalCurrentSigs)} signatures pour atteindre l'objectif`
              : 'Objectif atteint !'}
          </div>
        </div>
      )}

      {/* TABLEAU PRINCIPAL */}
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Conseiller</th>
              <th style={{textAlign: 'center'}}>Signatures</th>
              <th style={{textAlign: 'right'}}>CA PP</th>
              <th style={{textAlign: 'right'}}>CA PU</th>
              <th style={{textAlign: 'center'}}>Tendance</th>
            </tr>
          </thead>
          <tbody>
            {advisorRows.map((row, i) => (
              <tr key={row.advisor.advisor_code} style={{
                backgroundColor: row.currentSigs === 0 && today > 1 ? 'rgba(250, 165, 165, 0.1)' : 'transparent'
              }}>
                <td>
                  <div className="cell-primary">{row.advisor.full_name || row.advisor.advisor_code}</div>
                  <div className="cell-sub">{row.advisor.advisor_code}</div>
                </td>
                <td style={{textAlign: 'center', fontWeight: '600', color: 'var(--t1)'}}>
                  {row.currentSigs}
                </td>
                <td style={{textAlign: 'right', fontWeight: '600'}}>
                  {euro(row.currentPp)}
                </td>
                <td style={{textAlign: 'right', fontWeight: '600'}}>
                  {euro(row.currentPu)}
                </td>
                <td style={{textAlign: 'center'}}>
                  <span style={{
                    fontSize: '16px',
                    color: row.trend === 'up' ? 'var(--signed)' : 'var(--cancelled)'
                  }}>
                    {row.trend === 'up' ? '↑' : '↓'} vs {row.previousSigs}
                  </span>
                </td>
              </tr>
            ))}
            <tr style={{borderTop: '2px solid var(--gold)', fontWeight: '700'}}>
              <td>TOTAL CABINET</td>
              <td style={{textAlign: 'center', color: 'var(--gold)'}}>{totalCurrentSigs}</td>
              <td style={{textAlign: 'right', color: 'var(--gold)'}}>{euro(totalCurrentPp)}</td>
              <td style={{textAlign: 'right', color: 'var(--gold)'}}>{euro(totalCurrentPu)}</td>
              <td style={{textAlign: 'center'}}>
                <span style={{
                  fontSize: '16px',
                  color: totalCurrentSigs >= totalPreviousSigs ? 'var(--signed)' : 'var(--cancelled)'
                }}>
                  {totalCurrentSigs >= totalPreviousSigs ? '↑' : '↓'} vs {totalPreviousSigs}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* HISTORIQUE SEMAINES */}
      <div className="card mt-24">
        <div className="card-header">
          <h3>Historique des semaines</h3>
        </div>
        <div className="card-body">
          {weeklyHistory.length === 0 ? (
            <p style={{color: 'var(--t3)', fontSize: '14px'}}>
              Aucune donnée historique disponible
            </p>
          ) : (
            <>
              <div style={{overflowX: 'auto'}}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Semaine</th>
                      <th>Signatures</th>
                      <th>PP Annualisée</th>
                      <th>PU</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyHistory.map(week => {
                      const isCurrentWeek = week.weekKey === currentWeekKey
                      return (
                        <tr
                          key={week.weekKey}
                          style={{
                            backgroundColor: isCurrentWeek ? 'rgba(192, 155, 90, 0.1)' : 'transparent'
                          }}
                        >
                          <td style={{fontWeight: isCurrentWeek ? 600 : 400}}>
                            {week.label}
                          </td>
                          <td style={{fontWeight: isCurrentWeek ? 600 : 400}}>
                            {week.signatures}
                          </td>
                          <td style={{fontWeight: isCurrentWeek ? 600 : 400}}>
                            {euro(week.pp)}
                          </td>
                          <td style={{fontWeight: isCurrentWeek ? 600 : 400}}>
                            {euro(week.pu)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{marginTop: '16px', fontSize: '14px', color: 'var(--t2)'}}>
                Moyenne sur {weeklyHistory.length} semaine{weeklyHistory.length > 1 ? 's' : ''} : {' '}
                {Math.round((weeklyHistory.reduce((sum, week) => sum + week.signatures, 0) / weeklyHistory.length) * 10) / 10} signatures/semaine
              </div>
            </>
          )}
        </div>
      </div>

      {/* MODAL OBJECTIFS */}
      <ObjectiveModal
        show={showObjectiveModal}
        objective={weekObjective}
        onSave={saveObjective}
        onClose={() => setShowObjectiveModal(false)}
      />
    </div>
  )
}