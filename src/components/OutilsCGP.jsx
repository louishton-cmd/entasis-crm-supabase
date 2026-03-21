import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler)

/* ─────────────────────────────────────────────────────────────────────────────
   DESIGN TOKENS
───────────────────────────────────────────────────────────────────────────── */
const C = {
  bg: '#1a1a1a', card: '#242424', cardHover: '#2a2a2a',
  ivory: '#f5f0e8', ivoryMuted: '#b8b0a2', ivoryDim: '#8a8278',
  gold: '#C9A84C', goldDark: '#9A7B3A', goldLine: 'rgba(201,168,76,0.3)', goldBg: 'rgba(201,168,76,0.08)',
  danger: '#ef4444', success: '#4ade80', info: '#60a5fa', warn: '#fb923c',
  bd: 'rgba(255,255,255,0.08)', bdGold: 'rgba(201,168,76,0.3)',
  inputBg: '#1a1a1a',
}
const FONT_SERIF = "'Cormorant Garamond', 'Playfair Display', Georgia, serif"
const FONT_SANS = "'DM Sans', system-ui, sans-serif"

/* ─────────────────────────────────────────────────────────────────────────────
   TAX ENGINE (barème 2025 sur revenus 2024)
───────────────────────────────────────────────────────────────────────────── */
const TRANCHES_IR = [
  { min: 0, max: 11294, taux: 0 },
  { min: 11294, max: 28797, taux: 0.11 },
  { min: 28797, max: 82341, taux: 0.30 },
  { min: 82341, max: 177106, taux: 0.41 },
  { min: 177106, max: Infinity, taux: 0.45 },
]

function calcIR(revenuImposable, parts) {
  const q = revenuImposable / parts
  let imp = 0
  for (const tr of TRANCHES_IR) {
    if (q <= tr.min) break
    imp += (Math.min(q, tr.max) - tr.min) * tr.taux
  }
  return Math.round(imp * parts)
}

function getTMI(revenuImposable, parts) {
  const q = revenuImposable / parts
  for (let i = TRANCHES_IR.length - 1; i >= 0; i--) {
    if (q > TRANCHES_IR[i].min) return TRANCHES_IR[i].taux
  }
  return 0
}

/* ─────────────────────────────────────────────────────────────────────────────
   FORMATTERS
───────────────────────────────────────────────────────────────────────────── */
const euro = (v) => Number(v || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const pctFmt = (v) => `${(Number(v || 0) * 100).toFixed(1)}%`

/* ─────────────────────────────────────────────────────────────────────────────
   CHART DEFAULTS
───────────────────────────────────────────────────────────────────────────── */
const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: C.ivoryMuted, font: { family: FONT_SANS, size: 11 }, boxWidth: 12, padding: 16 } },
    tooltip: { backgroundColor: C.card, titleColor: C.ivory, bodyColor: C.ivoryMuted, borderColor: C.goldLine, borderWidth: 1, padding: 10, titleFont: { family: FONT_SANS, size: 12, weight: 600 }, bodyFont: { family: FONT_SANS, size: 11 }, callbacks: { label: ctx => `${ctx.dataset.label}: ${euro(ctx.parsed.y)}` } },
  },
  scales: {
    x: { grid: { color: C.bd }, ticks: { color: C.ivoryDim, font: { family: FONT_SANS, size: 10 } } },
    y: { grid: { color: C.bd }, ticks: { color: C.ivoryDim, font: { family: FONT_SANS, size: 10 }, callback: v => euro(v) } },
  },
}

/* ─────────────────────────────────────────────────────────────────────────────
   AI HELPER
───────────────────────────────────────────────────────────────────────────── */
async function callAI(system, userMsg) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, system, messages: [{ role: 'user', content: userMsg }] }),
  })
  const data = await res.json()
  return data.content?.[0]?.text || 'Erreur : pas de réponse'
}

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED UI COMPONENTS
═══════════════════════════════════════════════════════════════════════════ */
function Slider({ label, value, onChange, min, max, step = 1, suffix = '', formatValue }) {
  const display = formatValue ? formatValue(value) : `${value.toLocaleString('fr-FR')} ${suffix}`
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', fontFamily: FONT_SANS }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.gold, fontFamily: FONT_SERIF }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: C.gold, height: 6, cursor: 'pointer' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.ivoryDim, marginTop: 2 }}>
        <span>{min.toLocaleString('fr-FR')}{suffix && ` ${suffix}`}</span>
        <span>{max.toLocaleString('fr-FR')}{suffix && ` ${suffix}`}</span>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, suffix, type = 'number', step = '1', placeholder }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', fontFamily: FONT_SANS }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', background: C.inputBg, border: `1px solid ${C.bdGold}`, borderRadius: 8, overflow: 'hidden' }}>
        {type === 'select' ? (
          <select value={value} onChange={e => onChange(e.target.value)}
            style={{ flex: 1, padding: '10px 12px', background: 'transparent', border: 'none', color: C.ivory, fontSize: 14, fontWeight: 600, outline: 'none', fontFamily: FONT_SANS, cursor: 'pointer' }}>
            {placeholder}
          </select>
        ) : type === 'textarea' ? (
          <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={4}
            style={{ flex: 1, padding: '10px 12px', background: 'transparent', border: 'none', color: C.ivory, fontSize: 13, outline: 'none', fontFamily: FONT_SANS, resize: 'vertical', lineHeight: 1.6 }} />
        ) : (
          <input type={type} value={value} step={step} placeholder={placeholder}
            onChange={e => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
            style={{ flex: 1, padding: '10px 12px', background: 'transparent', border: 'none', color: C.ivory, fontSize: 14, fontWeight: 600, outline: 'none', fontFamily: FONT_SANS }} />
        )}
        {suffix && <span style={{ padding: '0 12px', fontSize: 11, color: C.ivoryDim, fontWeight: 600, whiteSpace: 'nowrap' }}>{suffix}</span>}
      </div>
    </div>
  )
}

