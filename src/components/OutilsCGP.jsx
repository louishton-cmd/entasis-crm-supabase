import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import { Line } from 'react-chartjs-2'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

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
   PDF EXPORT ENGINE v3
═══════════════════════════════════════════════════════════════════════════ */
const P = { m: 20, pw: 210, ph: 297 }
P.cw = P.pw - P.m * 2 // 170
P.right = P.pw - P.m   // 190

const pEur = (v) => String(Math.round(Number(v) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' EUR'
const pPct = (v) => (Number(v) || 0).toFixed(2) + ' %'
const pNum = (v) => String(Math.round(Number(v) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

const navy = [27, 42, 74]
const dark = [26, 26, 26]
const labelGrey = [85, 85, 85]
const metaGrey = [102, 102, 102]
const footGrey = [136, 136, 136]
const green = [39, 174, 96]
const red = [192, 57, 43]
const white = [255, 255, 255]
const altRow = [248, 249, 250]
const disclaimerBg = [245, 245, 245]

const DISCLAIMER = 'Document etabli a titre indicatif par Entasis Conseil, CGPI independant (ORIAS 23003153). Ce document ne constitue pas un conseil en investissement personnalise au sens de la reglementation. Les simulations presentees reposent sur des hypotheses qui peuvent ne pas se realiser. Les performances passees ne prejudgent pas des performances futures. Tout investissement comporte un risque de perte en capital. Seul un conseil personnalise tenant compte de votre situation patrimoniale globale peut fonder une decision d\'investissement.'
const FOOTER_LEFT = 'Entasis Conseil - 47 bd de Courcelles, 75008 Paris - contact@entasis-conseil.fr - 01 87 66 71 24'

function sc(d, c) { d.setTextColor(c[0], c[1], c[2]) }
function sf(d, c) { d.setFillColor(c[0], c[1], c[2]) }
function sd(d, c) { d.setDrawColor(c[0], c[1], c[2]) }

function pdfHeader(doc, date) {
  sf(doc, navy); doc.rect(0, 0, P.pw, 35, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); sc(doc, white)
  doc.text('ENTASIS CONSEIL', P.m, 15)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text('Cabinet en Gestion de Patrimoine Independant', P.m, 22)
  doc.setFontSize(7); doc.text('ORIAS 23003153', P.m, 28)
  doc.setFontSize(9); doc.text(date, P.right, 15, { align: 'right' })
  doc.setFontSize(8); doc.text('Document confidentiel', P.right, 22, { align: 'right' })
}

function pdfFooter(doc, pg, total) {
  sd(doc, [204, 204, 204]); doc.setLineWidth(0.3); doc.line(P.m, 282, P.right, 282)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); sc(doc, footGrey)
  doc.text(FOOTER_LEFT, P.m, 288)
  doc.text('Page ' + pg + ' / ' + total, P.right, 288, { align: 'right' })
}

function pdfTitleBlock(doc, simType, clientName, conseiller, date) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); sc(doc, navy)
  doc.text('Simulation ' + simType, P.m, 52)
  sd(doc, navy); doc.setLineWidth(0.5); doc.line(P.m, 55, P.right, 55)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); sc(doc, metaGrey)
  doc.text('Client : ' + clientName, P.m, 62)
  doc.setFontSize(9)
  doc.text('Conseiller : ' + conseiller + '  |  Date : ' + date, P.m, 70)
  return 82
}

function pdfNewPageIfNeeded(doc, y, needed, date) {
  if (y + needed > 270) { doc.addPage(); pdfHeader(doc, date); return 45 }
  return y
}

function pdfSec(doc, y, label, date) {
  y = pdfNewPageIfNeeded(doc, y, 20, date)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); sc(doc, navy)
  doc.text(label, P.m, y)
  sf(doc, navy); doc.rect(P.m, y + 2, 3, 0.8, 'F')
  sd(doc, navy); doc.setLineWidth(0.5); doc.line(P.m, y + 2, P.right, y + 2)
  return y + 10
}

function pdfRows(doc, y, rows, date) {
  const valX = P.m + 95
  for (let i = 0; i < rows.length; i++) {
    y = pdfNewPageIfNeeded(doc, y, 9, date)
    const [label, value, style] = rows[i]
    if (i % 2 === 1) { sf(doc, altRow); doc.rect(P.m, y - 4, P.cw, 9, 'F') }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); sc(doc, labelGrey)
    doc.text(String(label), P.m + 3, y)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    if (style === 'green') sc(doc, green)
    else if (style === 'red') sc(doc, red)
    else sc(doc, dark)
    doc.text(String(value), valX, y)
    y += 9
  }
  return y + 3
}

function pdfKeyBox(doc, y, title, rows, date) {
  const rowH = 9
  const boxH = rows.length * rowH + 20
  y = pdfNewPageIfNeeded(doc, y + 4, boxH, date)
  sd(doc, navy); doc.setLineWidth(1); doc.rect(P.m, y, P.cw, boxH, 'S')
  sf(doc, navy); doc.rect(P.m, y, 4, boxH, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); sc(doc, navy)
  doc.text(title, P.m + 10, y + 10)
  let ry = y + 18
  const col1X = P.m + 10
  const col1VX = P.m + 60
  const col2X = P.m + 95
  const col2VX = P.m + 145
  for (let i = 0; i < rows.length; i++) {
    const [label, value, style] = rows[i]
    const inCol2 = i >= Math.ceil(rows.length / 2)
    const lx = inCol2 ? col2X : col1X
    const vx = inCol2 ? col2VX : col1VX
    const rowY = inCol2 ? y + 18 + (i - Math.ceil(rows.length / 2)) * rowH : ry
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); sc(doc, labelGrey)
    doc.text(String(label), lx, rowY)
    doc.setFont('helvetica', 'bold')
    if (style === 'green') sc(doc, green)
    else if (style === 'red') sc(doc, red)
    else sc(doc, dark)
    doc.text(String(value), vx, rowY)
    if (!inCol2) ry += rowH
  }
  return y + boxH + 10
}

