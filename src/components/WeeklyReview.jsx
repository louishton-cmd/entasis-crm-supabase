import { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

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
    .filter(w => new Date(w.monday) <= new Date()) // Exclure semaines futures
    .sort((a, b) => new Date(a.monday) - new Date(b.monday))
    // Garder max 8 semaines (fenêtre glissante)
    .slice(-8)
}

// Calcul des bornes d'une semaine ISO depuis weekKey
function getWeekBounds(weekKey) {
  // Extraire année et numéro de semaine de "2026-W14"
  const [year, weekPart] = weekKey.split('-W')
  const weekNum = parseInt(weekPart)

  // Calculer le lundi de cette semaine ISO
  const jan4 = new Date(parseInt(year), 0, 4)
  const startOfWeek1 = getMondayOfWeek(jan4)
  const monday = new Date(startOfWeek1)
  monday.setDate(startOfWeek1.getDate() + (weekNum - 1) * 7)

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)

  return { monday, sunday }
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

function ObjectiveModal({show, objective, onSave, onClose, weekNumber, year}) {
  const [tempObjective, setTempObjective] = useState(objective)

  useEffect(() => {
    setTempObjective(objective)
  }, [objective])

  if (!show) return null

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h3>Définir l'objectif pour la semaine {weekNumber} - {year}</h3>
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
  const [lastObjective, setLastObjective] = useState(null)
  const [selectedWeekKey, setSelectedWeekKey] = useState(currentWeekKey)
  const [compareMode, setCompareMode] = useState(false)
  const [weekA, setWeekA] = useState('')
  const [weekB, setWeekB] = useState('')

  // Chargement de l'objectif semaine avec gestion report
  useEffect(() => {
    async function loadObjective() {
      try {
        // Chercher objectif pour la semaine courante
        const { data, error } = await supabase
          .from('weekly_objectives')
          .select('*')
          .eq('week_key', currentWeekKey)
          .single()

        if (data && !error) {
          setWeekObjective(data)
        } else {
          // Pas d'objectif cette semaine, chercher le dernier
          const { data: lastObj } = await supabase
            .from('weekly_objectives')
            .select('*')
            .lt('week_key', currentWeekKey)
            .order('week_key', { ascending: false })
            .limit(1)
            .single()

          if (lastObj) {
            setLastObjective(lastObj)
          }
        }
      } catch (err) {
        // Table n'existe pas encore, c'est normal
        console.log('Table weekly_objectives pas encore créée')
      }
      setLoadingObjective(false)
    }
    loadObjective()
  }, [currentWeekKey, supabase])

  // Semaines disponibles pour le sélecteur
  const availableWeeks = useMemo(() => {
    if (!deals || deals.length === 0) return [currentWeekKey]

    const weeks = new Set()
    deals.filter(d => d.status === 'Signé').forEach(deal => {
      const date = deal.date_signed
        ? new Date(deal.date_signed)
        : new Date(deal.updated_at)
      weeks.add(getWeekKey(date))
    })

    // Toujours inclure la semaine courante
    weeks.add(currentWeekKey)

    return Array.from(weeks)
      .filter(w => w <= currentWeekKey)
      .sort()
      .reverse() // Plus récent en premier
  }, [deals, currentWeekKey])

  // Calcul des bornes pour la semaine sélectionnée
  const selectedBounds = useMemo(() => {
    if (selectedWeekKey === currentWeekKey) {
      return {
        monday: currentMonday,
        sunday: currentSunday,
        weekNumber: weekNumber,
        year: currentYear
      }
    } else {
      const bounds = getWeekBounds(selectedWeekKey)
      const [year, weekPart] = selectedWeekKey.split('-W')
      return {
        ...bounds,
        weekNumber: parseInt(weekPart),
        year: parseInt(year)
      }
    }
  }, [selectedWeekKey, currentWeekKey, currentMonday, currentSunday, weekNumber, currentYear])

  // Bornes semaine précédente pour comparaison
  const previousBounds = useMemo(() => {
    const prevWeek = new Date(selectedBounds.monday)
    prevWeek.setDate(prevWeek.getDate() - 7)
    const prevWeekKey = getWeekKey(prevWeek)
    return getWeekBounds(prevWeekKey)
  }, [selectedBounds])

  // Calcul des métriques par conseiller (MAJ pour selectedBounds)
  const advisorRows = useMemo(() => {
    const activeAdvisors = teamProfiles.filter(
      p => p.is_active && p.advisor_code
    )

    const currentDeals = getSignedDealsInRange(
      deals, selectedBounds.monday, selectedBounds.sunday
    )
    const previousDeals = getSignedDealsInRange(
      deals, previousBounds.monday, previousBounds.sunday
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
  }, [deals, teamProfiles, selectedBounds, previousBounds])

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

  // Statistiques produit pour tous les deals signés
  const productStats = useMemo(() => {
    const signedDeals = deals.filter(d => d.status === 'Signé')
    const productMap = {}

    signedDeals.forEach(deal => {
      const product = deal.product || 'Autre'
      if (!productMap[product]) {
        productMap[product] = { count: 0, pp: 0 }
      }
      productMap[product].count += 1
      productMap[product].pp += (deal.pp_m || 0) * 12
    })

    return Object.entries(productMap)
      .sort((a, b) => b[1].count - a[1].count)
  }, [deals])

  // Données graphique évolution signatures
  const signaturesChartData = useMemo(() => ({
    labels: weeklyHistory.map(w => w.label),
    datasets: [{
      label: 'Signatures',
      data: weeklyHistory.map(w => w.signatures),
      borderColor: '#C09B5A',
      backgroundColor: 'rgba(192, 155, 90, 0.1)',
      tension: 0.3,
      fill: true
    }]
  }), [weeklyHistory])

  // Données graphique répartition produit
  const productChartData = useMemo(() => ({
    labels: productStats.map(([product]) => product),
    datasets: [{
      label: 'Nombre de deals',
      data: productStats.map(([, stats]) => stats.count),
      backgroundColor: [
        'rgba(192, 155, 90, 0.8)',
        'rgba(27, 107, 70, 0.8)',
        'rgba(42, 82, 133, 0.8)',
        'rgba(122, 85, 32, 0.8)',
        'rgba(122, 42, 38, 0.8)',
      ],
    }]
  }), [productStats])

  // Données graphique performance conseillers
  const advisorChartData = useMemo(() => ({
    labels: advisorRows.map(r => r.advisor.full_name),
    datasets: [
      {
        label: 'Signatures semaine',
        data: advisorRows.map(r => r.currentSigs),
        backgroundColor: 'rgba(192, 155, 90, 0.8)',
      },
      {
        label: 'S-1',
        data: advisorRows.map(r => r.previousSigs),
        backgroundColor: 'rgba(192, 155, 90, 0.2)',
      }
    ]
  }), [advisorRows])

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

  // Reporter objectif de la semaine précédente
  function reportLastObjective() {
    if (lastObjective) {
      setWeekObjective({
        signatures_target: lastObjective.signatures_target,
        rdv_target: lastObjective.rdv_target
      })
      setShowObjectiveModal(true)
    }
  }

  // Export CSV enrichi
  function exportCSV() {
    setExportLoading(true)
    const weekLabel = selectedWeekKey
    const rows = []

    // En-tête
    rows.push(['ENTASIS CRM — Revue hebdomadaire'])
    rows.push([`Semaine ${selectedBounds.weekNumber} - ${selectedBounds.year}`])
    rows.push([`Du ${formatShortDate(selectedBounds.monday)} au ${formatShortDate(selectedFriday)}`])
    rows.push([]) // ligne vide

    // KPIs globaux
    rows.push(['INDICATEURS GLOBAUX'])
    rows.push(['Signatures semaine', totalCurrentSigs])
    rows.push(['PP Annualisée totale', Math.round(totalCurrentPp) + ' €'])
    rows.push(['PU totale', Math.round(totalCurrentPu) + ' €'])
    rows.push(['Projection vendredi', projectedSigs + ' signatures'])
    rows.push(['Objectif signatures', weekObjective.signatures_target || 'Non défini'])
    rows.push(['Progression objectif', objectiveProgress ? Math.round(objectiveProgress) + '%' : 'N/A'])
    rows.push([]) // ligne vide

    // Performance par conseiller
    rows.push(['PERFORMANCE PAR CONSEILLER'])
    rows.push([
      'Nom', 'Code', 'Signatures',
      'PP Annualisée (€)', 'PU (€)',
      'Tendance vs S-1', 'Signatures S-1'
    ])
    advisorRows.forEach(r => {
      rows.push([
        r.advisor.full_name,
        r.advisor.advisor_code,
        r.currentSigs,
        Math.round(r.currentPp),
        Math.round(r.currentPu),
        r.trend === 'up' ? '↑' : '↓',
        r.previousSigs
      ])
    })
    rows.push([
      'TOTAL CABINET', '',
      totalCurrentSigs,
      Math.round(totalCurrentPp),
      Math.round(totalCurrentPu),
      totalCurrentSigs >= totalPreviousSigs ? '↑' : '↓',
      totalPreviousSigs
    ])
    rows.push([]) // ligne vide

    // Détail des deals signés cette semaine
    rows.push(['DÉTAIL DES DEALS SIGNÉS CETTE SEMAINE'])
    rows.push([
      'Client', 'Produit', 'Conseiller',
      'Co-conseiller', 'PP mensuelle (€)',
      'PU (€)', 'PP annualisée (€)', 'Date signature'
    ])

    const currentWeekDeals = getSignedDealsInRange(
      deals, selectedBounds.monday, selectedBounds.sunday
    )
    currentWeekDeals.forEach(deal => {
      rows.push([
        deal.client,
        deal.product,
        deal.advisor_code,
        deal.co_advisor_code || '',
        deal.pp_m || 0,
        deal.pu || 0,
        Math.round((deal.pp_m || 0) * 12),
        deal.date_signed || 'N/A'
      ])
    })
    rows.push([]) // ligne vide

    // Répartition par produit
    rows.push(['RÉPARTITION PAR PRODUIT'])
    rows.push(['Produit', 'Nombre de deals', 'PP Annualisée totale (€)'])
    productStats.forEach(([product, stats]) => {
      rows.push([product, stats.count, Math.round(stats.pp)])
    })
    rows.push([]) // ligne vide

    // Historique
    rows.push(['HISTORIQUE DES SEMAINES'])
    rows.push(['Semaine', 'Signatures', 'PP Annualisée (€)', 'PU (€)'])
    weeklyHistory.forEach(w => {
      rows.push([
        w.label,
        w.signatures,
        Math.round(w.pp),
        Math.round(w.pu)
      ])
    })

    // Génération CSV avec BOM UTF-8 pour Excel
    const csv = rows.map(r =>
      r.map(cell =>
        typeof cell === 'string' && cell.includes(',')
          ? `"${cell}"`
          : cell
      ).join(';')
    ).join('\n')

    const blob = new Blob(
      ['\ufeff' + csv],
      { type: 'text/csv;charset=utf-8;' }
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `entasis-revue-S${String(selectedBounds.weekNumber).padStart(2,'0')}-${selectedBounds.year}.csv`
    link.click()
    URL.revokeObjectURL(url)
    setExportLoading(false)
    toast.success('Export téléchargé')
  }

  // Formatage des dates
  // Calcul correct des dates de la semaine pour selectedWeek
  const selectedFriday = new Date(selectedBounds.monday)
  selectedFriday.setDate(selectedBounds.monday.getDate() + 4)

  // Format d'affichage
  const formatShortDate = (date) =>
    date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'numeric'
    })

  const mondayStr = formatShortDate(selectedBounds.monday)
  const fridayStr = formatShortDate(selectedFriday)

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
          <div className="section-kicker">Semaine {selectedBounds.weekNumber} · {selectedBounds.year}</div>
          <div className="section-title">Revue hebdomadaire</div>
          <div className="section-sub">Du {mondayStr} au {fridayStr} {selectedWeekKey === currentWeekKey ? 'en cours' : ''}</div>
        </div>
        <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
          <select
            value={selectedWeekKey}
            onChange={e => setSelectedWeekKey(e.target.value)}
            style={{
              padding: '6px 12px',
              border: '1px solid #C09B5A',
              borderRadius: 6,
              background: 'white',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            {availableWeeks.map(wk => (
              <option key={wk} value={wk}>
                {wk === currentWeekKey ? `${wk} (semaine en cours)` : wk}
              </option>
            ))}
          </select>
          {lastObjective && weekObjective.signatures_target === 0 && selectedWeekKey === currentWeekKey && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={reportLastObjective}
              style={{fontSize: '11px'}}
            >
              Reporter S-1 ({lastObjective.signatures_target} sig.)
            </button>
          )}
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
        <table className="table" style={{width: '100%'}}>
          <thead>
            <tr>
              <th style={{paddingRight: '24px'}}>Conseiller</th>
              <th style={{textAlign: 'center', paddingRight: '24px'}}>Signatures</th>
              <th style={{textAlign: 'right', paddingRight: '24px'}}>CA PP</th>
              <th style={{textAlign: 'right', paddingRight: '24px'}}>CA PU</th>
              <th style={{textAlign: 'center'}}>Tendance</th>
            </tr>
          </thead>
          <tbody>
            {advisorRows.map((row, i) => (
              <tr key={row.advisor.advisor_code} style={{
                backgroundColor: row.currentSigs === 0 && today > 1 ? 'rgba(250, 165, 165, 0.1)' : 'transparent'
              }}>
                <td style={{paddingTop: '12px', paddingBottom: '12px', paddingRight: '24px'}}>
                  <div style={{ fontWeight: 600 }}>{row.advisor.full_name || row.advisor.advisor_code}</div>
                  <div style={{
                    fontSize: 11,
                    color: '#999',
                    marginTop: 2
                  }}>
                    {row.advisor.advisor_code}
                  </div>
                </td>
                <td style={{textAlign: 'center', fontWeight: '600', color: 'var(--t1)', paddingTop: '12px', paddingBottom: '12px', paddingRight: '24px'}}>
                  {row.currentSigs}
                </td>
                <td style={{textAlign: 'right', fontWeight: '600', paddingTop: '12px', paddingBottom: '12px', paddingRight: '24px'}}>
                  {euro(row.currentPp)}
                </td>
                <td style={{textAlign: 'right', fontWeight: '600', paddingTop: '12px', paddingBottom: '12px', paddingRight: '24px'}}>
                  {euro(row.currentPu)}
                </td>
                <td style={{textAlign: 'center', paddingTop: '12px', paddingBottom: '12px'}}>
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
                <table className="table" style={{width: '100%'}}>
                  <thead>
                    <tr>
                      <th style={{paddingRight: '32px'}}>Semaine</th>
                      <th style={{paddingRight: '32px', textAlign: 'center'}}>Signatures</th>
                      <th style={{paddingRight: '32px', textAlign: 'right'}}>PP Annualisée</th>
                      <th style={{paddingRight: '32px', textAlign: 'right'}}>PU</th>
                      <th style={{textAlign: 'center'}}>Taux/sem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyHistory.map((week, index) => {
                      const isCurrentWeek = week.weekKey === currentWeekKey
                      const isEven = index % 2 === 0
                      const baseColor = isEven ? 'rgba(0, 0, 0, 0.02)' : 'transparent'
                      const currentWeekColor = 'rgba(192, 155, 90, 0.1)'
                      return (
                        <tr
                          key={week.weekKey}
                          style={{
                            backgroundColor: isCurrentWeek ? currentWeekColor : baseColor
                          }}
                        >
                          <td style={{fontWeight: isCurrentWeek ? 600 : 400, paddingRight: '32px'}}>
                            {week.label}
                          </td>
                          <td style={{fontWeight: isCurrentWeek ? 600 : 400, paddingRight: '32px', textAlign: 'center'}}>
                            {week.signatures}
                          </td>
                          <td style={{fontWeight: isCurrentWeek ? 600 : 400, paddingRight: '32px', textAlign: 'right'}}>
                            {euro(week.pp)}
                          </td>
                          <td style={{fontWeight: isCurrentWeek ? 600 : 400, paddingRight: '32px', textAlign: 'right'}}>
                            {euro(week.pu)}
                          </td>
                          <td style={{fontWeight: isCurrentWeek ? 600 : 400, textAlign: 'center'}}>
                            {week.signatures} sig.
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

      {/* GRAPHIQUES */}
      <div className="mt-24">
        {/* GRAPHIQUE 1 - Evolution signatures (pleine largeur) */}
        <div className="card">
          <div className="card-header">
            <h3>Évolution des signatures</h3>
          </div>
          <div className="card-body">
            <div style={{height: '200px'}}>
              <Line
                data={signaturesChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false }
                  },
                  scales: {
                    x: {
                      grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    y: {
                      grid: { color: 'rgba(0,0,0,0.05)' }
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* GRAPHIQUES 2 et 3 - Côte à côte */}
        <div style={{display: 'flex', gap: '24px', marginTop: '24px'}}>
          {/* GRAPHIQUE 2 - Répartition produit */}
          <div className="card" style={{flex: 1}}>
            <div className="card-header">
              <h3>Répartition par produit (tous deals signés)</h3>
            </div>
            <div className="card-body">
              <div style={{height: '180px'}}>
                <Bar
                  data={productChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: {
                      legend: { display: false }
                    },
                    scales: {
                      x: {
                        grid: { color: 'rgba(0,0,0,0.05)' }
                      },
                      y: {
                        grid: { color: 'rgba(0,0,0,0.05)' }
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* GRAPHIQUE 3 - Performance conseillers */}
          <div className="card" style={{flex: 1}}>
            <div className="card-header">
              <h3>Performance conseillers — semaine vs S-1</h3>
            </div>
            <div className="card-body">
              <div style={{height: '180px'}}>
                <Bar
                  data={advisorChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        display: true,
                        position: 'bottom'
                      }
                    },
                    scales: {
                      x: {
                        grid: { color: 'rgba(0,0,0,0.05)' }
                      },
                      y: {
                        grid: { color: 'rgba(0,0,0,0.05)' }
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* COMPARAISON SEMAINES */}
      <div className="card mt-24">
        <div className="card-header">
          <h3>⚖️ Comparaison de semaines</h3>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setCompareMode(!compareMode)}
          >
            {compareMode ? 'Masquer' : 'Comparer'}
          </button>
        </div>
        {compareMode && (
          <div className="card-body">
            <div style={{display: 'flex', gap: '24px', marginBottom: '20px', alignItems: 'center'}}>
              <div style={{flex: 1}}>
                <label style={{display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500}}>Semaine A</label>
                <select
                  value={weekA}
                  onChange={e => setWeekA(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #C09B5A',
                    borderRadius: 6,
                    background: 'white'
                  }}
                >
                  <option value="">Sélectionner...</option>
                  {availableWeeks.map(wk => (
                    <option key={wk} value={wk}>{wk}</option>
                  ))}
                </select>
              </div>
              <div style={{padding: '20px 0', fontSize: '18px', fontWeight: 600, color: 'var(--gold)'}}>VS</div>
              <div style={{flex: 1}}>
                <label style={{display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500}}>Semaine B</label>
                <select
                  value={weekB}
                  onChange={e => setWeekB(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #C09B5A',
                    borderRadius: 6,
                    background: 'white'
                  }}
                >
                  <option value="">Sélectionner...</option>
                  {availableWeeks.map(wk => (
                    <option key={wk} value={wk}>{wk}</option>
                  ))}
                </select>
              </div>
            </div>

            {weekA && weekB && (() => {
              const boundsA = getWeekBounds(weekA)
              const boundsB = getWeekBounds(weekB)
              const dealsA = getSignedDealsInRange(deals, boundsA.monday, boundsA.sunday)
              const dealsB = getSignedDealsInRange(deals, boundsB.monday, boundsB.sunday)

              const sigsA = dealsA.length
              const sigsB = dealsB.length
              const ppA = dealsA.reduce((s, d) => s + (d.pp_m || 0) * 12, 0)
              const ppB = dealsB.reduce((s, d) => s + (d.pp_m || 0) * 12, 0)
              const puA = dealsA.reduce((s, d) => s + (d.pu || 0), 0)
              const puB = dealsB.reduce((s, d) => s + (d.pu || 0), 0)

              const deltaColor = (val) => val > 0 ? '#1B6B46' : val < 0 ? '#C0392B' : '#999'
              const deltaIcon = (val) => val > 0 ? '↑' : val < 0 ? '↓' : '='
              const deltaPct = (a, b) => b === 0 ? (a > 0 ? 100 : 0) : Math.round(((a - b) / b) * 100)

              return (
                <>
                  <table className="table" style={{width: '100%', marginBottom: '20px'}}>
                    <thead>
                      <tr>
                        <th>Métrique</th>
                        <th style={{textAlign: 'center'}}>Semaine A ({weekA})</th>
                        <th style={{textAlign: 'center'}}>Semaine B ({weekB})</th>
                        <th style={{textAlign: 'center'}}>Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Signatures total</td>
                        <td style={{textAlign: 'center', fontWeight: 600}}>{sigsA}</td>
                        <td style={{textAlign: 'center', fontWeight: 600}}>{sigsB}</td>
                        <td style={{textAlign: 'center', color: deltaColor(sigsA - sigsB), fontWeight: 600}}>
                          {deltaIcon(sigsA - sigsB)} {Math.abs(sigsA - sigsB)}
                        </td>
                      </tr>
                      <tr>
                        <td>PP Annualisée</td>
                        <td style={{textAlign: 'center', fontWeight: 600}}>{euro(ppA)}</td>
                        <td style={{textAlign: 'center', fontWeight: 600}}>{euro(ppB)}</td>
                        <td style={{textAlign: 'center', color: deltaColor(ppA - ppB), fontWeight: 600}}>
                          {deltaIcon(ppA - ppB)} {deltaPct(ppA, ppB)}%
                        </td>
                      </tr>
                      <tr>
                        <td>PU total</td>
                        <td style={{textAlign: 'center', fontWeight: 600}}>{euro(puA)}</td>
                        <td style={{textAlign: 'center', fontWeight: 600}}>{euro(puB)}</td>
                        <td style={{textAlign: 'center', color: deltaColor(puA - puB), fontWeight: 600}}>
                          {deltaIcon(puA - puB)} {deltaPct(puA, puB)}%
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <h4 style={{marginBottom: '12px', fontSize: '16px', fontWeight: 600}}>Performance par conseiller</h4>
                  <table className="table" style={{width: '100%'}}>
                    <thead>
                      <tr>
                        <th>Conseiller</th>
                        <th style={{textAlign: 'center'}}>Sig. A</th>
                        <th style={{textAlign: 'center'}}>Sig. B</th>
                        <th style={{textAlign: 'center'}}>Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamProfiles.filter(p => p.is_active && p.advisor_code).map(advisor => {
                        const myDealsA = dealsA.filter(d => d.advisor_code === advisor.advisor_code || d.co_advisor_code === advisor.advisor_code)
                        const myDealsB = dealsB.filter(d => d.advisor_code === advisor.advisor_code || d.co_advisor_code === advisor.advisor_code)
                        const mySigsA = myDealsA.reduce((s, d) => s + (d.co_advisor_code ? 0.5 : 1), 0)
                        const mySigsB = myDealsB.reduce((s, d) => s + (d.co_advisor_code ? 0.5 : 1), 0)
                        const delta = mySigsA - mySigsB

                        return (
                          <tr key={advisor.advisor_code}>
                            <td>{advisor.full_name || advisor.advisor_code}</td>
                            <td style={{textAlign: 'center', fontWeight: 600}}>{mySigsA}</td>
                            <td style={{textAlign: 'center', fontWeight: 600}}>{mySigsB}</td>
                            <td style={{textAlign: 'center', color: deltaColor(delta), fontWeight: 600}}>
                              {deltaIcon(delta)} {Math.abs(delta)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </>
              )
            })()}
          </div>
        )}
      </div>

      {/* MODAL OBJECTIFS */}
      <ObjectiveModal
        show={showObjectiveModal}
        objective={weekObjective}
        onSave={saveObjective}
        onClose={() => setShowObjectiveModal(false)}
        weekNumber={selectedBounds.weekNumber}
        year={selectedBounds.year}
      />
    </div>
  )
}