function ResultCard({ label, value, sub, accent = C.gold }) {
  return (
    <div style={{ background: C.card, borderLeft: `3px solid ${accent}`, borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.ivoryDim, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6, fontFamily: FONT_SANS }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent, fontFamily: FONT_SERIF, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.ivoryMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function PillSelect({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(o => {
        const key = typeof o === 'string' ? o : o.value
        const label = typeof o === 'string' ? o : o.label
        const active = value === key
        return (
          <button key={key} onClick={() => onChange(key)}
            style={{
              padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: FONT_SANS, transition: 'all .15s', border: `1px solid ${active ? C.gold : C.bdGold}`,
              background: active ? C.gold : 'transparent', color: active ? '#1a1a1a' : C.ivoryMuted,
            }}>
            {label}
          </button>
        )
      })}
    </div>
  )
}

function Btn({ children, onClick, variant = 'gold', disabled, style: extraStyle }) {
  const styles = {
    gold: { background: C.gold, color: '#1a1a1a', border: 'none' },
    outline: { background: 'transparent', color: C.gold, border: `1px solid ${C.bdGold}` },
    ghost: { background: 'transparent', color: C.ivoryMuted, border: `1px solid ${C.bd}` },
    danger: { background: 'transparent', color: C.danger, border: `1px solid rgba(239,68,68,0.3)` },
  }
  const s = styles[variant] || styles.gold
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ ...s, padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: FONT_SANS, opacity: disabled ? 0.5 : 1, transition: 'all .15s', display: 'inline-flex', alignItems: 'center', gap: 6, ...extraStyle }}>
      {children}
    </button>
  )
}

function SectionDivider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 16px' }}>
      <div style={{ flex: 1, height: 1, background: C.bd }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: C.ivoryDim, textTransform: 'uppercase', letterSpacing: '.1em', fontFamily: FONT_SANS }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: C.bd }} />
    </div>
  )
}