function pdfCompTable(doc, y, headers, rows, date) {
  const needed = rows.length * 8 + 14
  y = pdfNewPageIfNeeded(doc, y, needed, date)
  const colW = P.cw / headers.length
  sf(doc, navy); doc.rect(P.m, y, P.cw, 9, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); sc(doc, white)
  headers.forEach((h, i) => {
    const x = P.m + i * colW + (i === 0 ? 3 : colW - 3)
    doc.text(h, x, y + 6, { align: i === 0 ? 'left' : 'right' })
  })
  y += 12
  doc.setFontSize(8.5)
  for (let ri = 0; ri < rows.length; ri++) {
    y = pdfNewPageIfNeeded(doc, y, 8, date)
    const row = rows[ri]
    if (ri % 2 === 0 && !row._bold) { sf(doc, altRow); doc.rect(P.m, y - 4, P.cw, 8, 'F') }
    if (row._bold) { sf(doc, [230, 235, 245]); doc.rect(P.m, y - 4, P.cw, 8, 'F') }
    row.cells.forEach((cell, i) => {
      const x = P.m + i * colW + (i === 0 ? 3 : colW - 3)
      doc.setFont('helvetica', row._bold ? 'bold' : 'normal')
      sc(doc, row._bold ? navy : dark)
      doc.text(String(cell), x, y, { align: i === 0 ? 'left' : 'right' })
    })
    y += 8
  }
  sd(doc, [204, 204, 204]); doc.setLineWidth(0.3); doc.line(P.m, y - 4, P.right, y - 4)
  return y + 3
}

async function captureChartImage(chartRef) {
  if (!chartRef?.current) return null
  const canvas = await html2canvas(chartRef.current, { backgroundColor: '#FFFFFF', scale: 2 })
  return canvas.toDataURL('image/png')
}

function pdfChartAndDisclaimer(doc, img, y, date) {
  const chartH = 85
  if (img) {
    y = pdfNewPageIfNeeded(doc, y, chartH + 40, date)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); sc(doc, navy)
    doc.text('Evolution du patrimoine', P.pw / 2, y, { align: 'center' })
    y += 8
    doc.addImage(img, 'PNG', P.m, y, P.cw, chartH)
    y += chartH + 8
  }
  // Disclaimer
  y = pdfNewPageIfNeeded(doc, y, 35, date)
  const lines = doc.splitTextToSize(DISCLAIMER, P.cw - 16)
  const boxH = lines.length * 3.8 + 14
  sf(doc, disclaimerBg); sd(doc, [204, 204, 204]); doc.setLineWidth(0.5)
  doc.rect(P.m, y, P.cw, boxH, 'FD')
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); sc(doc, labelGrey)
  doc.text(lines, P.m + 8, y + 8)
  return y + boxH + 6
}

function pdfFinalize(doc, type, client) {
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) { doc.setPage(i); pdfFooter(doc, i, total) }
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const clean = (client || 'Client').replace(/[^a-zA-Z0-9\u00C0-\u024F ]/g, '').replace(/\s+/g, '_')
  doc.save('Entasis_Simulation_' + type + '_' + clean + '_' + dd + mm + d.getFullYear() + '.pdf')
}

/* ── PDF Client Modal & Button ────────────────────────────────────────── */
function PDFClientModal({ open, onClose, onConfirm }) {
  const [name, setName] = useState('')
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: C.card, border: `1px solid ${C.bdGold}`, borderRadius: 14, padding: 24, width: 380 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.gold, fontFamily: FONT_SERIF, marginBottom: 4 }}>Exporter en PDF</div>
        <div style={{ fontSize: 12, color: C.ivoryDim, marginBottom: 16 }}>Le nom du client apparaitra sur le document.</div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6, fontFamily: FONT_SANS }}>Nom du client</div>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="M. / Mme ..."
            autoFocus onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onConfirm(name.trim()) }}
            style={{ width: '100%', padding: '10px 14px', background: C.inputBg, border: `1px solid ${C.bdGold}`, borderRadius: 8, color: C.ivory, fontSize: 14, fontFamily: FONT_SANS, outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn onClick={onClose} variant="ghost">Annuler</Btn>
          <Btn onClick={() => { if (name.trim()) onConfirm(name.trim()) }} disabled={!name.trim()}>Generer le PDF</Btn>
        </div>
      </div>
    </div>
  )
}

function ExportPDFButton({ onExport }) {
  const [modalOpen, setModalOpen] = useState(false)
  return (
    <>
      <button onClick={() => setModalOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: FONT_SANS, cursor: 'pointer', transition: 'all .15s', background: 'transparent', color: C.ivory, border: `1px solid ${C.bd}` }}>
        Exporter en PDF
      </button>
      <PDFClientModal open={modalOpen} onClose={() => setModalOpen(false)}
        onConfirm={clientName => { setModalOpen(false); onExport(clientName) }} />
    </>
  )
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

      <div style={{ display: 'flex', gap: 8 }}>
        <Btn onClick={handleCopy} variant={copied ? 'outline' : 'gold'}>{copied ? '✓ Copié' : 'Copier le résumé'}</Btn>
        <ExportPDFButton onExport={clientName => {
          const dt = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
          const doc = new jsPDF(); pdfHeader(doc, dt)
          let y = pdfTitleBlock(doc, 'Defiscalisation', clientName, 'Entasis Conseil', dt)
          y = pdfSec(doc, y, 'Parametres de simulation', dt)
          y = pdfRows(doc, y, [
            ['Revenu net imposable', pEur(revenu)],
            ['Situation familiale', (SITUATIONS.find(s => s.value === situation)?.label || '') + ' (' + parts + ' parts)'],
            ['Dispositif', disp?.label || ''],
            ['Montant investi', pEur(montantInvesti)],
          ], dt)
          y += 10
          y = pdfSec(doc, y, 'Resultats', dt)
          y = pdfRows(doc, y, [
            ['TMI', Math.round(result.tmi * 100) + ' %'],
            ['Impot avant dispositif', pEur(result.irAvant)],
            ['Impot apres dispositif', pEur(result.irApres)],
            ['Economie fiscale', pEur(result.economie), 'green'],
            ['Effort reel', pEur(result.effortReel)],
          ], dt)
          y += 10
          y = pdfKeyBox(doc, y, 'Points cles de la simulation', [
            ['Economie fiscale', pEur(result.economie), 'green'],
            ['TMI', Math.round(result.tmi * 100) + ' %'],
            ['Effort reel', pEur(result.effortReel)],
            ['Impot apres', pEur(result.irApres)],
          ], dt)
          pdfChartAndDisclaimer(doc, null, y, dt)
          pdfFinalize(doc, 'Defiscalisation', clientName)
        }} />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 2 — SIMULATEUR PER
