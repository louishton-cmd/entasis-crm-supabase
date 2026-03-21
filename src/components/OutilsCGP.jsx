import { useState, useMemo } from 'react'

const euro = (v) => Number(v||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0})
const pctFmt = (v) => Number(v||0).toLocaleString('fr-FR',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2})

const TOOLS = [
  {id:'epargne',  label:'Simulateur d\'épargne',    icon:'📈'},
  {id:'credit',   label:'Simulateur de crédit',      icon:'🏦'},
  {id:'fiscal',   label:'Estimation fiscale',        icon:'📊'},
  {id:'rente',    label:'Calcul de rente',           icon:'🔄'},
  {id:'frais',    label:'Comparateur de frais',      icon:'⚖️'},
  {id:'horizon',  label:'Horizon de placement',      icon:'🎯'},
]

/* ─────────────────────────────────────────────────────────────────────────────
   SIMULATEUR D'ÉPARGNE
───────────────────────────────────────────────────────────────────────────── */
function SimulateurEpargne() {
  const [capital, setCapital] = useState(10000)
  const [versement, setVersement] = useState(500)
  const [taux, setTaux] = useState(4)
  const [duree, setDuree] = useState(15)

  const result = useMemo(() => {
    const r = taux / 100 / 12
    const n = duree * 12
    let solde = capital
    const yearly = []
    for (let i = 1; i <= n; i++) {
      solde = solde * (1 + r) + versement
      if (i % 12 === 0) {
        const totalVerse = capital + versement * i
        yearly.push({ annee: i / 12, solde: Math.round(solde), verse: Math.round(totalVerse), gains: Math.round(solde - totalVerse) })
      }
    }
    const totalVerse = capital + versement * n
    return { final: Math.round(solde), totalVerse: Math.round(totalVerse), gains: Math.round(solde - totalVerse), yearly }
  }, [capital, versement, taux, duree])

  return (
    <div>
      <div className="outils-form-grid">
        <FormField label="Capital initial" value={capital} onChange={setCapital} suffix="€" />
        <FormField label="Versement mensuel" value={versement} onChange={setVersement} suffix="€" />
        <FormField label="Rendement annuel" value={taux} onChange={setTaux} suffix="%" step="0.1" />
        <FormField label="Durée" value={duree} onChange={setDuree} suffix="ans" />
      </div>
      <div className="outils-result-grid" style={{marginTop:20}}>
        <ResultCard label="Capital final" value={euro(result.final)} accent="var(--gold)" />
        <ResultCard label="Total versé" value={euro(result.totalVerse)} accent="var(--muted)" />
        <ResultCard label="Plus-values" value={euro(result.gains)} accent="#4ade80" />
        <ResultCard label="Rendement total" value={pctFmt(result.gains / Math.max(result.totalVerse, 1))} accent="#60a5fa" />
      </div>
      {result.yearly.length > 0 && (
        <div className="card" style={{marginTop:16,overflow:'auto'}}>
          <table className="outils-table">
            <thead>
              <tr><th>Année</th><th style={{textAlign:'right'}}>Total versé</th><th style={{textAlign:'right'}}>Plus-values</th><th style={{textAlign:'right'}}>Capital</th></tr>
            </thead>
            <tbody>
              {result.yearly.map(r => (
                <tr key={r.annee}>
                  <td>{r.annee}</td>
                  <td style={{textAlign:'right'}}>{euro(r.verse)}</td>
                  <td style={{textAlign:'right',color:'#4ade80'}}>{euro(r.gains)}</td>
                  <td style={{textAlign:'right',fontWeight:600}}>{euro(r.solde)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   SIMULATEUR DE CRÉDIT
───────────────────────────────────────────────────────────────────────────── */
function SimulateurCredit() {
  const [montant, setMontant] = useState(250000)
  const [tauxAnnuel, setTauxAnnuel] = useState(3.5)
  const [duree, setDuree] = useState(20)
  const [apport, setApport] = useState(50000)

  const result = useMemo(() => {
    const emprunt = montant - apport
    if (emprunt <= 0) return { mensualite: 0, coutTotal: 0, interets: 0, tauxEndettement: 0, emprunt: 0 }
    const r = tauxAnnuel / 100 / 12
    const n = duree * 12
    const mensualite = r > 0 ? emprunt * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) : emprunt / n
    const coutTotal = mensualite * n
    return {
      mensualite: Math.round(mensualite),
      coutTotal: Math.round(coutTotal),
      interets: Math.round(coutTotal - emprunt),
      emprunt,
    }
  }, [montant, tauxAnnuel, duree, apport])

  return (
    <div>
      <div className="outils-form-grid">
        <FormField label="Montant du bien" value={montant} onChange={setMontant} suffix="€" />
        <FormField label="Apport personnel" value={apport} onChange={setApport} suffix="€" />
        <FormField label="Taux annuel" value={tauxAnnuel} onChange={setTauxAnnuel} suffix="%" step="0.05" />
        <FormField label="Durée" value={duree} onChange={setDuree} suffix="ans" />
      </div>
      <div className="outils-result-grid" style={{marginTop:20}}>
        <ResultCard label="Montant emprunté" value={euro(result.emprunt)} accent="var(--muted)" />
        <ResultCard label="Mensualité" value={euro(result.mensualite)} accent="var(--gold)" />
        <ResultCard label="Coût total du crédit" value={euro(result.coutTotal)} accent="#f97316" />
        <ResultCard label="Intérêts totaux" value={euro(result.interets)} accent="#fb923c" />
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   ESTIMATION FISCALE (IR simplifié)
───────────────────────────────────────────────────────────────────────────── */
const TRANCHES_IR = [
  { min: 0, max: 11294, taux: 0 },
  { min: 11294, max: 28797, taux: 0.11 },
  { min: 28797, max: 82341, taux: 0.30 },
  { min: 82341, max: 177106, taux: 0.41 },
  { min: 177106, max: Infinity, taux: 0.45 },
]

function calcIR(revenuImposable, parts) {
  const quotient = revenuImposable / parts
  let impotQuotient = 0
  for (const tr of TRANCHES_IR) {
    if (quotient <= tr.min) break
    const assiette = Math.min(quotient, tr.max) - tr.min
    impotQuotient += assiette * tr.taux
  }
  return Math.round(impotQuotient * parts)
}

function EstimationFiscale() {
  const [revenu, setRevenu] = useState(60000)
  const [parts, setParts] = useState(2)
  const [deductions, setDeductions] = useState(0)

  const result = useMemo(() => {
    const imposable = Math.max(0, revenu - deductions)
    const ir = calcIR(imposable, parts)
    const tmi = (() => {
      const q = imposable / parts
      for (let i = TRANCHES_IR.length - 1; i >= 0; i--) {
        if (q > TRANCHES_IR[i].min) return TRANCHES_IR[i].taux
      }
      return 0
    })()
    return { imposable, ir, tauxMoyen: ir / Math.max(revenu, 1), tmi }
  }, [revenu, parts, deductions])

  return (
    <div>
      <div className="outils-form-grid">
        <FormField label="Revenu net annuel" value={revenu} onChange={setRevenu} suffix="€" />
        <FormField label="Parts fiscales" value={parts} onChange={setParts} suffix="parts" step="0.5" />
        <FormField label="Déductions" value={deductions} onChange={setDeductions} suffix="€" />
      </div>
      <div className="outils-result-grid" style={{marginTop:20}}>
        <ResultCard label="Revenu imposable" value={euro(result.imposable)} accent="var(--muted)" />
        <ResultCard label="Impôt estimé" value={euro(result.ir)} accent="#ef4444" />
        <ResultCard label="Taux moyen" value={pctFmt(result.tauxMoyen)} accent="#f97316" />
        <ResultCard label="TMI" value={`${Math.round(result.tmi * 100)}%`} accent="var(--gold)" />
      </div>
      <div className="card card-p" style={{marginTop:16}}>
        <div style={{fontSize:13,color:'var(--muted)',marginBottom:8}}>Détail par tranche (barème 2025 sur revenus 2024)</div>
        {TRANCHES_IR.map((tr, i) => {
          const q = Math.max(0, result.imposable / parts)
          const assiette = Math.max(0, Math.min(q, tr.max) - tr.min)
          if (assiette <= 0 && i > 0) return null
          return (
            <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--bd)',fontSize:13}}>
              <span style={{color:'var(--muted)'}}>{tr.taux === 0 ? '0%' : `${Math.round(tr.taux * 100)}%`} — {tr.max === Infinity ? `> ${euro(tr.min)}` : `${euro(tr.min)} → ${euro(tr.max)}`}</span>
              <span style={{fontWeight:600}}>{euro(assiette * tr.taux * parts)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   CALCUL DE RENTE
───────────────────────────────────────────────────────────────────────────── */
function CalculRente() {
  const [capital, setCapital] = useState(500000)
  const [taux, setTaux] = useState(3)
  const [dureeRente, setDureeRente] = useState(25)

  const result = useMemo(() => {
    const r = taux / 100 / 12
    const n = dureeRente * 12
    const mensuelle = r > 0 ? capital * r / (1 - Math.pow(1 + r, -n)) : capital / n
    const annuelle = mensuelle * 12
    const totalPercu = mensuelle * n
    return { mensuelle: Math.round(mensuelle), annuelle: Math.round(annuelle), totalPercu: Math.round(totalPercu) }
  }, [capital, taux, dureeRente])

  return (
    <div>
      <div className="outils-form-grid">
        <FormField label="Capital disponible" value={capital} onChange={setCapital} suffix="€" />
        <FormField label="Rendement annuel" value={taux} onChange={setTaux} suffix="%" step="0.1" />
        <FormField label="Durée de la rente" value={dureeRente} onChange={setDureeRente} suffix="ans" />
      </div>
      <div className="outils-result-grid" style={{marginTop:20}}>
        <ResultCard label="Rente mensuelle" value={euro(result.mensuelle)} accent="var(--gold)" />
        <ResultCard label="Rente annuelle" value={euro(result.annuelle)} accent="#4ade80" />
        <ResultCard label="Total perçu" value={euro(result.totalPercu)} accent="#60a5fa" />
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   COMPARATEUR DE FRAIS
───────────────────────────────────────────────────────────────────────────── */
function ComparateurFrais() {
  const [capital, setCapital] = useState(100000)
  const [duree, setDuree] = useState(10)
  const [rendement, setRendement] = useState(5)
  const [fraisEntree, setFraisEntree] = useState(2)
  const [fraisGestion, setFraisGestion] = useState(0.8)

  const result = useMemo(() => {
    const capitalNet = capital * (1 - fraisEntree / 100)
    const tauxNet = (rendement - fraisGestion) / 100
    const tauxBrut = rendement / 100

    const finalBrut = capital * Math.pow(1 + tauxBrut, duree)
    const finalNet = capitalNet * Math.pow(1 + tauxNet, duree)
    const manqueGagner = finalBrut - finalNet
    const totalFraisEntree = capital - capitalNet
    const totalFraisGestion = Math.round(manqueGagner - totalFraisEntree)

    return {
      finalBrut: Math.round(finalBrut),
      finalNet: Math.round(finalNet),
      manqueGagner: Math.round(manqueGagner),
      totalFraisEntree: Math.round(totalFraisEntree),
      totalFraisGestion,
      impactPct: manqueGagner / Math.max(finalBrut, 1),
    }
  }, [capital, duree, rendement, fraisEntree, fraisGestion])

  return (
    <div>
      <div className="outils-form-grid">
        <FormField label="Capital investi" value={capital} onChange={setCapital} suffix="€" />
        <FormField label="Durée" value={duree} onChange={setDuree} suffix="ans" />
        <FormField label="Rendement brut" value={rendement} onChange={setRendement} suffix="%" step="0.1" />
        <FormField label="Frais d'entrée" value={fraisEntree} onChange={setFraisEntree} suffix="%" step="0.1" />
        <FormField label="Frais de gestion / an" value={fraisGestion} onChange={setFraisGestion} suffix="%" step="0.05" />
      </div>
      <div className="outils-result-grid" style={{marginTop:20}}>
        <ResultCard label="Capital sans frais" value={euro(result.finalBrut)} accent="#4ade80" />
        <ResultCard label="Capital net de frais" value={euro(result.finalNet)} accent="var(--gold)" />
        <ResultCard label="Coût total des frais" value={euro(result.manqueGagner)} accent="#ef4444" />
        <ResultCard label="Impact frais" value={pctFmt(result.impactPct)} accent="#f97316" />
      </div>
      <div className="card card-p" style={{marginTop:16}}>
        <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--bd)',fontSize:13}}>
          <span style={{color:'var(--muted)'}}>Frais d'entrée</span>
          <span style={{fontWeight:600,color:'#fb923c'}}>{euro(result.totalFraisEntree)}</span>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:13}}>
          <span style={{color:'var(--muted)'}}>Frais de gestion cumulés</span>
          <span style={{fontWeight:600,color:'#fb923c'}}>{euro(result.totalFraisGestion)}</span>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   HORIZON DE PLACEMENT
───────────────────────────────────────────────────────────────────────────── */
function HorizonPlacement() {
  const [objectif, setObjectif] = useState(500000)
  const [capitalDepart, setCapitalDepart] = useState(20000)
  const [versement, setVersement] = useState(1000)
  const [taux, setTaux] = useState(5)

  const result = useMemo(() => {
    const r = taux / 100 / 12
    if (r <= 0) {
      const mois = Math.max(0, (objectif - capitalDepart)) / Math.max(versement, 1)
      return { mois: Math.ceil(mois), annees: Math.ceil(mois / 12), totalVerse: capitalDepart + versement * Math.ceil(mois) }
    }
    let solde = capitalDepart
    let mois = 0
    const maxMois = 600
    while (solde < objectif && mois < maxMois) {
      solde = solde * (1 + r) + versement
      mois++
    }
    return {
      mois,
      annees: Math.round(mois / 12 * 10) / 10,
      totalVerse: capitalDepart + versement * mois,
      atteint: solde >= objectif,
    }
  }, [objectif, capitalDepart, versement, taux])

  return (
    <div>
      <div className="outils-form-grid">
        <FormField label="Objectif patrimonial" value={objectif} onChange={setObjectif} suffix="€" />
        <FormField label="Capital de départ" value={capitalDepart} onChange={setCapitalDepart} suffix="€" />
        <FormField label="Versement mensuel" value={versement} onChange={setVersement} suffix="€" />
        <FormField label="Rendement annuel" value={taux} onChange={setTaux} suffix="%" step="0.1" />
      </div>
      <div className="outils-result-grid" style={{marginTop:20}}>
        <ResultCard label="Durée estimée" value={result.atteint === false ? '> 50 ans' : `${result.annees} ans`} accent="var(--gold)" />
        <ResultCard label="Mois nécessaires" value={result.atteint === false ? '> 600' : `${result.mois} mois`} accent="#60a5fa" />
        <ResultCard label="Total versé" value={euro(result.totalVerse)} accent="var(--muted)" />
        <ResultCard label="Plus-values générées" value={euro(Math.max(0, objectif - result.totalVerse))} accent="#4ade80" />
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   SHARED UI COMPONENTS
───────────────────────────────────────────────────────────────────────────── */
function FormField({ label, value, onChange, suffix, step = '1' }) {
  return (
    <div className="outils-field">
      <label className="outils-label">{label}</label>
      <div className="outils-input-wrap">
        <input
          type="number"
          className="outils-input"
          value={value}
          step={step}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
        />
        {suffix && <span className="outils-suffix">{suffix}</span>}
      </div>
    </div>
  )
}

function ResultCard({ label, value, accent }) {
  return (
    <div className="card card-p outils-result-card">
      <div className="outils-result-label">{label}</div>
      <div className="outils-result-value" style={{ color: accent }}>{value}</div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
const TOOL_COMPONENTS = {
  epargne: SimulateurEpargne,
  credit: SimulateurCredit,
  fiscal: EstimationFiscale,
  rente: CalculRente,
  frais: ComparateurFrais,
  horizon: HorizonPlacement,
}

export default function OutilsCGP() {
  const [activeTool, setActiveTool] = useState('epargne')
  const ActiveComponent = TOOL_COMPONENTS[activeTool]

  return (
    <div className="outils-cgp">
      <style>{`
        .outils-cgp { display: flex; flex-direction: column; gap: 20px; }
        .outils-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
        .outils-tab {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 16px; border-radius: var(--rad-md, 8px);
          background: var(--card); border: 1px solid var(--bd);
          color: var(--muted); font-size: 13px; font-weight: 500;
          cursor: pointer; transition: all .15s;
        }
        .outils-tab:hover { border-color: var(--gold); color: var(--fg); }
        .outils-tab.active { background: rgba(201,168,76,0.12); border-color: var(--gold); color: var(--gold); }
        .outils-tab-icon { font-size: 16px; }
        .outils-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
        .outils-field { display: flex; flex-direction: column; gap: 6px; }
        .outils-label { font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
        .outils-input-wrap {
          display: flex; align-items: center;
          background: var(--card); border: 1px solid var(--bd); border-radius: var(--rad-md, 8px);
          overflow: hidden;
        }
        .outils-input {
          flex: 1; padding: 10px 12px; background: transparent; border: none;
          color: var(--fg); font-size: 15px; font-weight: 600; outline: none;
          font-family: inherit;
        }
        .outils-input:focus { box-shadow: inset 0 0 0 1px var(--gold); }
        .outils-suffix { padding: 0 12px; font-size: 12px; color: var(--muted); font-weight: 600; white-space: nowrap; }
        .outils-result-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; }
        .outils-result-card { text-align: center; }
        .outils-result-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 6px; }
        .outils-result-value { font-size: 22px; font-weight: 700; }
        .outils-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .outils-table th { text-align: left; padding: 8px 12px; color: var(--muted); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid var(--bd); }
        .outils-table td { padding: 8px 12px; border-bottom: 1px solid var(--bd); }
        .outils-table tr:last-child td { border-bottom: none; }
        .outils-table tr:hover td { background: rgba(255,255,255,0.02); }
      `}</style>

      <div className="outils-tabs">
        {TOOLS.map(t => (
          <button
            key={t.id}
            className={`outils-tab${activeTool === t.id ? ' active' : ''}`}
            onClick={() => setActiveTool(t.id)}
          >
            <span className="outils-tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card card-p">
        <ActiveComponent />
      </div>
    </div>
  )
}