function copyText(text) {
  navigator.clipboard.writeText(text).catch(() => {})
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 1 — CALCULATEUR DÉFISCALISATION
═══════════════════════════════════════════════════════════════════════════ */
const SITUATIONS = [
  { value: 'celibataire', label: 'Célibataire', parts: 1 },
  { value: 'couple', label: 'Couple marié/pacsé', parts: 2 },
  { value: 'couple_1e', label: 'Couple + 1 enfant', parts: 2.5 },
  { value: 'couple_2e', label: 'Couple + 2 enfants', parts: 3 },
  { value: 'couple_3e', label: 'Couple + 3 enfants', parts: 4 },
  { value: 'parent_isole', label: 'Parent isolé + 1 enfant', parts: 2 },
]

const DISPOSITIFS_DEFISC = [
  { value: 'per', label: 'PER Individuel', desc: 'Déduction du revenu imposable', maxPct: 0.10 },
  { value: 'deficit_foncier', label: 'Déficit Foncier', desc: 'Déduction des travaux (max 10 700 €/an)', maxAnnuel: 10700 },
  { value: 'scpi_fiscal', label: 'SCPI Fiscale', desc: 'Réduction proportionnelle', reducPct: 0.18 },
  { value: 'monument_historique', label: 'Monument Historique', desc: 'Déduction totale des travaux', maxPct: 1 },
]

function CalculateurDefiscalisation() {
  const [revenu, setRevenu] = useState(75000)
  const [situation, setSituation] = useState('couple')
  const [dispositif, setDispositif] = useState('per')
  const [montantInvesti, setMontantInvesti] = useState(10000)
  const [copied, setCopied] = useState(false)

  const parts = SITUATIONS.find(s => s.value === situation)?.parts || 1
  const disp = DISPOSITIFS_DEFISC.find(d => d.value === dispositif)

  const result = useMemo(() => {
    const irAvant = calcIR(revenu, parts)
    const tmi = getTMI(revenu, parts)
    let deduction = 0
    let reduction = 0

    if (dispositif === 'per') {
      const plafond = Math.max(revenu * 0.10, 4399)
      deduction = Math.min(montantInvesti, plafond)
    } else if (dispositif === 'deficit_foncier') {
      deduction = Math.min(montantInvesti, 10700)
    } else if (dispositif === 'scpi_fiscal') {
      reduction = montantInvesti * 0.18
    } else if (dispositif === 'monument_historique') {
      deduction = montantInvesti
    }

    const revenuApres = Math.max(0, revenu - deduction)
    const irApres = Math.max(0, calcIR(revenuApres, parts) - reduction)
    const economie = irAvant - irApres
    const effortReel = montantInvesti - economie

    return { irAvant, irApres, tmi, economie, effortReel, deduction, reduction, revenuApres }
  }, [revenu, parts, dispositif, montantInvesti])

  function handleCopy() {
    const summary = `SIMULATION DÉFISCALISATION — Entasis Conseil
─────────────────────────────────
Revenu net imposable : ${euro(revenu)}
Situation : ${SITUATIONS.find(s => s.value === situation)?.label} (${parts} parts)
Dispositif : ${disp?.label}
Montant investi : ${euro(montantInvesti)}

TMI : ${Math.round(result.tmi * 100)}%
Impôt avant : ${euro(result.irAvant)}
Impôt après : ${euro(result.irApres)}
Économie fiscale : ${euro(result.economie)}
Effort réel : ${euro(result.effortReel)}
─────────────────────────────────
Simulation indicative — Entasis Conseil`
    copyText(summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <Slider label="Revenu net imposable" value={revenu} onChange={setRevenu} min={15000} max={300000} step={1000} suffix="€" formatValue={v => euro(v)} />

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontFamily: FONT_SANS }}>Situation familiale</div>
        <PillSelect options={SITUATIONS} value={situation} onChange={setSituation} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontFamily: FONT_SANS }}>Dispositif de défiscalisation</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {DISPOSITIFS_DEFISC.map(d => (
            <button key={d.value} onClick={() => setDispositif(d.value)}
              style={{
                textAlign: 'left', padding: '12px 14px', borderRadius: 10,
                border: `1px solid ${d.value === dispositif ? C.gold : C.bdGold}`,
                background: d.value === dispositif ? C.goldBg : 'transparent',
                cursor: 'pointer', transition: 'all .15s',
              }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: d.value === dispositif ? C.gold : C.ivory, fontFamily: FONT_SANS }}>{d.label}</div>
              <div style={{ fontSize: 10.5, color: C.ivoryDim, marginTop: 2 }}>{d.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <Slider label="Montant investi" value={montantInvesti} onChange={setMontantInvesti} min={1000} max={100000} step={500} suffix="€" formatValue={v => euro(v)} />

      <SectionDivider label="Résultats" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <ResultCard label="TMI" value={`${Math.round(result.tmi * 100)}%`} />
        <ResultCard label="Impôt avant" value={euro(result.irAvant)} accent={C.danger} />
        <ResultCard label="Impôt après" value={euro(result.irApres)} accent={C.success} />
        <ResultCard label="Économie fiscale" value={euro(result.economie)} accent={C.gold} sub={`Effort réel : ${euro(result.effortReel)}`} />
      </div>

      <div style={{ background: C.card, borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryDim, textTransform: 'uppercase', marginBottom: 10, fontFamily: FONT_SANS }}>Détail par tranche</div>
        {TRANCHES_IR.map((tr, i) => {
          const q = result.revenuApres / parts
          const assiette = Math.max(0, Math.min(q, tr.max) - tr.min)
          if (assiette <= 0 && i > 0) return null
          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${C.bd}`, fontSize: 12 }}>
              <span style={{ color: C.ivoryDim }}>{Math.round(tr.taux * 100)}% — {tr.max === Infinity ? `> ${euro(tr.min)}` : `${euro(tr.min)} → ${euro(tr.max)}`}</span>
              <span style={{ fontWeight: 600, color: C.ivory }}>{euro(assiette * tr.taux * parts)}</span>
            </div>
          )
        })}
      </div>

      <Btn onClick={handleCopy} variant={copied ? 'outline' : 'gold'}>{copied ? '✓ Copié' : 'Copier le résumé'}</Btn>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 2 — SIMULATEUR PER
═══════════════════════════════════════════════════════════════════════════ */
function SimulateurPER() {
  const [age, setAge] = useState(35)
  const [ageRetraite, setAgeRetraite] = useState(65)
  const [versementMensuel, setVersementMensuel] = useState(500)
  const [versementInitial, setVersementInitial] = useState(10000)
  const [tmi, setTmi] = useState(30)

  const duree = Math.max(1, ageRetraite - age)

  const result = useMemo(() => {
    const rates = [0.03, 0.05, 0.07]
    const labels = ['Prudent (3%)', 'Équilibré (5%)', 'Dynamique (7%)']
    const curves = rates.map(rate => {
      const r = rate / 12
      const n = duree * 12
      let solde = versementInitial
      const yearly = []
      for (let i = 1; i <= n; i++) {
        solde = solde * (1 + r) + versementMensuel
        if (i % 12 === 0) yearly.push(Math.round(solde))
      }
      return { rate, yearly, final: Math.round(solde) }
    })

    const totalVerse = versementInitial + versementMensuel * 12 * duree
    const economieFiscaleAnnuelle = Math.round(versementMensuel * 12 * (tmi / 100))
    const economieFiscaleTotale = economieFiscaleAnnuelle * duree
    const effortNet = versementMensuel * 12 - economieFiscaleAnnuelle

    // Rente mensuelle estimée (taux conversion 3%, espérance vie 25 ans)
    const r3 = 0.03 / 12
    const n25 = 25 * 12
    const renteMensuelle = curves.map(c => {
      return Math.round(c.final * r3 / (1 - Math.pow(1 + r3, -n25)))
    })

    return { curves, labels, totalVerse, economieFiscaleAnnuelle, economieFiscaleTotale, effortNet, renteMensuelle, duree }
  }, [age, ageRetraite, versementMensuel, versementInitial, tmi, duree])

  const chartData = {
    labels: Array.from({ length: result.duree }, (_, i) => `${age + i + 1} ans`),
    datasets: result.curves.map((c, i) => ({
      label: result.labels[i],
      data: c.yearly,
      borderColor: [C.info, C.gold, C.success][i],
      backgroundColor: [`${C.info}15`, `${C.gold}15`, `${C.success}15`][i],
      fill: i === 1,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2,
    })),
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <Slider label="Votre âge" value={age} onChange={setAge} min={18} max={60} suffix="ans" />
          <Slider label="Âge de départ en retraite" value={ageRetraite} onChange={setAgeRetraite} min={55} max={70} suffix="ans" />
          <Slider label="Versement mensuel" value={versementMensuel} onChange={setVersementMensuel} min={50} max={3000} step={50} suffix="€" formatValue={v => euro(v)} />
          <Slider label="Versement initial" value={versementInitial} onChange={setVersementInitial} min={0} max={100000} step={1000} suffix="€" formatValue={v => euro(v)} />
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontFamily: FONT_SANS }}>Votre TMI</div>
            <PillSelect options={[{ value: 0, label: '0%' }, { value: 11, label: '11%' }, { value: 30, label: '30%' }, { value: 41, label: '41%' }, { value: 45, label: '45%' }]} value={tmi} onChange={v => setTmi(Number(v))} />
          </div>
        </div>

        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {result.curves.map((c, i) => (
              <ResultCard key={i} label={`Capital ${result.labels[i]}`} value={euro(c.final)} accent={[C.info, C.gold, C.success][i]} sub={`Rente : ${euro(result.renteMensuelle[i])}/mois`} />
            ))}
            <ResultCard label="Économie fiscale / an" value={euro(result.economieFiscaleAnnuelle)} accent={C.gold} sub={`Total : ${euro(result.economieFiscaleTotale)}`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <ResultCard label="Total versé" value={euro(result.totalVerse)} accent={C.ivoryDim} />
            <ResultCard label="Effort net annuel" value={euro(result.effortNet)} accent={C.warn} sub="Après avantage fiscal" />
          </div>
        </div>
      </div>

      <SectionDivider label="Projection du capital" />
      <div style={{ height: 300, background: C.card, borderRadius: 10, padding: 16 }}>
        <Line data={chartData} options={{ ...chartDefaults }} />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 3 — SIMULATEUR ASSURANCE VIE
═══════════════════════════════════════════════════════════════════════════ */
function SimulateurAssuranceVie() {
  const [capitalInitial, setCapitalInitial] = useState(30000)
  const [versementMensuel, setVersementMensuel] = useState(300)
  const [duree, setDuree] = useState(15)
  const [pctEuro, setPctEuro] = useState(30)
  const [rendEuro, setRendEuro] = useState(2.5)
  const [rendUC, setRendUC] = useState(6)

  const pctUC = 100 - pctEuro

  const result = useMemo(() => {
    const rendGlobal = (pctEuro / 100 * rendEuro + pctUC / 100 * rendUC) / 100
    const r = rendGlobal / 12
    const n = duree * 12

    let soldeBrut = capitalInitial
    let soldeNet = capitalInitial
    const yearlyBrut = []
    const yearlyNet = []

    for (let i = 1; i <= n; i++) {
      soldeBrut = soldeBrut * (1 + r) + versementMensuel
      // Fiscalité simplifiée: PS 17.2% sur gains pour fonds euro annuellement
      const gainMensuel = soldeNet * r
      const ps = gainMensuel * (pctEuro / 100) * 0.172
      soldeNet = soldeNet * (1 + r) + versementMensuel - ps

      if (i % 12 === 0) {
        yearlyBrut.push(Math.round(soldeBrut))
        yearlyNet.push(Math.round(soldeNet))
      }
    }

    const totalVerse = capitalInitial + versementMensuel * n
    const interetsBruts = Math.round(soldeBrut - totalVerse)
    const interetsNets = Math.round(soldeNet - totalVerse)

    // Fiscalité rachat après 8 ans
    const abattement = 4600 // célibataire — 9200 couple
    const gainsRachat = interetsBruts
    const pfuApres8 = Math.max(0, gainsRachat - abattement) * 0.247 // 24.7% = 7.5% IR + 17.2% PS
    const netApres8 = Math.round(soldeBrut - pfuApres8)

    return { capitalBrut: Math.round(soldeBrut), capitalNet: Math.round(soldeNet), totalVerse, interetsBruts, interetsNets, rendGlobal, pfuApres8: Math.round(pfuApres8), netApres8, yearlyBrut, yearlyNet }
  }, [capitalInitial, versementMensuel, duree, pctEuro, rendEuro, rendUC, pctUC])

  const chartData = {
    labels: Array.from({ length: duree }, (_, i) => `An ${i + 1}`),
    datasets: [
      { label: 'Capital brut', data: result.yearlyBrut, borderColor: C.gold, backgroundColor: `${C.gold}15`, fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
      { label: 'Capital net (PS déduits)', data: result.yearlyNet, borderColor: C.info, backgroundColor: `${C.info}10`, fill: false, tension: 0.3, pointRadius: 0, borderWidth: 2, borderDash: [5, 3] },
    ],
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <Slider label="Capital initial" value={capitalInitial} onChange={setCapitalInitial} min={0} max={500000} step={5000} suffix="€" formatValue={v => euro(v)} />
          <Slider label="Versements mensuels" value={versementMensuel} onChange={setVersementMensuel} min={0} max={5000} step={50} suffix="€" formatValue={v => euro(v)} />
          <Slider label="Durée" value={duree} onChange={setDuree} min={1} max={40} suffix="ans" />
          <SectionDivider label="Répartition" />
          <Slider label={`Fonds Euro (${pctEuro}%)`} value={pctEuro} onChange={setPctEuro} min={0} max={100} step={5} suffix="%" />
          <Slider label="Rendement fonds Euro" value={rendEuro} onChange={setRendEuro} min={0.5} max={5} step={0.1} suffix="%" />
          <Slider label="Rendement UC" value={rendUC} onChange={setRendUC} min={0} max={12} step={0.5} suffix="%" />
        </div>

        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <ResultCard label="Capital final brut" value={euro(result.capitalBrut)} accent={C.gold} />
            <ResultCard label="Total versé" value={euro(result.totalVerse)} accent={C.ivoryDim} />
            <ResultCard label="Intérêts bruts" value={euro(result.interetsBruts)} accent={C.success} />
            <ResultCard label="Rendement global" value={pctFmt(result.rendGlobal)} accent={C.info} sub={`Euro ${pctEuro}% / UC ${pctUC}%`} />
          </div>

          <div style={{ background: C.card, borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryDim, textTransform: 'uppercase', marginBottom: 8, fontFamily: FONT_SANS }}>Fiscalité rachat après 8 ans</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: `1px solid ${C.bd}` }}>
              <span style={{ color: C.ivoryDim }}>Gains totaux</span>
              <span style={{ color: C.ivory, fontWeight: 600 }}>{euro(result.interetsBruts)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: `1px solid ${C.bd}` }}>
              <span style={{ color: C.ivoryDim }}>Abattement (célibataire)</span>
              <span style={{ color: C.success, fontWeight: 600 }}>- {euro(4600)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: `1px solid ${C.bd}` }}>
              <span style={{ color: C.ivoryDim }}>PFU 24,7% (7,5% IR + 17,2% PS)</span>
              <span style={{ color: C.danger, fontWeight: 600 }}>- {euro(result.pfuApres8)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', fontWeight: 700 }}>
              <span style={{ color: C.ivory }}>Capital net après rachat</span>
              <span style={{ color: C.gold }}>{euro(result.netApres8)}</span>
            </div>
          </div>
        </div>
      </div>

      <SectionDivider label="Évolution du capital" />
      <div style={{ height: 300, background: C.card, borderRadius: 10, padding: 16 }}>
        <Line data={chartData} options={{ ...chartDefaults }} />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 4 — SIMULATEUR SCPI WEMO ONE
═══════════════════════════════════════════════════════════════════════════ */
const WEMO = { distribYield: 0.07, foreignPct: 0.85, fraisEntree: 0.09, fraisSortie: 0.10, delaiJouissance: 4, prixPart: 200, ps: 0.172 }

function SimulateurSCPI() {
  const [montant, setMontant] = useState(50000)
  const [structure, setStructure] = useState('IR')
  const [tmiRate, setTmiRate] = useState(30)
  const [isRate, setIsRate] = useState(25)
  const [duree, setDuree] = useState(10)
  const [revalo, setRevalo] = useState(1)
  const [aiNote, setAiNote] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const result = useMemo(() => {
    const fraisE = montant * WEMO.fraisEntree
    const netInvesti = montant - fraisE
    const nbParts = Math.floor(montant / WEMO.prixPart)

    function calcStructure(isIS) {
      const rate = isIS ? isRate / 100 : tmiRate / 100
      const revenusBrutsAn = netInvesti * WEMO.distribYield
      const frPartFrance = 1 - WEMO.foreignPct // 15%

      // PS only on French part for IR, none for IS
      const psAn = isIS ? 0 : revenusBrutsAn * frPartFrance * WEMO.ps
      // IR/IS on full distribution
      const impotAn = revenusBrutsAn * rate
      const revenusNetsAn = revenusBrutsAn - psAn - impotAn

      // Cumul sur durée (premier trimestre sans revenu = 4 mois delay)
      const anneesPleines = duree
      const totalBrut = revenusBrutsAn * (anneesPleines - WEMO.delaiJouissance / 12)
      const totalPS = psAn * (anneesPleines - WEMO.delaiJouissance / 12)
      const totalImpot = impotAn * (anneesPleines - WEMO.delaiJouissance / 12)
      const totalNet = revenusNetsAn * (anneesPleines - WEMO.delaiJouissance / 12)

      // Exit: revalorisation + frais sortie
      const capitalFinal = netInvesti * Math.pow(1 + revalo / 100, duree)
      const fraisSortie = duree < 5 ? capitalFinal * WEMO.fraisSortie : duree < 8 ? capitalFinal * 0.05 : 0
      const capitalNet = capitalFinal - fraisSortie

      // TRI simplifié
      const totalFlux = totalNet + capitalNet
      const tri = Math.pow(totalFlux / montant, 1 / duree) - 1

      return {
        montantInvesti: montant, fraisEntree: Math.round(fraisE), netInvesti: Math.round(netInvesti),
        revenusBrutsAn: Math.round(revenusBrutsAn), psAn: Math.round(psAn), impotAn: Math.round(impotAn), revenusNetsAn: Math.round(revenusNetsAn),
        totalBrut: Math.round(totalBrut), totalPS: Math.round(totalPS), totalImpot: Math.round(totalImpot), totalNet: Math.round(totalNet),
        capitalFinal: Math.round(capitalFinal), fraisSortie: Math.round(fraisSortie), capitalNet: Math.round(capitalNet),
        tri, nbParts,
      }
    }

    const ir = calcStructure(false)
    const is = calcStructure(true)

    // Yearly patrimoine evolution for chart
    const yearly = Array.from({ length: duree }, (_, i) => {
      const an = i + 1
      const capRevalorised = netInvesti * Math.pow(1 + revalo / 100, an)
      const revCumul = ir.revenusNetsAn * Math.max(0, an - WEMO.delaiJouissance / 12)
      return { an, capital: Math.round(capRevalorised), patrimoine: Math.round(capRevalorised + revCumul) }
    })

    return { ir, is, yearly }
  }, [montant, structure, tmiRate, isRate, duree, revalo])

  const chartData = {
    labels: result.yearly.map(y => `An ${y.an}`),
    datasets: [
      { label: 'Valeur des parts', data: result.yearly.map(y => y.capital), borderColor: C.gold, backgroundColor: `${C.gold}20`, fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
      { label: 'Patrimoine total (parts + revenus)', data: result.yearly.map(y => y.patrimoine), borderColor: C.success, fill: false, tension: 0.3, pointRadius: 0, borderWidth: 2 },
    ],
  }

  async function handleAINote() {
    setAiLoading(true)
    try {
      const d = structure === 'IS' ? result.is : result.ir
      const prompt = `Rédige une note de synthèse professionnelle (8-10 lignes) pour un client investissant ${euro(montant)} en SCPI Wemo One via ${structure}. Données: rendement 7%, ${duree} ans, TRI estimé ${pctFmt(d.tri)}, revenus nets annuels ${euro(d.revenusNetsAn)}. Mentionne les risques (liquidité, marché immobilier, pas de garantie de rendement).`
      const text = await callAI('Tu es un CGP senior chez Entasis Conseil. Rédige des notes professionnelles et conformes AMF (pas de promesse de rendement garanti, mention des risques).', prompt)
      setAiNote(text)
    } catch (e) { setAiNote('Erreur : ' + e.message) }
    setAiLoading(false)
  }

  function handleCopySim() {
    const d = structure === 'IS' ? result.is : result.ir
    const text = `SIMULATION SCPI WEMO ONE — ${structure}\n${euro(montant)} investis · ${duree} ans\nRevenus nets/an: ${euro(d.revenusNetsAn)}\nTRI estimé: ${pctFmt(d.tri)}\nCapital net sortie: ${euro(d.capitalNet)}\n— Entasis Conseil`
    copyText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      {/* Product card */}
      <div style={{ background: C.card, border: `1px solid ${C.bdGold}`, borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.gold, fontFamily: FONT_SERIF }}>SCPI Wemo One</div>
          <div style={{ fontSize: 12, color: C.ivoryDim, marginTop: 2 }}>SCPI diversifiée européenne — Wemo REIM</div>
        </div>
        {[
          { label: 'Distribution', value: '7%' }, { label: 'Étranger', value: '85%' },
          { label: 'Frais entrée', value: '9%' }, { label: 'Frais sortie', value: '10%' },
          { label: 'Délai jouiss.', value: '4 mois' }, { label: 'Prix/part', value: '200 €' },
        ].map(c => (
          <div key={c.label} style={{ textAlign: 'center', minWidth: 70 }}>
            <div style={{ fontSize: 10, color: C.ivoryDim, textTransform: 'uppercase', fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ivory, fontFamily: FONT_SERIF }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <Slider label="Montant investi" value={montant} onChange={setMontant} min={5000} max={500000} step={5000} suffix="€" formatValue={v => euro(v)} />
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontFamily: FONT_SANS }}>Structure de détention</div>
            <PillSelect options={[{ value: 'IR', label: 'IR (personne physique)' }, { value: 'IS', label: 'IS (société)' }, { value: 'AV', label: 'Assurance Vie' }, { value: 'SCI_IS', label: 'SCI à l\'IS' }]} value={structure} onChange={setStructure} />
          </div>
          {(structure === 'IR' || structure === 'AV') && <Slider label="TMI" value={tmiRate} onChange={setTmiRate} min={0} max={45} step={1} suffix="%" />}
          {(structure === 'IS' || structure === 'SCI_IS') && <Slider label="Taux IS" value={isRate} onChange={setIsRate} min={15} max={33} step={1} suffix="%" />}
          <Slider label="Durée de détention" value={duree} onChange={setDuree} min={3} max={20} suffix="ans" />
          <Slider label="Revalorisation annuelle" value={revalo} onChange={setRevalo} min={0} max={5} step={0.5} suffix="%" />

          {duree < 8 && (
            <div style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.warn, marginTop: 8 }}>
              ⚠ Durée {'<'} 8 ans : frais de sortie applicables ({duree < 5 ? '10%' : '5%'}). Horizon recommandé : 8 ans minimum.
            </div>
          )}
        </div>

        {/* Comparison table */}
        <div>
          <div style={{ background: C.card, borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '10px 12px', color: C.ivoryDim, fontSize: 10, textTransform: 'uppercase', fontWeight: 700, borderBottom: `1px solid ${C.bd}` }}></th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', color: C.info, fontSize: 10, textTransform: 'uppercase', fontWeight: 700, borderBottom: `1px solid ${C.bd}` }}>IR</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', color: C.warn, fontSize: 10, textTransform: 'uppercase', fontWeight: 700, borderBottom: `1px solid ${C.bd}` }}>IS</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Capital investi', euro(result.ir.montantInvesti), euro(result.is.montantInvesti)],
                  ['Frais d\'entrée', euro(result.ir.fraisEntree), euro(result.is.fraisEntree)],
                  ['Revenus bruts / an', euro(result.ir.revenusBrutsAn), euro(result.is.revenusBrutsAn)],
                  ['PS (part FR 15%)', euro(result.ir.psAn) + '/an', '—'],
                  ['IR / IS', euro(result.ir.impotAn) + '/an', euro(result.is.impotAn) + '/an'],
                  ['Revenus nets / an', euro(result.ir.revenusNetsAn), euro(result.is.revenusNetsAn)],
                  ['Revenus cumulés', euro(result.ir.totalNet), euro(result.is.totalNet)],
                  ['Frais de sortie', euro(result.ir.fraisSortie), euro(result.is.fraisSortie)],
                  ['Capital net sortie', euro(result.ir.capitalNet), euro(result.is.capitalNet)],
                ].map(([label, ir, is], i) => (
                  <tr key={i}>
                    <td style={{ padding: '7px 12px', color: C.ivoryMuted, borderBottom: `1px solid ${C.bd}` }}>{label}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', color: C.ivory, fontWeight: 600, borderBottom: `1px solid ${C.bd}` }}>{ir}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', color: C.ivory, fontWeight: 600, borderBottom: `1px solid ${C.bd}` }}>{is}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: '10px 12px', color: C.gold, fontWeight: 700 }}>TRI estimé</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: C.gold, fontWeight: 700, fontSize: 14 }}>{pctFmt(result.ir.tri)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: C.gold, fontWeight: 700, fontSize: 14 }}>{pctFmt(result.is.tri)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <SectionDivider label="Évolution du patrimoine" />
      <div style={{ height: 280, background: C.card, borderRadius: 10, padding: 16 }}>
        <Line data={chartData} options={{ ...chartDefaults }} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Btn onClick={handleCopySim} variant={copied ? 'outline' : 'gold'}>{copied ? '✓ Copié' : 'Copier la simulation'}</Btn>
        <Btn onClick={handleAINote} variant="outline" disabled={aiLoading}>{aiLoading ? 'Génération…' : 'Générer note IA'}</Btn>
      </div>

      {aiNote && (
        <div style={{ background: C.card, border: `1px solid ${C.bdGold}`, borderRadius: 10, padding: '14px 16px', marginTop: 12, fontSize: 13, lineHeight: 1.7, color: C.ivory, whiteSpace: 'pre-wrap' }}>
          {aiNote}
          <div style={{ marginTop: 10 }}><Btn onClick={() => copyText(aiNote)} variant="ghost">Copier la note</Btn></div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 5 — SIMULATEUR ACHAT IMMOBILIER NEUF
═══════════════════════════════════════════════════════════════════════════ */
const DISPOSITIFS_IMMO = [
  { value: 'LLI', label: 'LLI', desc: 'TVA 10%, loyer plafonné, engagement 20 ans' },
  { value: 'LMNP', label: 'LMNP', desc: 'Amortissement, micro-BIC ou réel' },
  { value: 'RP', label: 'Résidence principale', desc: 'Pas de dispositif fiscal' },
  { value: 'PTZ', label: 'PTZ', desc: 'Primo-accédant, prêt à taux zéro' },
]

function SimulateurImmoNeuf() {
  const [prixBien, setPrixBien] = useState(280000)
  const [surface, setSurface] = useState(55)
  const [apport, setApport] = useState(30000)
  const [dureeEmprunt, setDureeEmprunt] = useState(20)
  const [tauxInteret, setTauxInteret] = useState(3.5)
  const [tauxAssurance, setTauxAssurance] = useState(0.35)
  const [dispositif, setDispositif] = useState('LLI')
  const [showAmort, setShowAmort] = useState(false)
  const [aiEmail, setAiEmail] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const NOTAIRE_PCT = 0.025
  const HONORAIRES_PCT = 0.025

  const result = useMemo(() => {
    const fraisNotaire = Math.round(prixBien * NOTAIRE_PCT)
    const honoraires = Math.round(prixBien * HONORAIRES_PCT)
    const coutTotal = prixBien + fraisNotaire + honoraires
    const emprunt = Math.max(0, coutTotal - apport)
    const r = tauxInteret / 100 / 12
    const n = dureeEmprunt * 12
    const mensualiteCredit = r > 0 ? emprunt * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) : emprunt / n
    const assuranceMensuelle = emprunt * (tauxAssurance / 100) / 12
    const mensualiteTotale = mensualiteCredit + assuranceMensuelle
    const coutCredit = mensualiteTotale * n - emprunt

    // Rendement brut estimé
    const loyerM2 = dispositif === 'LLI' ? 12 : dispositif === 'LMNP' ? 14 : 0
    const loyerMensuel = surface * loyerM2
    const loyerAnnuel = loyerMensuel * 12
    const rendBrut = prixBien > 0 ? loyerAnnuel / prixBien : 0

    // Cashflow
    const cashflowMensuel = loyerMensuel - mensualiteTotale

    // TVA réduite LLI
    const economieTVA = dispositif === 'LLI' ? Math.round(prixBien * 0.10) : 0

    // Tableau amortissement
    const amortTable = []
    let restant = emprunt
    for (let annee = 1; annee <= dureeEmprunt; annee++) {
      let interetsAn = 0
      let capitalAn = 0
      for (let m = 0; m < 12; m++) {
        const interet = restant * r
        const capitalRemb = mensualiteCredit - interet
        interetsAn += interet
        capitalAn += capitalRemb
        restant -= capitalRemb
      }
      amortTable.push({ annee, interets: Math.round(interetsAn), capital: Math.round(capitalAn), restant: Math.max(0, Math.round(restant)) })
    }

    // Chart data: capital restant dû vs valeur estimée bien (revalo 1.5%/an)
    const yearlyRestant = amortTable.map(a => a.restant)
    const yearlyValeur = Array.from({ length: dureeEmprunt }, (_, i) => Math.round(prixBien * Math.pow(1.015, i + 1)))

    return {
      fraisNotaire, honoraires, coutTotal, emprunt, mensualiteCredit: Math.round(mensualiteCredit),
      assuranceMensuelle: Math.round(assuranceMensuelle), mensualiteTotale: Math.round(mensualiteTotale),
      coutCredit: Math.round(coutCredit), loyerMensuel, loyerAnnuel, rendBrut, cashflowMensuel: Math.round(cashflowMensuel),
      economieTVA, amortTable, yearlyRestant, yearlyValeur,
    }
  }, [prixBien, surface, apport, dureeEmprunt, tauxInteret, tauxAssurance, dispositif])

  const chartData = {
    labels: Array.from({ length: dureeEmprunt }, (_, i) => `An ${i + 1}`),
    datasets: [
      { label: 'Capital restant dû', data: result.yearlyRestant, borderColor: C.danger, backgroundColor: `${C.danger}15`, fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
      { label: 'Valeur estimée du bien', data: result.yearlyValeur, borderColor: C.success, fill: false, tension: 0.3, pointRadius: 0, borderWidth: 2 },
    ],
  }

  async function handleAIEmail() {
    setAiLoading(true)
    try {
      const prompt = `Rédige un email professionnel pour un client intéressé par un achat immobilier neuf en ${dispositif}. Bien: ${euro(prixBien)}, ${surface}m², mensualité ${euro(result.mensualiteTotale)}, apport ${euro(apport)}, rendement brut ${pctFmt(result.rendBrut)}, cashflow mensuel ${euro(result.cashflowMensuel)}. L'email doit proposer un RDV pour approfondir le projet. Signe "L'équipe Entasis Conseil".`
      const text = await callAI('Tu es CGP chez Entasis Conseil, spécialisé en immobilier neuf. Rédige des emails professionnels, informatifs et engageants. Mentionne que les projections sont indicatives.', prompt)
      setAiEmail(text)
    } catch (e) { setAiEmail('Erreur : ' + e.message) }
    setAiLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <Slider label="Prix du bien VEFA" value={prixBien} onChange={setPrixBien} min={100000} max={800000} step={5000} suffix="€" formatValue={v => euro(v)} />
          <Field label="Surface" value={surface} onChange={setSurface} suffix="m²" />
          <div style={{ height: 14 }} />
          <Slider label="Apport personnel" value={apport} onChange={setApport} min={0} max={Math.min(prixBien, 300000)} step={5000} suffix="€" formatValue={v => euro(v)} />

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontFamily: FONT_SANS }}>Durée d'emprunt</div>
            <PillSelect options={[{ value: 15, label: '15 ans' }, { value: 20, label: '20 ans' }, { value: 25, label: '25 ans' }]} value={dureeEmprunt} onChange={v => setDureeEmprunt(Number(v))} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Taux d'intérêt" value={tauxInteret} onChange={setTauxInteret} suffix="%" step="0.05" />
            <Field label="Assurance" value={tauxAssurance} onChange={setTauxAssurance} suffix="%" step="0.05" />
          </div>
          <div style={{ height: 14 }} />

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontFamily: FONT_SANS }}>Dispositif</div>
            <PillSelect options={DISPOSITIFS_IMMO} value={dispositif} onChange={setDispositif} />
          </div>
        </div>

        <div>
          <div style={{ background: C.card, borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.gold, marginBottom: 12, fontFamily: FONT_SERIF }}>Récapitulatif acquisition</div>
            {[
              ['Prix du bien', euro(prixBien)],
              ['Frais de notaire (2,5%)', euro(result.fraisNotaire)],
              ['Honoraires Entasis (2,5%)', euro(result.honoraires)],
              ['Coût total acquisition', euro(result.coutTotal)],
              ['Apport', euro(apport)],
              ['Montant emprunté', euro(result.emprunt)],
            ].map(([label, val], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${C.bd}`, fontSize: 12, fontWeight: i === 3 || i === 5 ? 700 : 400 }}>
                <span style={{ color: C.ivoryMuted }}>{label}</span>
                <span style={{ color: i === 3 || i === 5 ? C.ivory : C.ivoryMuted }}>{val}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <ResultCard label="Mensualité totale" value={euro(result.mensualiteTotale)} accent={C.gold} sub={`Crédit ${euro(result.mensualiteCredit)} + Ass. ${euro(result.assuranceMensuelle)}`} />
            <ResultCard label="Coût du crédit" value={euro(result.coutCredit)} accent={C.warn} />
            {(dispositif === 'LLI' || dispositif === 'LMNP') && (
              <>
                <ResultCard label="Rendement brut" value={pctFmt(result.rendBrut)} accent={C.success} sub={`Loyer : ${euro(result.loyerMensuel)}/mois`} />
                <ResultCard label="Cashflow mensuel" value={euro(result.cashflowMensuel)} accent={result.cashflowMensuel >= 0 ? C.success : C.danger} />
              </>
            )}
            {dispositif === 'LLI' && <ResultCard label="Économie TVA (10% vs 20%)" value={euro(result.economieTVA)} accent={C.success} />}
          </div>
        </div>
      </div>

      {/* Amortissement toggle */}
      <div style={{ marginTop: 8 }}>
        <Btn onClick={() => setShowAmort(!showAmort)} variant="outline">{showAmort ? 'Masquer' : 'Afficher'} le tableau d'amortissement</Btn>
      </div>
      {showAmort && (
        <div style={{ background: C.card, borderRadius: 10, padding: '12px 0', marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Année', 'Intérêts', 'Capital remboursé', 'Capital restant dû'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Année' ? 'left' : 'right', padding: '8px 12px', color: C.ivoryDim, fontSize: 10, textTransform: 'uppercase', fontWeight: 700, borderBottom: `1px solid ${C.bd}`, position: 'sticky', top: 0, background: C.card }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.amortTable.map(r => (
                <tr key={r.annee}>
                  <td style={{ padding: '6px 12px', color: C.ivory, borderBottom: `1px solid ${C.bd}` }}>{r.annee}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: C.warn, borderBottom: `1px solid ${C.bd}` }}>{euro(r.interets)}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: C.success, borderBottom: `1px solid ${C.bd}` }}>{euro(r.capital)}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: C.ivory, fontWeight: 600, borderBottom: `1px solid ${C.bd}` }}>{euro(r.restant)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SectionDivider label="Capital restant vs Valeur du bien" />
      <div style={{ height: 280, background: C.card, borderRadius: 10, padding: 16 }}>
        <Line data={chartData} options={{ ...chartDefaults }} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Btn onClick={handleAIEmail} variant="outline" disabled={aiLoading}>{aiLoading ? 'Génération…' : 'Générer email client (IA)'}</Btn>
      </div>

      {aiEmail && (
        <div style={{ background: C.card, border: `1px solid ${C.bdGold}`, borderRadius: 10, padding: '14px 16px', marginTop: 12, fontSize: 13, lineHeight: 1.7, color: C.ivory, whiteSpace: 'pre-wrap' }}>
          {aiEmail}
          <div style={{ marginTop: 10 }}><Btn onClick={() => copyText(aiEmail)} variant="ghost">Copier l'email</Btn></div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 6 — GÉNÉRATEUR DE LETTRE
═══════════════════════════════════════════════════════════════════════════ */
const LETTER_TYPES = [
  { value: 'mission', label: 'Lettre de mission' },
  { value: 'presentation', label: 'Présentation produit' },
  { value: 'suivi', label: 'Suivi de dossier' },
  { value: 'compte_rendu', label: 'Compte-rendu RDV' },
]

const TONES = [
  { value: 'formel', label: 'Formel' },
  { value: 'chaleureux', label: 'Chaleureux' },
  { value: 'direct', label: 'Direct' },
]

function GenerateurLettre() {
  const [letterType, setLetterType] = useState('mission')
  const [nomClient, setNomClient] = useState('')
  const [objet, setObjet] = useState('')
  const [pointsCles, setPointsCles] = useState('')
  const [ton, setTon] = useState('formel')
  const [generatedText, setGeneratedText] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleGenerate() {
    setLoading(true)
    try {
      const typeName = LETTER_TYPES.find(t => t.value === letterType)?.label
      const prompt = `Rédige une ${typeName} pour le client "${nomClient || '[Nom du client]'}".
Objet : ${objet || '[Non précisé]'}
Points clés à aborder :
${pointsCles || '[Aucun point clé spécifié]'}
Ton souhaité : ${ton}

La lettre doit être professionnelle, datée du jour, avec en-tête Entasis Conseil et signature du conseiller. Format complet prêt à envoyer.`

      const system = `Tu es un assistant rédactionnel pour Entasis Conseil, cabinet de gestion de patrimoine.
Tu rédiges des courriers et documents professionnels conformes aux standards du métier de CGP.
Utilise un français impeccable et adapte le registre au ton demandé.
En-tête : Entasis Conseil — Cabinet de Gestion de Patrimoine
Mentions légales : CIF enregistré sous le n°XXXXXX — ORIAS n°XXXXXX
Ne fais jamais de promesse de rendement garanti.`

      const text = await callAI(system, prompt)
      setGeneratedText(text)
    } catch (e) {
      setGeneratedText('Erreur : ' + e.message)
    }
    setLoading(false)
  }

  function handleCopy() {
    copyText(generatedText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownload() {
    const blob = new Blob([generatedText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${letterType}_${nomClient || 'client'}_${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      {/* Form */}
      <div>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontFamily: FONT_SANS }}>Type de lettre</div>
          <PillSelect options={LETTER_TYPES} value={letterType} onChange={setLetterType} />
        </div>

        <Field label="Nom du client" value={nomClient} onChange={setNomClient} type="text" placeholder="M. / Mme …" />
        <div style={{ height: 14 }} />
        <Field label="Objet" value={objet} onChange={setObjet} type="text" placeholder="Objet du courrier…" />
        <div style={{ height: 14 }} />
        <Field label="Points clés à aborder" value={pointsCles} onChange={setPointsCles} type="textarea" placeholder="- Point 1&#10;- Point 2&#10;- Point 3" />
        <div style={{ height: 14 }} />

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontFamily: FONT_SANS }}>Ton</div>
          <PillSelect options={TONES} value={ton} onChange={setTon} />
        </div>

        <Btn onClick={handleGenerate} disabled={loading}>{loading ? 'Génération en cours…' : 'Générer la lettre (IA)'}</Btn>
      </div>

      {/* Result */}
      <div>
        {generatedText ? (
          <>
            <textarea value={generatedText} onChange={e => setGeneratedText(e.target.value)}
              style={{
                width: '100%', minHeight: 400, padding: '16px 18px', background: C.card,
                border: `1px solid ${C.bdGold}`, borderRadius: 10, color: C.ivory, fontSize: 13,
                lineHeight: 1.7, fontFamily: FONT_SANS, resize: 'vertical', outline: 'none',
              }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Btn onClick={handleCopy} variant={copied ? 'outline' : 'gold'}>{copied ? '✓ Copié' : 'Copier'}</Btn>
              <Btn onClick={handleDownload} variant="outline">Télécharger .txt</Btn>
              <Btn onClick={handleGenerate} variant="ghost" disabled={loading}>Régénérer</Btn>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 300, background: C.card, borderRadius: 10, border: `1px dashed ${C.bdGold}` }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.3 }}>✎</div>
              <div style={{ fontSize: 13, color: C.ivoryDim }}>Remplissez le formulaire et cliquez sur</div>
              <div style={{ fontSize: 13, color: C.gold, fontWeight: 600 }}>"Générer la lettre"</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN TABS & EXPORT
═══════════════════════════════════════════════════════════════════════════ */
const TABS = [
  { id: 'defisc', label: 'Défiscalisation' },
  { id: 'per', label: 'Simulateur PER' },
  { id: 'av', label: 'Assurance Vie' },
  { id: 'scpi', label: 'SCPI Wemo One' },
  { id: 'immo', label: 'Achat Immo Neuf' },
  { id: 'lettre', label: 'Générateur Lettre' },
]

const TAB_COMPONENTS = {
  defisc: CalculateurDefiscalisation,
  per: SimulateurPER,
  av: SimulateurAssuranceVie,
  scpi: SimulateurSCPI,
  immo: SimulateurImmoNeuf,
  lettre: GenerateurLettre,
}

export default function OutilsCGP() {
  const [activeTab, setActiveTab] = useState('defisc')
  const ActiveComp = TAB_COMPONENTS[activeTab]

  return (
    <div style={{ fontFamily: FONT_SANS }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&display=swap');
        .ocgp-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 20px; }
        .ocgp-tab {
          padding: 8px 18px; border-radius: 20px; font-size: 12px; font-weight: 600;
          cursor: pointer; transition: all .15s; font-family: ${FONT_SANS};
          border: 1px solid ${C.bdGold}; background: transparent; color: ${C.ivoryMuted};
        }
        .ocgp-tab:hover { color: ${C.gold}; border-color: ${C.gold}; }
        .ocgp-tab.active { background: ${C.gold}; color: #1a1a1a; border-color: ${C.gold}; }
        .ocgp-body { background: ${C.bg}; border: 1px solid ${C.bdGold}; border-radius: 14px; padding: 24px; }
        input[type="range"] { -webkit-appearance: none; appearance: none; background: ${C.bd}; border-radius: 3px; outline: none; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: ${C.gold}; cursor: pointer; border: 2px solid ${C.bg}; }
      `}</style>

      <div className="ocgp-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`ocgp-tab${activeTab === t.id ? ' active' : ''}`}
            onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="ocgp-body">
        <ActiveComp />
      </div>
    </div>
  )
}