═══════════════════════════════════════════════════════════════════════════ */
function SimulateurPER() {
  const chartRef = useRef(null)
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
      <div ref={chartRef} style={{ height: 300, background: '#fff', borderRadius: 10, padding: 16 }}>
        <Line data={chartData} options={{ ...chartDefaults }} />
      </div>
      <div style={{ marginTop: 16 }}>
        <ExportPDFButton onExport={async clientName => {
          const dt = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
          const doc = new jsPDF(); pdfHeader(doc, dt)
          let y = pdfTitleBlock(doc, 'PER (Plan Epargne Retraite)', clientName, 'Entasis Conseil', dt)
          y = pdfSec(doc, y, 'Parametres de simulation', dt)
          y = pdfRows(doc, y, [
            ['Age actuel', age + ' ans'], ['Age de retraite', ageRetraite + ' ans'],
            ['Duree de capitalisation', duree + ' ans'],
            ['Versement mensuel', pEur(versementMensuel)], ['Versement initial', pEur(versementInitial)],
            ['TMI actuel', tmi + ' %'],
          ], dt)
          y += 10
          y = pdfSec(doc, y, 'Projections du capital', dt)
          y = pdfRows(doc, y, [
            ['Capital Prudent (3%)', pEur(result.curves[0].final)],
            ['Capital Equilibre (5%)', pEur(result.curves[1].final)],
            ['Capital Dynamique (7%)', pEur(result.curves[2].final)],
          ], dt)
          y += 10
          y = pdfSec(doc, y, 'Avantage fiscal et rente', dt)
          y = pdfRows(doc, y, [
            ['Economie fiscale / an', pEur(result.economieFiscaleAnnuelle), 'green'],
            ['Economie fiscale totale', pEur(result.economieFiscaleTotale), 'green'],
            ['Total verse sur la periode', pEur(result.totalVerse)],
            ['Effort net annuel (apres avantage fiscal)', pEur(result.effortNet)],
            ['Rente mensuelle estimee (equilibre)', pEur(result.renteMensuelle[1])],
          ], dt)
          y += 10
          y = pdfKeyBox(doc, y, 'Points cles de la simulation', [
            ['Capital equilibre', pEur(result.curves[1].final)],
            ['Eco. fiscale totale', pEur(result.economieFiscaleTotale), 'green'],
            ['Rente mensuelle', pEur(result.renteMensuelle[1])],
            ['Effort net / an', pEur(result.effortNet)],
          ], dt)
          const img = await captureChartImage(chartRef)
          pdfChartAndDisclaimer(doc, img, y, dt)
          pdfFinalize(doc, 'PER', clientName)
        }} />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 3 — SIMULATEUR ASSURANCE VIE
═══════════════════════════════════════════════════════════════════════════ */
function SimulateurAssuranceVie() {
  const chartRef = useRef(null)
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
      <div ref={chartRef} style={{ height: 300, background: '#fff', borderRadius: 10, padding: 16 }}>
        <Line data={chartData} options={{ ...chartDefaults }} />
      </div>
      <div style={{ marginTop: 16 }}>
        <ExportPDFButton onExport={async clientName => {
          const dt = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
          const doc = new jsPDF(); pdfHeader(doc, dt)
          let y = pdfTitleBlock(doc, 'Assurance Vie', clientName, 'Entasis Conseil', dt)
          y = pdfSec(doc, y, 'Parametres de simulation', dt)
          y = pdfRows(doc, y, [
            ['Capital initial', pEur(capitalInitial)], ['Versements mensuels', pEur(versementMensuel)],
            ['Duree', duree + ' ans'], ['Repartition', 'Fonds Euro ' + pctEuro + '% / UC ' + (100 - pctEuro) + '%'],
            ['Rendement fonds Euro', rendEuro + ' %'], ['Rendement UC', rendUC + ' %'],
          ], dt)
          y += 10
          y = pdfSec(doc, y, 'Resultats', dt)
          y = pdfRows(doc, y, [
            ['Capital final brut', pEur(result.capitalBrut)],
            ['Total verse', pEur(result.totalVerse)],
            ['Interets bruts', pEur(result.interetsBruts), 'green'],
            ['Rendement global pondere', pPct(result.rendGlobal)],
          ], dt)
          y += 10
          y = pdfSec(doc, y, 'Fiscalite rachat apres 8 ans', dt)
          y = pdfRows(doc, y, [
            ['Gains totaux', pEur(result.interetsBruts)],
            ['Abattement (celibataire)', '4 600 EUR'],
            ['PFU 24,7% (7,5% IR + 17,2% PS)', pEur(result.pfuApres8), 'red'],
            ['Capital net apres rachat', pEur(result.netApres8)],
          ], dt)
          y += 10
          y = pdfKeyBox(doc, y, 'Points cles de la simulation', [
            ['Capital final brut', pEur(result.capitalBrut)],
            ['Interets bruts', pEur(result.interetsBruts), 'green'],
            ['Capital net (8 ans)', pEur(result.netApres8)],
            ['PFU estime', pEur(result.pfuApres8), 'red'],
          ], dt)
          const img = await captureChartImage(chartRef)
          pdfChartAndDisclaimer(doc, img, y, dt)
          pdfFinalize(doc, 'AssuranceVie', clientName)
        }} />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 4 — SIMULATEUR SCPI WEMO ONE (données officielles wemo-reim.fr, mars 2026)
═══════════════════════════════════════════════════════════════════════════ */
const WEMO = {
  prixPart: 200,
  valeurReconstitution: 218.73,        // au 31/12/2025
  td2025: 0.1527,                      // taux distribution réel 2025 (exceptionnel)
  tdCible: 0.07,                       // objectif long terme, non garanti, net de frais de gestion, brut de fiscalité
  triCible: 0.075,
  perfGlobaleCible: 0.08,
  foreignPct: 0.8552,                  // Europe hors France
  francePct: 0.145,
  geoItalie: 0.504, geoEspagne: 0.351, geoFrance: 0.145,
  capitalisation: 100_000_000,
  nbAssocies: 3600,
  nbBiens: 31,
  ticketMin: 1000,                     // 5 parts
  dureeRecommandee: 8,
  fraisSouscription: 0.10,             // 10% HT sur capital investi à l'entrée
  commissionGestion: 0.11,             // 11% HT — déjà incluse dans le TD (net de frais)
  // Pas de commission de sortie — SCPI à capital variable, retrait par confrontation au marché
  delaiJouissance: 7,                  // mois
  ps: 0.172,
  // Classes d'actifs
  actifCommerce: 0.739, actifLogistique: 0.151, actifEducation: 0.073, actifBureaux: 0.038,
}

function SimulateurSCPI() {
  const chartRef = useRef(null)
  const [montant, setMontant] = useState(50000)
  const [structure, setStructure] = useState('IR')
  const [tmiRate, setTmiRate] = useState(30)
  const [isRate, setIsRate] = useState(25)
  const [duree, setDuree] = useState(10)
  const [revalo, setRevalo] = useState(1)
  const [rendement, setRendement] = useState(7)
  const [aiNote, setAiNote] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const nbParts = Math.floor(montant / WEMO.prixPart)
  const montantEffectif = nbParts * WEMO.prixPart
  const rendementDecimal = rendement / 100

  const result = useMemo(() => {
    // Frais de souscription 10% HT payés EN SUS du capital investi
    // Capital en parts = montantEffectif (travaille et génère des revenus)
    // Frais = montantEffectif × 10% (coût additionnel)
    // Décaissement total = montantEffectif + frais
    const capitalEnParts = montantEffectif
    const fraisE = Math.round(montantEffectif * WEMO.fraisSouscription)
    const decaissementTotal = montantEffectif + fraisE

    function calcStructure(isIS) {
      const rate = isIS ? isRate / 100 : tmiRate / 100
      // TD is already net de frais de gestion, brut de fiscalité
      // Revenue base = full capital in parts (not reduced by fees)
      const revenusBrutsAn = capitalEnParts * rendementDecimal

      // PS 17.2% applies ONLY on the 14.5% French assets portion
      const psAn = isIS ? 0 : revenusBrutsAn * WEMO.francePct * WEMO.ps
      // IR/IS on full distribution
      const impotAn = revenusBrutsAn * rate
      const revenusNetsAn = revenusBrutsAn - psAn - impotAn

      // Effective years of distribution (minus jouissance delay)
      const effectiveYears = Math.max(0, duree - WEMO.delaiJouissance / 12)
      const totalBrut = Math.round(revenusBrutsAn * effectiveYears)
      const totalPS = Math.round(psAn * effectiveYears)
      const totalImpot = Math.round(impotAn * effectiveYears)
      const totalNet = Math.round(revenusNetsAn * effectiveYears)

      // Exit: nb parts × prix part at exit (revalorised) — NO exit fees
      const prixPartSortie = WEMO.prixPart * Math.pow(1 + revalo / 100, duree)
      const capitalSortie = nbParts * prixPartSortie

      // TRI: Newton's method — initial outlay = decaissementTotal (capital + fees on top)
      let tri = 0.05
      for (let iter = 0; iter < 50; iter++) {
        let npv = -decaissementTotal
        let dnpv = 0
        for (let t = 1; t <= duree; t++) {
          const cashflow = t <= Math.ceil(WEMO.delaiJouissance / 12) ? 0 : revenusNetsAn
          const disc = Math.pow(1 + tri, t)
          npv += cashflow / disc
          dnpv -= t * cashflow / (disc * (1 + tri))
        }
        const disc = Math.pow(1 + tri, duree)
        npv += capitalSortie / disc
        dnpv -= duree * capitalSortie / (disc * (1 + tri))
        if (Math.abs(dnpv) < 1e-12) break
        const step = npv / dnpv
        tri = tri - step
        if (Math.abs(step) < 1e-8) break
      }

      return {
        capitalEnParts, fraisEntree: fraisE, decaissementTotal,
        revenusBrutsAn: Math.round(revenusBrutsAn), psAn: Math.round(psAn), impotAn: Math.round(impotAn), revenusNetsAn: Math.round(revenusNetsAn),
        totalBrut, totalPS, totalImpot, totalNet,
        capitalSortie: Math.round(capitalSortie),
        tri: isFinite(tri) ? tri : 0, nbParts,
      }
    }

    const ir = calcStructure(false)
    const is = calcStructure(true)

    // Yearly evolution for chart (value of parts + cumulated net revenue)
    const yearly = Array.from({ length: duree }, (_, i) => {
      const an = i + 1
      const prixPartAn = WEMO.prixPart * Math.pow(1 + revalo / 100, an)
      const valeurParts = nbParts * prixPartAn
      const revCumulIR = ir.revenusNetsAn * Math.max(0, an - WEMO.delaiJouissance / 12)
      const revCumulIS = is.revenusNetsAn * Math.max(0, an - WEMO.delaiJouissance / 12)
      return { an, valeurParts: Math.round(valeurParts), patrimoineIR: Math.round(valeurParts + revCumulIR), patrimoineIS: Math.round(valeurParts + revCumulIS) }
    })

    return { ir, is, yearly }
  }, [montantEffectif, nbParts, tmiRate, isRate, duree, revalo, rendementDecimal])

  const chartData = {
    labels: result.yearly.map(y => `An ${y.an}`),
    datasets: [
      { label: 'Valeur des parts', data: result.yearly.map(y => y.valeurParts), borderColor: C.gold, backgroundColor: `${C.gold}15`, fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
      { label: 'Patrimoine IR (parts + revenus nets)', data: result.yearly.map(y => y.patrimoineIR), borderColor: C.info, fill: false, tension: 0.3, pointRadius: 0, borderWidth: 2 },
      { label: 'Patrimoine IS (parts + revenus nets)', data: result.yearly.map(y => y.patrimoineIS), borderColor: C.warn, fill: false, tension: 0.3, pointRadius: 0, borderWidth: 2, borderDash: [5, 3] },
    ],
  }

  async function handleAINote() {
    setAiLoading(true)
    try {
      const d = structure === 'IS' || structure === 'SCI_IS' ? result.is : result.ir
      const prompt = `Rédige une note de synthèse professionnelle (10-12 lignes) pour un client investissant ${euro(montantEffectif)} (${nbParts} parts) en SCPI Wemo One via ${structure}.

Données officielles Wemo One (source wemo-reim.fr) :
- TD 2025 réel : 15,27% (exceptionnel, phase de lancement)
- TD cible long terme : 7% net de frais de gestion (11% HT), brut de fiscalité
- TRI cible : 7,5% — Performance globale cible : 8%
- Frais de souscription : 10% HT
- Pas de commission de sortie (SCPI à capital variable, retrait par confrontation au marché)
- 85,52% patrimoine européen hors France (Italie 50,4%, Espagne 35,1%)
- Classes d'actifs : Commerce 73,9%, Logistique 15,1%
- Capitalisation : 100M€, 3600 associés, 31 biens

Résultats simulation sur ${duree} ans (hypothèse rendement ${rendement}%) :
- TRI estimé : ${pctFmt(d.tri)}
- Revenus nets annuels : ${euro(d.revenusNetsAn)}
- Capital à la sortie : ${euro(d.capitalSortie)}

IMPORTANT : Mentionne clairement que le TD 2025 de 15,27% est exceptionnel et ne reflète pas la performance future. Le taux cible long terme est de 7%. Mentionne les risques (liquidité limitée, capital non garanti, marché immobilier européen). Rappelle que les performances passées ne préjugent pas des performances futures.`
      const text = await callAI('Tu es un CGP senior chez Entasis Conseil. Rédige des notes conformes AMF : pas de promesse de rendement garanti, mention systématique des risques, distinction claire entre performance passée et objectif futur.', prompt)
      setAiNote(text)
    } catch (e) { setAiNote('Erreur : ' + e.message) }
    setAiLoading(false)
  }

  function handleCopySim() {
    const ir = result.ir
    const is = result.is
    const text = `SIMULATION SCPI WEMO ONE — Entasis Conseil
══════════════════════════════════════════
Capital en parts : ${euro(montantEffectif)} (${nbParts} parts × ${WEMO.prixPart} €)
Frais souscription (10% HT, en sus) : ${euro(result.ir.fraisEntree)}
Décaissement total : ${euro(result.ir.decaissementTotal)}
Durée : ${duree} ans · Revalorisation : ${revalo}%/an
Hypothèse rendement : ${rendement}% (cible officielle : 7%)
Pas de frais de sortie (SCPI à capital variable)

COMPARAISON IR vs IS
──────────────────
                          IR              IS
Revenus bruts / an :      ${euro(ir.revenusBrutsAn).padStart(10)}    ${euro(is.revenusBrutsAn).padStart(10)}
PS (14,5% FR) / an :      ${euro(ir.psAn).padStart(10)}    —
Impôt / an :              ${euro(ir.impotAn).padStart(10)}    ${euro(is.impotAn).padStart(10)}
Revenus nets / an :       ${euro(ir.revenusNetsAn).padStart(10)}    ${euro(is.revenusNetsAn).padStart(10)}
Revenus cumulés :         ${euro(ir.totalNet).padStart(10)}    ${euro(is.totalNet).padStart(10)}
Capital sortie :          ${euro(ir.capitalSortie).padStart(10)}    ${euro(is.capitalSortie).padStart(10)}
TRI estimé :              ${pctFmt(ir.tri).padStart(10)}    ${pctFmt(is.tri).padStart(10)}

⚠ Les performances passées ne préjugent pas des performances futures.
Simulation indicative — Entasis Conseil`
    copyText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const thStyle = { textAlign: 'right', padding: '10px 12px', fontSize: 10, textTransform: 'uppercase', fontWeight: 700, borderBottom: `1px solid ${C.bd}` }
  const tdLabel = { padding: '7px 12px', color: C.ivoryMuted, borderBottom: `1px solid ${C.bd}`, fontSize: 12 }
  const tdVal = { padding: '7px 12px', textAlign: 'right', color: C.ivory, fontWeight: 600, borderBottom: `1px solid ${C.bd}`, fontSize: 12 }

  return (
    <div>
      {/* ── PRODUCT CARD ──────────────────────────────────────────── */}
      <div style={{ background: C.card, border: `1px solid ${C.bdGold}`, borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.gold, fontFamily: FONT_SERIF }}>SCPI Wemo One</div>
            <div style={{ fontSize: 12, color: C.ivoryDim, marginTop: 2 }}>SCPI diversifiée européenne — Wemo REIM · Capitalisation {(WEMO.capitalisation / 1e6).toFixed(0)}M€</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: C.goldBg, color: C.gold, border: `1px solid ${C.goldLine}` }}>{WEMO.nbAssocies.toLocaleString('fr-FR')} associés</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: C.goldBg, color: C.gold, border: `1px solid ${C.goldLine}` }}>{WEMO.nbBiens} biens</span>
          </div>
        </div>

        {/* Key figures row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Prix / part', value: `${WEMO.prixPart} €` },
            { label: 'Val. reconst.', value: `${WEMO.valeurReconstitution.toFixed(2)} €` },
            { label: 'TD 2025', value: '15,27%', accent: C.success },
            { label: 'TD cible LT', value: '7%', accent: C.gold },
            { label: 'TRI cible', value: '7,5%' },
            { label: 'Souscription', value: '10% HT' },
            { label: 'Gestion', value: '11% HT' },
            { label: 'Délai jouiss.', value: '7 mois' },
          ].map(c => (
            <div key={c.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9.5, color: C.ivoryDim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4, letterSpacing: '.03em' }}>{c.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: c.accent || C.ivory, fontFamily: FONT_SERIF }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Geographic & asset class breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.ivoryDim, textTransform: 'uppercase', marginBottom: 8, letterSpacing: '.06em' }}>Répartition géographique</div>
            {[
              { label: 'Italie', pct: WEMO.geoItalie, color: '#4ade80' },
              { label: 'Espagne', pct: WEMO.geoEspagne, color: '#fb923c' },
              { label: 'France', pct: WEMO.geoFrance, color: '#60a5fa' },
            ].map(g => (
              <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: C.ivory, flex: 1 }}>{g.label}</span>
                <div style={{ width: 100, height: 5, background: C.bd, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${g.pct * 100}%`, height: '100%', background: g.color, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 11, color: C.ivoryMuted, fontWeight: 600, minWidth: 40, textAlign: 'right' }}>{(g.pct * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.ivoryDim, textTransform: 'uppercase', marginBottom: 8, letterSpacing: '.06em' }}>Classes d'actifs</div>
            {[
              { label: 'Commerce', pct: WEMO.actifCommerce, color: C.gold },
              { label: 'Logistique', pct: WEMO.actifLogistique, color: '#a78bfa' },
              { label: 'Éducation', pct: WEMO.actifEducation, color: '#22d3ee' },
              { label: 'Bureaux', pct: WEMO.actifBureaux, color: '#f472b6' },
            ].map(a => (
              <div key={a.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: C.ivory, flex: 1 }}>{a.label}</span>
                <div style={{ width: 100, height: 5, background: C.bd, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${a.pct * 100}%`, height: '100%', background: a.color, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 11, color: C.ivoryMuted, fontWeight: 600, minWidth: 40, textAlign: 'right' }}>{(a.pct * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Ticket minimum */}
        <div style={{ marginTop: 12, fontSize: 11, color: C.ivoryDim }}>
          Ticket minimum : {euro(WEMO.ticketMin)} ({WEMO.ticketMin / WEMO.prixPart} parts) · Durée recommandée : {WEMO.dureeRecommandee} ans
        </div>
      </div>

      {/* ── DISCLAIMER ────────────────────────────────────────────── */}
      <div style={{ background: 'rgba(201,168,76,0.06)', border: `1px solid ${C.goldLine}`, borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 11.5, lineHeight: 1.7, color: C.ivoryMuted }}>
        <strong style={{ color: C.gold }}>⚠ Avertissement</strong> — Le taux de distribution 2025 de 15,27% ne reflète pas la performance future. Ce taux exceptionnel s'explique par la phase de lancement de la SCPI et des conditions d'acquisition particulièrement favorables. Le taux cible long terme est de <strong style={{ color: C.ivory }}>7% net de frais de gestion, brut de fiscalité</strong> (non garanti). Les performances passées ne préjugent pas des performances futures. L'investissement en SCPI comporte un risque de perte en capital. Frais de souscription : 10% HT. Commission de gestion : 11% HT (déjà déduite du taux de distribution). Pas de commission de sortie (SCPI à capital variable).
      </div>

      {/* ── SIMULATION INPUTS + RESULTS ───────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <Slider label="Montant investi" value={montant} onChange={setMontant} min={1000} max={500000} step={1000} suffix="€" formatValue={v => `${euro(v)} (${Math.floor(v / WEMO.prixPart)} parts)`} />

          {montantEffectif !== montant && (
            <div style={{ fontSize: 11, color: C.ivoryDim, marginTop: -12, marginBottom: 12 }}>
              Arrondi à {nbParts} parts = {euro(montantEffectif)}
            </div>
          )}

          <Slider label="Hypothèse de rendement long terme" value={rendement} onChange={setRendement} min={4} max={12} step={0.25} suffix="%" />
          <div style={{ fontSize: 10.5, color: C.ivoryDim, marginTop: -12, marginBottom: 16, lineHeight: 1.5 }}>
            Cible officielle Wemo One : <strong style={{ color: C.gold }}>7% net de frais, brut de fiscalité</strong>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontFamily: FONT_SANS }}>Structure de détention</div>
            <PillSelect options={[{ value: 'IR', label: 'IR (personne physique)' }, { value: 'IS', label: 'IS (société)' }, { value: 'AV', label: 'Assurance Vie' }, { value: 'SCI_IS', label: 'SCI à l\'IS' }]} value={structure} onChange={setStructure} />
          </div>

          {(structure === 'IR' || structure === 'AV') && <Slider label="Votre TMI" value={tmiRate} onChange={setTmiRate} min={0} max={45} step={1} suffix="%" />}
          {(structure === 'IS' || structure === 'SCI_IS') && <Slider label="Taux IS applicable" value={isRate} onChange={setIsRate} min={15} max={33} step={1} suffix="%" />}
          <Slider label="Durée de détention" value={duree} onChange={setDuree} min={3} max={20} suffix="ans" />
          <Slider label="Hypothèse revalorisation annuelle" value={revalo} onChange={setRevalo} min={0} max={5} step={0.5} suffix="%" />

          {duree < 8 && (
            <div style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.warn, marginTop: 8 }}>
              ⚠ Durée inférieure à la durée recommandée de {WEMO.dureeRecommandee} ans. La liquidité des parts n'est pas garantie et le marché secondaire peut impliquer une décote.
            </div>
          )}

          {/* Fiscalité & frais explainer */}
          <div style={{ background: C.card, borderRadius: 8, padding: '12px 14px', marginTop: 16, fontSize: 11.5, lineHeight: 1.6, color: C.ivoryDim }}>
            <strong style={{ color: C.ivory }}>Frais & Fiscalité</strong><br />
            • Frais de souscription : <strong style={{ color: C.ivory }}>10% HT en sus</strong> du capital investi ({euro(result.ir.capitalEnParts)} + {euro(result.ir.fraisEntree)} = {euro(result.ir.decaissementTotal)})<br />
            • Commission de gestion : <strong style={{ color: C.ivory }}>11% HT</strong> — déjà incluse dans le taux de distribution (net de frais)<br />
            • <strong style={{ color: C.success }}>Pas de commission de sortie</strong> — SCPI à capital variable, retrait par confrontation au marché<br />
            • PS 17,2% uniquement sur la part française ({(WEMO.francePct * 100).toFixed(1)}%) soit {euro(Math.round(result.ir.revenusBrutsAn * WEMO.francePct))} d'assiette<br />
            • Les revenus européens ({(WEMO.foreignPct * 100).toFixed(1)}%) sont <strong style={{ color: C.success }}>exonérés de prélèvements sociaux</strong>
          </div>
        </div>

        {/* ── COMPARISON TABLE IR vs IS ────────────────────────────── */}
        <div>
          <div style={{ background: C.card, borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left', color: C.ivoryDim }}></th>
                  <th style={{ ...thStyle, color: C.info }}>IR</th>
                  <th style={{ ...thStyle, color: C.warn }}>IS</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Capital générateur de revenus', euro(result.ir.capitalEnParts), euro(result.is.capitalEnParts)],
                  ['Frais souscription (10% HT, en sus)', euro(result.ir.fraisEntree), euro(result.is.fraisEntree)],
                  ['Décaissement total', euro(result.ir.decaissementTotal), euro(result.is.decaissementTotal)],
                  [`Revenus bruts / an (${rendement}%)`, euro(result.ir.revenusBrutsAn), euro(result.is.revenusBrutsAn)],
                  [`PS 17,2% (part FR ${(WEMO.francePct * 100).toFixed(1)}%)`, euro(result.ir.psAn) + '/an', '—'],
                  [`${structure === 'IS' || structure === 'SCI_IS' ? 'IS' : 'IR'} / an`, euro(result.ir.impotAn) + '/an', euro(result.is.impotAn) + '/an'],
                  ['Revenus nets / an', euro(result.ir.revenusNetsAn), euro(result.is.revenusNetsAn)],
                  [`Revenus nets cumulés (${duree} ans)`, euro(result.ir.totalNet), euro(result.is.totalNet)],
                  ['Capital à la sortie', euro(result.ir.capitalSortie), euro(result.is.capitalSortie)],
                ].map(([label, irVal, isVal], i) => (
                  <tr key={i}>
                    <td style={tdLabel}>{label}</td>
                    <td style={tdVal}>{irVal}</td>
                    <td style={tdVal}>{isVal}</td>
                  </tr>
                ))}
                <tr style={{ background: 'rgba(201,168,76,0.05)' }}>
                  <td style={{ padding: '10px 12px', color: C.gold, fontWeight: 700, fontSize: 13 }}>TRI estimé</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: C.gold, fontWeight: 700, fontSize: 16, fontFamily: FONT_SERIF }}>{pctFmt(result.ir.tri)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: C.gold, fontWeight: 700, fontSize: 16, fontFamily: FONT_SERIF }}>{pctFmt(result.is.tri)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 10, color: C.ivoryDim, marginTop: 8, lineHeight: 1.5 }}>
            Simulation basée sur une hypothèse de rendement de {rendement}% (cible officielle : 7%, non garanti). TRI calculé par actualisation des flux nets. Pas de frais de sortie (SCPI à capital variable).
          </div>
        </div>
      </div>

      {/* ── CHART ─────────────────────────────────────────────────── */}
      <SectionDivider label="Évolution du patrimoine" />
      <div ref={chartRef} style={{ height: 300, background: '#fff', borderRadius: 10, padding: 16 }}>
        <Line data={chartData} options={{ ...chartDefaults }} />
      </div>

      {/* ── ACTIONS ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Btn onClick={handleCopySim} variant={copied ? 'outline' : 'gold'}>{copied ? '✓ Copié' : 'Copier la simulation'}</Btn>
        <Btn onClick={handleAINote} variant="outline" disabled={aiLoading}>{aiLoading ? 'Génération…' : 'Générer note IA'}</Btn>
        <ExportPDFButton onExport={async clientName => {
          const dt = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
          const doc = new jsPDF(); pdfHeader(doc, dt)
          let y = pdfTitleBlock(doc, 'SCPI Wemo One', clientName, 'Entasis Conseil', dt)
          y = pdfSec(doc, y, 'Parametres de simulation', dt)
          y = pdfRows(doc, y, [
            ['Capital en parts', pEur(montantEffectif)], ['Nombre de parts', pNum(nbParts)],
            ['Frais souscription (10% HT, en sus)', pEur(result.ir.fraisEntree)],
            ['Decaissement total', pEur(result.ir.decaissementTotal)],
            ['Structure de detention', structure], ['Hypothese rendement', rendement + ' %'],
            ['Duree de detention', duree + ' ans'], ['Revalorisation annuelle', revalo + ' %/an'],
          ], dt)
          y += 10
          y = pdfSec(doc, y, 'Comparaison IR vs IS', dt)
          y = pdfCompTable(doc, y, ['', 'IR', 'IS'], [
            { cells: ['Capital generateur de revenus', pEur(result.ir.capitalEnParts), pEur(result.is.capitalEnParts)] },
            { cells: ['Frais souscription (en sus)', pEur(result.ir.fraisEntree), pEur(result.is.fraisEntree)] },
            { cells: ['Decaissement total', pEur(result.ir.decaissementTotal), pEur(result.is.decaissementTotal)] },
            { cells: ['Revenus bruts / an (' + rendement + '%)', pEur(result.ir.revenusBrutsAn), pEur(result.is.revenusBrutsAn)] },
            { cells: ['PS 17,2% (part FR 14,5%)', pEur(result.ir.psAn) + '/an', '-'] },
            { cells: ['Impot / an', pEur(result.ir.impotAn) + '/an', pEur(result.is.impotAn) + '/an'] },
            { cells: ['Revenus nets / an', pEur(result.ir.revenusNetsAn), pEur(result.is.revenusNetsAn)] },
            { cells: ['Revenus cumules (' + duree + ' ans)', pEur(result.ir.totalNet), pEur(result.is.totalNet)] },
            { cells: ['Capital a la sortie', pEur(result.ir.capitalSortie), pEur(result.is.capitalSortie)] },
            { cells: ['TRI estime', pPct(result.ir.tri), pPct(result.is.tri)], _bold: true },
          ], dt)
          y += 10
          y = pdfKeyBox(doc, y, 'Points cles de la simulation', [
            ['TRI estime (IR)', pPct(result.ir.tri)],
            ['Rev. nets / an (IR)', pEur(result.ir.revenusNetsAn), 'green'],
            ['TRI estime (IS)', pPct(result.is.tri)],
            ['Rev. nets / an (IS)', pEur(result.is.revenusNetsAn), 'green'],
          ], dt)
          const img = await captureChartImage(chartRef)
          pdfChartAndDisclaimer(doc, img, y, dt)
          pdfFinalize(doc, 'SCPI_WemoOne', clientName)
        }} />
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
  const chartRef = useRef(null)
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

  const result = useMemo(() => {
    const fraisNotaire = Math.round(prixBien * NOTAIRE_PCT)
    const coutTotal = prixBien + fraisNotaire
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
      fraisNotaire, coutTotal, emprunt, mensualiteCredit: Math.round(mensualiteCredit),
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
              ['Coût total acquisition', euro(result.coutTotal)],
              ['Apport', euro(apport)],
              ['Montant emprunté', euro(result.emprunt)],
            ].map(([label, val], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${C.bd}`, fontSize: 12, fontWeight: i === 2 || i === 4 ? 700 : 400 }}>
                <span style={{ color: C.ivoryMuted }}>{label}</span>
                <span style={{ color: i === 2 || i === 4 ? C.ivory : C.ivoryMuted }}>{val}</span>
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
      <div ref={chartRef} style={{ height: 280, background: '#fff', borderRadius: 10, padding: 16 }}>
        <Line data={chartData} options={{ ...chartDefaults }} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Btn onClick={handleAIEmail} variant="outline" disabled={aiLoading}>{aiLoading ? 'Génération…' : 'Générer email client (IA)'}</Btn>
        <ExportPDFButton onExport={async clientName => {
          const dt = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
          const doc = new jsPDF(); pdfHeader(doc, dt)
          let y = pdfTitleBlock(doc, 'Achat Immobilier Neuf', clientName, 'Entasis Conseil', dt)
          const tauxApport = result.coutTotal > 0 ? ((apport / result.coutTotal) * 100).toFixed(1) : '0'
          // Section 1: Parametres du bien
          y = pdfSec(doc, y, 'Parametres du bien', dt)
          y = pdfRows(doc, y, [
            ['Prix du bien', pEur(prixBien)],
            ['Surface', surface + ' m2'],
            ['Dispositif fiscal', dispositif],
          ], dt)
          y += 10
          // Section 2: Acquisition
          y = pdfSec(doc, y, 'Acquisition', dt)
          y = pdfRows(doc, y, [
            ['Prix du bien FAI', pEur(prixBien)],
            ['Frais de notaire 2,5% (taux reduit neuf)', pEur(result.fraisNotaire)],
            ['Cout total acquisition', pEur(result.coutTotal)],
            ['Apport personnel', pEur(apport)],
            ['Taux d\'apport', tauxApport + ' %'],
            ['Montant emprunte', pEur(result.emprunt)],
          ], dt)
          y += 10
          // Section 3: Financement
          y = pdfSec(doc, y, 'Financement', dt)
          const coutInterets = Math.round(result.mensualiteCredit * dureeEmprunt * 12 - result.emprunt)
          y = pdfRows(doc, y, [
            ['Duree d\'emprunt', dureeEmprunt + ' ans'],
            ['Taux d\'interet', tauxInteret + ' %'],
            ['Taux assurance emprunteur', tauxAssurance + ' %'],
            ['Mensualite hors assurance', pEur(result.mensualiteCredit)],
            ['Assurance mensuelle', pEur(result.assuranceMensuelle)],
            ['Mensualite totale', pEur(result.mensualiteTotale)],
            ['Cout total des interets', pEur(coutInterets)],
            ['Cout total du credit (interets + assurance)', pEur(result.coutCredit)],
          ], dt)
          y += 10
          // Section 4: Rendement locatif
          if (dispositif === 'LLI' || dispositif === 'LMNP') {
            y = pdfSec(doc, y, 'Rendement locatif', dt)
            const rendRows = [
              ['Loyer mensuel estime', pEur(result.loyerMensuel)],
              ['Cashflow mensuel brut', pEur(result.cashflowMensuel), result.cashflowMensuel >= 0 ? 'green' : 'red'],
              ['Rendement brut', pPct(result.rendBrut)],
            ]
            if (dispositif === 'LLI') rendRows.push(['Economie TVA (10% vs 20%)', pEur(result.economieTVA), 'green'])
            y = pdfRows(doc, y, rendRows, dt)
            y += 10
          }
          // Section 5: Synthese patrimoniale
          const valeurFuture = Math.round(prixBien * Math.pow(1.01, dureeEmprunt))
          const capitalRembourse = result.emprunt
          const pvLatente = valeurFuture - prixBien
          const effortMensuel = result.mensualiteTotale - (result.loyerMensuel || 0)
          y = pdfSec(doc, y, 'Synthese patrimoniale', dt)
          y = pdfRows(doc, y, [
            ['Valeur estimee dans ' + dureeEmprunt + ' ans (+1%/an)', pEur(valeurFuture)],
            ['Capital rembourse', pEur(capitalRembourse)],
            ['Plus-value latente estimee', pEur(pvLatente), 'green'],
            ['Effort d\'epargne mensuel net', pEur(effortMensuel), effortMensuel > 0 ? 'red' : 'green'],
          ], dt)
          y += 10
          // Key results box
          const keyRows = [
            ['Mensualite totale', pEur(result.mensualiteTotale)],
            ['Cout du credit', pEur(result.coutCredit), 'red'],
          ]
          if (dispositif === 'LLI' || dispositif === 'LMNP') {
            keyRows.push(['Rendement brut', pPct(result.rendBrut)])
            keyRows.push(['Cashflow mensuel', pEur(result.cashflowMensuel), result.cashflowMensuel >= 0 ? 'green' : 'red'])
          }
          y = pdfKeyBox(doc, y, 'Points cles de la simulation', keyRows, dt)
          const img = await captureChartImage(chartRef)
          pdfChartAndDisclaimer(doc, img, y, dt)
          pdfFinalize(doc, 'AchatImmoNeuf', clientName)
        }} />
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
