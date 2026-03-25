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
   TAX ENGINE (bareme 2025 sur revenus 2024)
───────────────────────────────────────────────────────────────────────────── */
const TRANCHES_IR = [
  { min: 0, max: 11497, taux: 0 },
  { min: 11497, max: 29315, taux: 0.11 },
  { min: 29315, max: 83823, taux: 0.30 },
  { min: 83823, max: 180294, taux: 0.41 },
  { min: 180294, max: Infinity, taux: 0.45 },
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
  const res = await fetch('/api/generate-note', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemPrompt: system, userMessage: userMsg }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.content || 'Erreur : pas de reponse'
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
        const active = String(value) === String(key)
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
   PDF EXPORT ENGINE v4 — Ultra-professionnel
═══════════════════════════════════════════════════════════════════════════ */
const P = { m: 20, pw: 210, ph: 297 }
P.cw = P.pw - P.m * 2
P.right = P.pw - P.m

const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' EUR'
const pPct = (v) => (Number(v) || 0).toFixed(2) + ' %'
const pNum = (v) => String(Math.round(Number(v) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

const navy = [44, 62, 80]
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

/* ── PDF Cover Page ─────────────────────────────────────────────────────── */
function pdfCoverPage(doc, simType, clientName, conseiller, conseillerEmail, date) {
  // Background geometric shapes
  sf(doc, [235, 235, 235])
  doc.triangle(170, 0, 210, 0, 210, 60, 'F')
  sf(doc, [240, 240, 240])
  doc.triangle(150, 297, 210, 297, 210, 200, 'F')
  sf(doc, [230, 230, 230])
  doc.rect(0, 120, 8, 80, 'F')
  sf(doc, [245, 245, 245])
  doc.triangle(0, 0, 0, 40, 30, 0, 'F')
  sf(doc, [238, 238, 238])
  doc.rect(180, 140, 30, 4, 'F')
  doc.rect(185, 148, 25, 3, 'F')

  // Title block
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(32)
  sc(doc, navy)
  doc.text('Simulation', P.m + 10, 100)
  doc.text(simType, P.m + 10, 115)

  // Accent line
  sf(doc, navy)
  doc.rect(P.m + 10, 122, 50, 2, 'F')

  // Client info
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(14)
  sc(doc, metaGrey)
  doc.text('Etude realisee pour', P.m + 10, 145)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  sc(doc, dark)
  doc.text(clientName, P.m + 10, 157)

  // Date
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  sc(doc, metaGrey)
  doc.text('le ' + date, P.m + 10, 168)

  // Conseiller block
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  sc(doc, labelGrey)
  doc.text('Votre conseiller', P.m + 10, 195)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  sc(doc, navy)
  doc.text(conseiller, P.m + 10, 205)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  sc(doc, metaGrey)
  doc.text(conseillerEmail, P.m + 10, 213)

  // Bottom branding
  sf(doc, navy)
  doc.rect(0, 270, P.pw, 27, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  sc(doc, white)
  doc.text('ENTASIS CONSEIL', P.pw / 2, 282, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('Cabinet en Gestion de Patrimoine Independant — ORIAS 23003153', P.pw / 2, 290, { align: 'center' })
}

/* ── PDF Header (pages 2+) ──────────────────────────────────────────────── */
function pdfHeader(doc, date) {
  sf(doc, navy)
  doc.rect(0, 0, P.pw, 20, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  sc(doc, white)
  doc.text('ENTASIS CONSEIL', P.m, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(date, P.right, 13, { align: 'right' })
}

function pdfFooter(doc, pg, total) {
  sd(doc, [204, 204, 204])
  doc.setLineWidth(0.3)
  doc.line(P.m, 282, P.right, 282)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  sc(doc, footGrey)
  doc.text(FOOTER_LEFT, P.m, 288)
  doc.text('Page ' + pg + ' / ' + total, P.right, 288, { align: 'right' })
}

function pdfNewPageIfNeeded(doc, y, needed, date) {
  if (y + needed > 270) { doc.addPage(); pdfHeader(doc, date); return 30 }
  return y
}

function pdfSec(doc, y, label, date) {
  y = pdfNewPageIfNeeded(doc, y, 20, date)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  sc(doc, navy)
  doc.text(label, P.m, y)
  sf(doc, navy)
  doc.rect(P.m, y + 2, 40, 1, 'F')
  sd(doc, [220, 220, 220])
  doc.setLineWidth(0.3)
  doc.line(P.m + 40, y + 2.5, P.right, y + 2.5)
  return y + 10
}

function pdfRows(doc, y, rows, date) {
  const valX = P.m + 100
  for (let i = 0; i < rows.length; i++) {
    y = pdfNewPageIfNeeded(doc, y, 9, date)
    const [label, value, style] = rows[i]
    if (i % 2 === 1) { sf(doc, altRow); doc.rect(P.m, y - 4, P.cw, 9, 'F') }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    sc(doc, labelGrey)
    doc.text(String(label), P.m + 3, y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    if (style === 'green') sc(doc, green)
    else if (style === 'red') sc(doc, red)
    else sc(doc, dark)
    doc.text(String(value), valX, y)
    y += 9
  }
  return y + 3
}

/* ── PDF KPI Blocks (big numbers in boxes) ──────────────────────────────── */
function pdfKPIBlocks(doc, y, kpis, date) {
  // kpis = [{ label, value, accent }] — up to 6
  const cols = Math.min(kpis.length, 3)
  const boxW = (P.cw - (cols - 1) * 6) / cols
  const boxH = 32

  for (let i = 0; i < kpis.length; i++) {
    const row = Math.floor(i / cols)
    const col = i % cols
    const bx = P.m + col * (boxW + 6)
    const by = y + row * (boxH + 6)

    if (by + boxH > 270) { doc.addPage(); pdfHeader(doc, date); y = 30; }

    sf(doc, disclaimerBg)
    sd(doc, [220, 220, 220])
    doc.setLineWidth(0.3)
    doc.roundedRect(bx, by, boxW, boxH, 3, 3, 'FD')

    // Accent left bar
    const accentColor = kpis[i].accent || navy
    sf(doc, accentColor)
    doc.rect(bx, by, 3, boxH, 'F')

    // Label
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    sc(doc, labelGrey)
    doc.text(kpis[i].label.toUpperCase(), bx + 8, by + 10)

    // Value
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    sc(doc, accentColor)
    doc.text(String(kpis[i].value), bx + 8, by + 24)
  }

  const totalRows = Math.ceil(kpis.length / cols)
  return y + totalRows * (boxH + 6) + 6
}

/* ── PDF Table with header ──────────────────────────────────────────────── */
function pdfCompTable(doc, y, headers, rows, date) {
  const needed = rows.length * 8 + 14
  y = pdfNewPageIfNeeded(doc, y, needed, date)
  const colW = P.cw / headers.length
  sf(doc, navy)
  doc.rect(P.m, y, P.cw, 9, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  sc(doc, white)
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
  sd(doc, [204, 204, 204])
  doc.setLineWidth(0.3)
  doc.line(P.m, y - 4, P.right, y - 4)
  return y + 3
}

async function captureChartImage(chartRef) {
  if (!chartRef?.current) return null
  const canvas = await html2canvas(chartRef.current, { backgroundColor: '#FFFFFF', scale: 2 })
  return canvas.toDataURL('image/png')
}

function pdfChartPage(doc, img, title, y, date) {
  const chartH = 85
  if (img) {
    doc.addPage()
    pdfHeader(doc, date)
    y = 35
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    sc(doc, navy)
    doc.text(title, P.pw / 2, y, { align: 'center' })
    y += 10
    doc.addImage(img, 'PNG', P.m, y, P.cw, chartH)
    y += chartH + 10
  }
  return y
}

function pdfDisclaimer(doc, y, date) {
  y = pdfNewPageIfNeeded(doc, y, 35, date)
  const lines = doc.splitTextToSize(DISCLAIMER, P.cw - 16)
  const boxH = lines.length * 3.8 + 14
  sf(doc, disclaimerBg)
  sd(doc, [204, 204, 204])
  doc.setLineWidth(0.5)
  doc.rect(P.m, y, P.cw, boxH, 'FD')
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  sc(doc, labelGrey)
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
   TAB 1 — SIMULATEUR PER (logique Yomoni)
═══════════════════════════════════════════════════════════════════════════ */
const PARTS_OPTIONS = [
  { value: 1, label: '1' }, { value: 1.5, label: '1.5' }, { value: 2, label: '2' },
  { value: 2.5, label: '2.5' }, { value: 3, label: '3' }, { value: 3.5, label: '3.5' }, { value: 4, label: '4' },
]

const PROFIL_RENDEMENTS = [
  { value: 'prudent', label: 'Prudent 3%', taux: 0.03 },
  { value: 'equilibre', label: 'Equilibre 5%', taux: 0.05 },
  { value: 'dynamique', label: 'Dynamique 7%', taux: 0.07 },
]

function SimulateurPER() {
  const chartRef = useRef(null)
  const [revenu, setRevenu] = useState(80000)
  const [nbParts, setNbParts] = useState(2)
  const [plafondReportable, setPlafondReportable] = useState(0)
  const [age, setAge] = useState(35)
  const [ageRetraite, setAgeRetraite] = useState(64)
  const [versementMensuel, setVersementMensuel] = useState(500)
  const [versementInitial, setVersementInitial] = useState(0)
  const [profil, setProfil] = useState('equilibre')
  const [fraisGestion, setFraisGestion] = useState(1)
  const [showDetail, setShowDetail] = useState(false)

  const duree = Math.max(1, ageRetraite - age)

  // Plafond PER 2025
  const plafondBase = Math.max(4637, Math.min(revenu * 0.10, 37094))
  const plafondTotal = plafondBase + plafondReportable

  // Versements PER envisages (capped at plafond)
  const versementAnnuel2025 = Math.min(versementMensuel * 12, plafondTotal)
  const [versement2025, setVersement2025] = useState(versementAnnuel2025)

  // Keep versement2025 in sync with plafond changes
  useEffect(() => {
    setVersement2025(prev => Math.min(prev, plafondTotal))
  }, [plafondTotal])

  const result = useMemo(() => {
    // Fiscal calculations
    const impotSans = calcIR(revenu, nbParts)
    const revenuAvecPER = Math.max(0, revenu - versement2025)
    const impotAvec = calcIR(revenuAvecPER, nbParts)
    const economieFiscale = impotSans - impotAvec
    const effortReel = versement2025 - economieFiscale
    const tmi = getTMI(revenu, nbParts)

    // Long-term simulation — 3 scenarios
    const frais = fraisGestion / 100
    const scenarios = PROFIL_RENDEMENTS.map(p => {
      const taux = p.taux
      let capital = versementInitial
      const yearly = []
      let totalVerse = versementInitial
      let econFiscaleCumulee = 0

      for (let an = 1; an <= duree; an++) {
        const versAnnuel = versementMensuel * 12
        totalVerse += versAnnuel
        // Economie fiscale de l'annee (on suppose meme revenu/TMI)
        const ecoAn = versAnnuel * tmi
        econFiscaleCumulee += ecoAn
        capital = (capital + versAnnuel) * (1 + taux - frais)
        yearly.push({
          annee: an,
          versements: versAnnuel,
          produits: Math.round(capital - totalVerse),
          capital: Math.round(capital),
          econFiscale: Math.round(ecoAn),
        })
      }

      const plusValue = Math.round(capital - totalVerse)
      const renteMensuelle = Math.round(capital * 0.032 / 12)

      // TRI net calculation
      let tri = taux
      for (let iter = 0; iter < 50; iter++) {
        let npv = -versementInitial
        let dnpv = 0
        for (let t = 1; t <= duree; t++) {
          const cf = -(versementMensuel * 12 - versementMensuel * 12 * tmi) // effort reel annuel (negatif = investissement net)
          const disc = Math.pow(1 + tri, t)
          npv += cf / disc
          dnpv -= t * cf / (disc * (1 + tri))
        }
        const disc = Math.pow(1 + tri, duree)
        npv += capital / disc
        dnpv -= duree * capital / (disc * (1 + tri))
        if (Math.abs(dnpv) < 1e-12) break
        const step = npv / dnpv
        tri = tri - step
        if (Math.abs(step) < 1e-8) break
      }

      return {
        ...p,
        capital: Math.round(capital),
        totalVerse: Math.round(totalVerse),
        plusValue,
        econFiscaleCumulee: Math.round(econFiscaleCumulee),
        effortReelTotal: Math.round(totalVerse - econFiscaleCumulee),
        renteMensuelle,
        tri: isFinite(tri) ? tri : 0,
        yearly,
      }
    })

    return { impotSans, impotAvec, economieFiscale, effortReel, tmi, plafondTotal, scenarios }
  }, [revenu, nbParts, versement2025, versementMensuel, versementInitial, age, ageRetraite, duree, fraisGestion, plafondReportable, plafondTotal])

  const selectedScenario = result.scenarios.find(s => s.value === profil) || result.scenarios[1]

  const chartData = {
    labels: Array.from({ length: duree }, (_, i) => `${age + i + 1} ans`),
    datasets: [
      {
        label: 'Versements cumules',
        data: result.scenarios[1].yearly.map(y => y.annee * versementMensuel * 12 + versementInitial),
        borderColor: '#999', borderDash: [5, 3], backgroundColor: 'transparent', fill: false, tension: 0.3, pointRadius: 0, borderWidth: 1.5,
      },
      {
        label: 'Prudent (3%)',
        data: result.scenarios[0].yearly.map(y => y.capital),
        borderColor: C.info, backgroundColor: 'transparent', fill: false, tension: 0.3, pointRadius: 0, borderWidth: 2.5,
      },
      {
        label: 'Equilibre (5%)',
        data: result.scenarios[1].yearly.map(y => y.capital),
        borderColor: C.gold, backgroundColor: 'transparent', fill: false, tension: 0.3, pointRadius: 0, borderWidth: 2.5,
      },
      {
        label: 'Dynamique (7%)',
        data: result.scenarios[2].yearly.map(y => y.capital),
        borderColor: C.success, backgroundColor: 'transparent', fill: false, tension: 0.3, pointRadius: 0, borderWidth: 2.5,
      },
      {
        label: '_fill',
        data: result.scenarios[0].yearly.map(y => y.capital),
        borderColor: 'transparent',
        backgroundColor: 'rgba(74,222,128,0.08)',
        fill: '+1',
        pointRadius: 0,
        borderWidth: 0,
      },
      {
        label: '_fillTop',
        data: result.scenarios[2].yearly.map(y => y.capital),
        borderColor: 'transparent',
        backgroundColor: 'transparent',
        fill: false,
        pointRadius: 0,
        borderWidth: 0,
      },
    ],
  }

  const chartOptions = {
    ...chartDefaults,
    plugins: {
      ...chartDefaults.plugins,
      legend: {
        ...chartDefaults.plugins.legend,
        labels: {
          ...chartDefaults.plugins.legend.labels,
          filter: (item) => !item.text.startsWith('_'),
        },
      },
    },
  }

  return (
    <div>
      {/* ── FISCAL BLOCK ─────────────────────────────────────────── */}
      <div style={{ background: C.card, border: `1px solid ${C.bdGold}`, borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.gold, fontFamily: FONT_SERIF, marginBottom: 16 }}>Calcul fiscal PER 2025</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
          <div>
            <Slider label="Revenu fiscal du foyer net/an" value={revenu} onChange={setRevenu} min={20000} max={500000} step={1000} suffix="EUR" formatValue={v => euro(v)} />
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontFamily: FONT_SANS }}>Nombre de parts fiscales</div>
              <PillSelect options={PARTS_OPTIONS} value={nbParts} onChange={v => setNbParts(Number(v))} />
            </div>
            <Field label="Plafond PER reportable non utilise (3 annees precedentes)" value={plafondReportable} onChange={setPlafondReportable} suffix="EUR" />
            <div style={{ height: 14 }} />
            <Slider label="Versements PER envisages en 2025" value={versement2025} onChange={setVersement2025} min={0} max={Math.max(1, plafondTotal)} step={100} suffix="EUR" formatValue={v => euro(v)} />
          </div>
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <ResultCard label="Impots sans PER" value={euro(result.impotSans)} accent={C.danger} />
              <ResultCard label="Impots avec PER" value={euro(result.impotAvec)} accent={C.info} />
              <ResultCard label="Economie d'impots" value={euro(result.economieFiscale)} accent={C.success} />
              <ResultCard label="Effort reel d'epargne" value={euro(result.effortReel)} accent={C.ivoryMuted} />
              <ResultCard label="TMI detectee" value={`${Math.round(result.tmi * 100)}%`} accent={C.gold} />
              <ResultCard label="Plafond disponible 2025" value={euro(result.plafondTotal)} accent={C.gold} />
            </div>
          </div>
        </div>
      </div>

      {/* ── LONG TERM SIMULATION ─────────────────────────────────── */}
      <SectionDivider label="Simulation long terme" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <Slider label="Age actuel" value={age} onChange={v => { setAge(v); if (ageRetraite <= v) setAgeRetraite(v + 1) }} min={25} max={60} suffix="ans" />
          <Slider label="Age de depart a la retraite" value={ageRetraite} onChange={setAgeRetraite} min={age + 1} max={67} suffix="ans" />
          <Slider label="Versement mensuel" value={versementMensuel} onChange={setVersementMensuel} min={100} max={5000} step={50} suffix="EUR" formatValue={v => euro(v)} />
          <Field label="Versement initial" value={versementInitial} onChange={setVersementInitial} suffix="EUR" />
          <div style={{ height: 14 }} />

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontFamily: FONT_SANS }}>Hypothese de rendement</div>
            <PillSelect options={PROFIL_RENDEMENTS} value={profil} onChange={setProfil} />
          </div>

          <Slider label="Frais de gestion annuels" value={fraisGestion} onChange={setFraisGestion} min={0} max={3} step={0.1} suffix="%" />
        </div>

        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {result.scenarios.map((s, i) => (
              <ResultCard key={s.value} label={`Capital ${s.label}`} value={euro(s.capital)} accent={[C.info, C.gold, C.success][i]} sub={`Rente : ${euro(s.renteMensuelle)}/mois`} />
            ))}
            <ResultCard label="Total verse brut" value={euro(selectedScenario.totalVerse)} accent={C.ivoryDim} />
            <ResultCard label="Plus-value nette" value={euro(selectedScenario.plusValue)} accent={C.success} />
            <ResultCard label="Economie fiscale cumulee" value={euro(selectedScenario.econFiscaleCumulee)} accent={C.gold} />
            <ResultCard label="Effort reel net total" value={euro(selectedScenario.effortReelTotal)} accent={C.warn} />
            <ResultCard label="TRI net" value={pctFmt(selectedScenario.tri)} accent={C.info} />
            <ResultCard label="Rente mensuelle estimee" value={euro(selectedScenario.renteMensuelle)} accent={C.gold} sub="Taux conversion 3.2% viager" />
          </div>
        </div>
      </div>

      {/* ── DETAIL TABLE ─────────────────────────────────────────── */}
      <div style={{ marginTop: 8 }}>
        <Btn onClick={() => setShowDetail(!showDetail)} variant="outline">{showDetail ? 'Masquer' : 'Voir le detail'}</Btn>
      </div>
      {showDetail && (
        <div style={{ background: C.card, borderRadius: 10, padding: '12px 0', marginTop: 12, maxHeight: 350, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Annee', 'Versements', 'Produits', 'Capital fin annee', 'Economie fiscale'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Annee' ? 'left' : 'right', padding: '8px 12px', color: C.ivoryDim, fontSize: 10, textTransform: 'uppercase', fontWeight: 700, borderBottom: `1px solid ${C.bd}`, position: 'sticky', top: 0, background: C.card }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selectedScenario.yearly.map(r => (
                <tr key={r.annee}>
                  <td style={{ padding: '6px 12px', color: C.ivory, borderBottom: `1px solid ${C.bd}` }}>{r.annee}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: C.ivoryMuted, borderBottom: `1px solid ${C.bd}` }}>{euro(r.versements)}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: C.success, borderBottom: `1px solid ${C.bd}` }}>{euro(r.produits)}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: C.ivory, fontWeight: 600, borderBottom: `1px solid ${C.bd}` }}>{euro(r.capital)}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: C.gold, borderBottom: `1px solid ${C.bd}` }}>{euro(r.econFiscale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CHART ─────────────────────────────────────────────────── */}
      <SectionDivider label="Projection du capital" />
      <div ref={chartRef} style={{ height: 320, background: '#fff', borderRadius: 10, padding: 16 }}>
        <Line data={chartData} options={chartOptions} />
      </div>
      <div style={{ marginTop: 16 }}>
        <ExportPDFButton onExport={async clientName => {
          const dt = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
          const doc = new jsPDF()
          const conseiller = 'Louis Music'
          const email = 'louis@entasis-conseil.fr'

          // Page 1: Cover
          pdfCoverPage(doc, 'PER', clientName, conseiller, email, dt)

          // Page 2: Synthese
          doc.addPage()
          pdfHeader(doc, dt)
          let y = 35
          y = pdfSec(doc, y, 'Synthese fiscale', dt)
          y = pdfKPIBlocks(doc, y, [
            { label: 'Impots sans PER', value: fmt(result.impotSans), accent: red },
            { label: 'Impots avec PER', value: fmt(result.impotAvec), accent: navy },
            { label: 'Economie d\'impots', value: fmt(result.economieFiscale), accent: green },
            { label: 'TMI detectee', value: Math.round(result.tmi * 100) + ' %', accent: navy },
            { label: 'Plafond PER 2025', value: fmt(result.plafondTotal), accent: navy },
            { label: 'Effort reel', value: fmt(result.effortReel), accent: dark },
          ], dt)
          y += 5
          y = pdfSec(doc, y, 'Projection du capital a la retraite', dt)
          y = pdfKPIBlocks(doc, y, [
            { label: 'Capital Prudent (3%)', value: fmt(result.scenarios[0].capital), accent: [96, 165, 250] },
            { label: 'Capital Equilibre (5%)', value: fmt(result.scenarios[1].capital), accent: navy },
            { label: 'Capital Dynamique (7%)', value: fmt(result.scenarios[2].capital), accent: green },
            { label: 'Total verse brut', value: fmt(selectedScenario.totalVerse), accent: dark },
            { label: 'Eco. fiscale cumulee', value: fmt(selectedScenario.econFiscaleCumulee), accent: green },
            { label: 'Rente mensuelle (eq.)', value: fmt(result.scenarios[1].renteMensuelle), accent: navy },
          ], dt)
          y += 5
          y = pdfSec(doc, y, 'Parametres de simulation', dt)
          y = pdfRows(doc, y, [
            ['Age actuel', age + ' ans'],
            ['Age de retraite', ageRetraite + ' ans'],
            ['Duree de capitalisation', duree + ' ans'],
            ['Versement mensuel', fmt(versementMensuel)],
            ['Versement initial', fmt(versementInitial)],
            ['Revenu fiscal', fmt(revenu)],
            ['Nombre de parts', String(nbParts)],
            ['Frais de gestion', fraisGestion + ' %'],
          ], dt)

          // Page 3: Tableau annuel
          doc.addPage()
          pdfHeader(doc, dt)
          y = 35
          y = pdfSec(doc, y, 'Tableau annuel detaille — ' + selectedScenario.label, dt)
          y = pdfCompTable(doc, y, ['Annee', 'Versements', 'Produits', 'Capital', 'Eco. fiscale'], selectedScenario.yearly.map((r, i) => ({
            cells: [r.annee, fmt(r.versements), fmt(r.produits), fmt(r.capital), fmt(r.econFiscale)],
            _bold: i === selectedScenario.yearly.length - 1,
          })), dt)

          // Page 4: Chart
          const img = await captureChartImage(chartRef)
          y = pdfChartPage(doc, img, 'Evolution du capital PER', y, dt)
          pdfDisclaimer(doc, y, dt)

          pdfFinalize(doc, 'PER', clientName)
        }} />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 2 — SIMULATEUR ASSURANCE VIE (logique Boursorama)
═══════════════════════════════════════════════════════════════════════════ */
const AV_OBJECTIFS = [
  { value: 'capitalisation', label: 'Capitalisation' },
  { value: 'transmission', label: 'Transmission' },
  { value: 'retraite', label: 'Retraite' },
]

function SimulateurAssuranceVie() {
  const chartRef = useRef(null)
  const [capitalInitial, setCapitalInitial] = useState(10000)
  const [versementMensuel, setVersementMensuel] = useState(200)
  const [duree, setDuree] = useState(15)
  const [pctEuro, setPctEuro] = useState(40)
  const [tauxEuro, setTauxEuro] = useState(2.5)
  const [tauxUC, setTauxUC] = useState(5)
  const [fraisGestion, setFraisGestion] = useState(0.85)
  const [objectif, setObjectif] = useState('capitalisation')
  const [situationFiscale, setSituationFiscale] = useState('celibataire')

  const pctUC = 100 - pctEuro

  const result = useMemo(() => {
    const tauxComposite = (pctEuro * tauxEuro + pctUC * tauxUC) / 10000 - fraisGestion / 100
    const versementAnnuel = versementMensuel * 12

    let capital = capitalInitial
    const yearlyBrut = []
    const yearlyNet = []
    const yearlyCumVerse = []

    for (let an = 1; an <= duree; an++) {
      capital = capital * (1 + tauxComposite) + versementAnnuel
      yearlyBrut.push(Math.round(capital))

      const totalVerseAnN = capitalInitial + versementAnnuel * an
      yearlyCumVerse.push(totalVerseAnN)

      // Fiscal calc at each year for net curve
      const interetsAnN = Math.max(0, Math.round(capital) - totalVerseAnN)
      const abattement = situationFiscale === 'couple' ? 9200 : 4600
      let impotAnN = 0
      if (an >= 8) {
        // After 8 years
        const interetsApresAbat = Math.max(0, interetsAnN - abattement)
        if (totalVerseAnN <= 150000) {
          impotAnN = interetsApresAbat * 0.075
        } else {
          const part150 = Math.max(0, interetsApresAbat * (150000 / totalVerseAnN))
          const partAbove = interetsApresAbat - part150
          impotAnN = part150 * 0.075 + partAbove * 0.128
        }
      } else {
        // Before 8 years: PFU 12.8% on all gains
        impotAnN = interetsAnN * 0.128
      }
      const psAnN = interetsAnN * 0.172
      yearlyNet.push(Math.round(capital - impotAnN - psAnN))
    }

    const capitalBrut = Math.round(capital)
    const totalVerse = capitalInitial + versementAnnuel * duree
    const interets = Math.max(0, capitalBrut - totalVerse)

    // Fiscalite AV apres 8 ans
    const abattement = situationFiscale === 'couple' ? 9200 : 4600
    const interetsApresAbat = Math.max(0, interets - abattement)

    let irApresAbat = 0
    if (totalVerse <= 150000) {
      irApresAbat = Math.round(interetsApresAbat * 0.075)
    } else {
      const part150 = Math.max(0, interetsApresAbat * (150000 / totalVerse))
      const partAbove = interetsApresAbat - part150
      irApresAbat = Math.round(part150 * 0.075 + partAbove * 0.128)
    }
    const ps = Math.round(interets * 0.172)
    const netFiscal = capitalBrut - irApresAbat - ps
    const rendNetAnnualise = totalVerse > 0 && duree > 0 ? (Math.pow(netFiscal / totalVerse, 1 / duree) - 1) : 0

    return {
      capitalBrut, totalVerse, interets, abattement, irApresAbat, ps, netFiscal,
      rendNetAnnualise, tauxComposite,
      yearlyBrut, yearlyNet, yearlyCumVerse,
    }
  }, [capitalInitial, versementMensuel, duree, pctEuro, tauxEuro, tauxUC, fraisGestion, situationFiscale, pctUC])

  const chartData = {
    labels: Array.from({ length: duree }, (_, i) => `An ${i + 1}`),
    datasets: [
      {
        label: 'Versements cumules',
        data: result.yearlyCumVerse,
        borderColor: '#bbb', backgroundColor: 'rgba(200,200,200,0.1)', fill: true,
        tension: 0.3, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 3],
      },
      {
        label: 'Capital brut',
        data: result.yearlyBrut,
        borderColor: C.gold, backgroundColor: 'transparent', fill: false,
        tension: 0.3, pointRadius: 0, borderWidth: 2.5,
      },
      {
        label: 'Capital net apres fiscalite',
        data: result.yearlyNet,
        borderColor: C.success, backgroundColor: 'transparent', fill: false,
        tension: 0.3, pointRadius: 0, borderWidth: 2.5,
      },
    ],
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <Slider label="Capital initial" value={capitalInitial} onChange={setCapitalInitial} min={1000} max={500000} step={1000} suffix="EUR" formatValue={v => euro(v)} />
          <Slider label="Versements mensuels programmes" value={versementMensuel} onChange={setVersementMensuel} min={0} max={5000} step={50} suffix="EUR" formatValue={v => euro(v)} />
          <Slider label="Duree" value={duree} onChange={setDuree} min={1} max={30} suffix="ans" />

          <SectionDivider label="Repartition et rendement" />
          <Slider label={`Fonds Euro ${pctEuro}% / UC ${pctUC}%`} value={pctEuro} onChange={setPctEuro} min={0} max={100} step={5} suffix="%" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <Field label="Taux fonds euro" value={tauxEuro} onChange={setTauxEuro} suffix="%" step="0.1" />
            <Field label="Taux UC hypothese" value={tauxUC} onChange={setTauxUC} suffix="%" step="0.1" />
          </div>

          <Field label="Frais de gestion annuels" value={fraisGestion} onChange={setFraisGestion} suffix="%" step="0.05" />
          <div style={{ height: 14 }} />

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontFamily: FONT_SANS }}>Objectif</div>
            <PillSelect options={AV_OBJECTIFS} value={objectif} onChange={setObjectif} />
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontFamily: FONT_SANS }}>Situation fiscale</div>
            <PillSelect options={[{ value: 'celibataire', label: 'Celibataire' }, { value: 'couple', label: 'Couple' }]} value={situationFiscale} onChange={setSituationFiscale} />
          </div>
        </div>

        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <ResultCard label="Capital brut final" value={euro(result.capitalBrut)} accent={C.gold} />
            <ResultCard label="Total verse" value={euro(result.totalVerse)} accent={C.ivoryDim} />
            <ResultCard label="Interets generes" value={euro(result.interets)} accent={C.success} />
            <ResultCard label="Rendement net annualise" value={pctFmt(result.rendNetAnnualise)} accent={C.info} sub={`Euro ${pctEuro}% / UC ${pctUC}%`} />
          </div>

          <div style={{ background: C.card, borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryDim, textTransform: 'uppercase', marginBottom: 8, fontFamily: FONT_SANS }}>Fiscalite rachat apres 8 ans</div>
            {[
              ['Interets generes', euro(result.interets), C.ivory],
              [`Abattement (${situationFiscale === 'couple' ? 'couple' : 'celibataire'})`, `- ${euro(result.abattement)}`, C.success],
              ['PS (17,2%)', `- ${euro(result.ps)}`, C.danger],
              ['IR apres abattement', `- ${euro(result.irApresAbat)}`, C.danger],
            ].map(([label, val, color], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: `1px solid ${C.bd}` }}>
                <span style={{ color: C.ivoryDim }}>{label}</span>
                <span style={{ color, fontWeight: 600 }}>{val}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '8px 0', fontWeight: 700 }}>
              <span style={{ color: C.ivory }}>Capital net apres fiscalite</span>
              <span style={{ color: C.success }}>{euro(result.netFiscal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── CHART ─────────────────────────────────────────────────── */}
      <SectionDivider label="Evolution du capital" />
      <div ref={chartRef} style={{ height: 320, background: '#fff', borderRadius: 10, padding: 16 }}>
        <Line data={chartData} options={{ ...chartDefaults }} />
      </div>
      <div style={{ marginTop: 16 }}>
        <ExportPDFButton onExport={async clientName => {
          const dt = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
          const doc = new jsPDF()
          const conseiller = 'Louis Music'
          const email = 'louis@entasis-conseil.fr'

          // Page 1: Cover
          pdfCoverPage(doc, 'Assurance Vie', clientName, conseiller, email, dt)

          // Page 2: Synthese
          doc.addPage()
          pdfHeader(doc, dt)
          let y = 35
          y = pdfSec(doc, y, 'Synthese', dt)
          y = pdfKPIBlocks(doc, y, [
            { label: 'Capital brut final', value: fmt(result.capitalBrut), accent: navy },
            { label: 'Total verse', value: fmt(result.totalVerse), accent: dark },
            { label: 'Interets generes', value: fmt(result.interets), accent: green },
            { label: 'PS (17,2%)', value: '- ' + fmt(result.ps), accent: red },
            { label: 'IR apres abattement', value: '- ' + fmt(result.irApresAbat), accent: red },
            { label: 'Capital net apres fiscalite', value: fmt(result.netFiscal), accent: green },
          ], dt)
          y += 5
          y = pdfSec(doc, y, 'Rendement', dt)
          y = pdfKPIBlocks(doc, y, [
            { label: 'Rendement net annualise', value: pPct(result.rendNetAnnualise), accent: navy },
            { label: 'Taux composite brut', value: pPct(result.tauxComposite), accent: dark },
          ], dt)
          y += 5
          y = pdfSec(doc, y, 'Parametres de simulation', dt)
          y = pdfRows(doc, y, [
            ['Capital initial', fmt(capitalInitial)],
            ['Versements mensuels', fmt(versementMensuel)],
            ['Duree', duree + ' ans'],
            ['Repartition', 'Fonds Euro ' + pctEuro + '% / UC ' + pctUC + '%'],
            ['Taux fonds euro', tauxEuro + ' %'],
            ['Taux UC hypothese', tauxUC + ' %'],
            ['Frais de gestion', fraisGestion + ' %'],
            ['Objectif', AV_OBJECTIFS.find(o => o.value === objectif)?.label || ''],
            ['Situation fiscale', situationFiscale === 'couple' ? 'Couple' : 'Celibataire'],
          ], dt)

          // Page 3: Tableau annuel
          doc.addPage()
          pdfHeader(doc, dt)
          y = 35
          y = pdfSec(doc, y, 'Tableau annuel detaille', dt)
          const tableRows = result.yearlyBrut.map((brut, i) => ({
            cells: [
              i + 1,
              fmt(result.yearlyCumVerse[i]),
              fmt(brut),
              fmt(brut - result.yearlyCumVerse[i]),
              fmt(result.yearlyNet[i]),
            ],
            _bold: i === result.yearlyBrut.length - 1,
          }))
          y = pdfCompTable(doc, y, ['Annee', 'Verse cumule', 'Capital brut', 'Interets', 'Capital net'], tableRows, dt)

          // Page 4: Chart
          const img = await captureChartImage(chartRef)
          y = pdfChartPage(doc, img, 'Evolution du capital Assurance Vie', y, dt)
          pdfDisclaimer(doc, y, dt)

          pdfFinalize(doc, 'AssuranceVie', clientName)
        }} />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 3 — SIMULATEUR SCPI WEMO ONE (donnees officielles wemo-reim.fr, mars 2026)
═══════════════════════════════════════════════════════════════════════════ */
const WEMO = {
  prixPart: 200,
  valeurReconstitution: 218.73,
  td2025: 0.1527,
  tdCible: 0.07,
  triCible: 0.075,
  perfGlobaleCible: 0.08,
  foreignPct: 0.8552,
  francePct: 0.145,
  geoItalie: 0.504, geoEspagne: 0.351, geoFrance: 0.145,
  capitalisation: 100_000_000,
  nbAssocies: 3600,
  nbBiens: 31,
  ticketMin: 1000,
  dureeRecommandee: 8,
  fraisSouscription: 0.10,
  commissionGestion: 0.11,
  delaiJouissance: 7,
  ps: 0.172,
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
    const capitalEnParts = montantEffectif
    const fraisE = Math.round(montantEffectif * WEMO.fraisSouscription)
    const decaissementTotal = montantEffectif + fraisE

    function calcStructure(isIS) {
      const rate = isIS ? isRate / 100 : tmiRate / 100
      const revenusBrutsAn = capitalEnParts * rendementDecimal
      const psAn = isIS ? 0 : revenusBrutsAn * WEMO.francePct * WEMO.ps
      const impotAn = revenusBrutsAn * rate
      const revenusNetsAn = revenusBrutsAn - psAn - impotAn
      const effectiveYears = Math.max(0, duree - WEMO.delaiJouissance / 12)
      const totalBrut = Math.round(revenusBrutsAn * effectiveYears)
      const totalPS = Math.round(psAn * effectiveYears)
      const totalImpot = Math.round(impotAn * effectiveYears)
      const totalNet = Math.round(revenusNetsAn * effectiveYears)
      const prixPartSortie = WEMO.prixPart * Math.pow(1 + revalo / 100, duree)
      const capitalSortie = nbParts * prixPartSortie

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
      const prompt = `Redige une note de synthese professionnelle (10-12 lignes) pour un client investissant ${euro(montantEffectif)} (${nbParts} parts) en SCPI Wemo One via ${structure}.

Donnees officielles Wemo One (source wemo-reim.fr) :
- TD 2025 reel : 15,27% (exceptionnel, phase de lancement)
- TD cible long terme : 7% net de frais de gestion (11% HT), brut de fiscalite
- TRI cible : 7,5% — Performance globale cible : 8%
- Frais de souscription : 10% HT
- Pas de commission de sortie (SCPI a capital variable, retrait par confrontation au marche)
- 85,52% patrimoine europeen hors France (Italie 50,4%, Espagne 35,1%)
- Classes d'actifs : Commerce 73,9%, Logistique 15,1%
- Capitalisation : 100M EUR, 3600 associes, 31 biens

Resultats simulation sur ${duree} ans (hypothese rendement ${rendement}%) :
- TRI estime : ${pctFmt(d.tri)}
- Revenus nets annuels : ${euro(d.revenusNetsAn)}
- Capital a la sortie : ${euro(d.capitalSortie)}

IMPORTANT : Mentionne clairement que le TD 2025 de 15,27% est exceptionnel et ne reflete pas la performance future. Le taux cible long terme est de 7%. Mentionne les risques (liquidite limitee, capital non garanti, marche immobilier europeen). Rappelle que les performances passees ne prejudgent pas des performances futures.`
      const text = await callAI('Tu es un CGP senior chez Entasis Conseil. Redige des notes conformes AMF : pas de promesse de rendement garanti, mention systematique des risques, distinction claire entre performance passee et objectif futur.', prompt)
      setAiNote(text)
    } catch (e) { setAiNote('Erreur : ' + e.message) }
    setAiLoading(false)
  }

  function handleCopySim() {
    const ir = result.ir
    const is = result.is
    const text = `SIMULATION SCPI WEMO ONE — Entasis Conseil
══════════════════════════════════════════
Capital en parts : ${euro(montantEffectif)} (${nbParts} parts x ${WEMO.prixPart} EUR)
Frais souscription (10% HT, en sus) : ${euro(result.ir.fraisEntree)}
Decaissement total : ${euro(result.ir.decaissementTotal)}
Duree : ${duree} ans - Revalorisation : ${revalo}%/an
Hypothese rendement : ${rendement}% (cible officielle : 7%)
Pas de frais de sortie (SCPI a capital variable)

COMPARAISON IR vs IS
──────────────────
                          IR              IS
Revenus bruts / an :      ${euro(ir.revenusBrutsAn).padStart(10)}    ${euro(is.revenusBrutsAn).padStart(10)}
PS (14,5% FR) / an :      ${euro(ir.psAn).padStart(10)}    —
Impot / an :              ${euro(ir.impotAn).padStart(10)}    ${euro(is.impotAn).padStart(10)}
Revenus nets / an :       ${euro(ir.revenusNetsAn).padStart(10)}    ${euro(is.revenusNetsAn).padStart(10)}
Revenus cumules :         ${euro(ir.totalNet).padStart(10)}    ${euro(is.totalNet).padStart(10)}
Capital sortie :          ${euro(ir.capitalSortie).padStart(10)}    ${euro(is.capitalSortie).padStart(10)}
TRI estime :              ${pctFmt(ir.tri).padStart(10)}    ${pctFmt(is.tri).padStart(10)}

Les performances passees ne prejudgent pas des performances futures.
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
            <div style={{ fontSize: 12, color: C.ivoryDim, marginTop: 2 }}>SCPI diversifiee europeenne — Wemo REIM - Capitalisation {(WEMO.capitalisation / 1e6).toFixed(0)}M EUR</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: C.goldBg, color: C.gold, border: `1px solid ${C.goldLine}` }}>{WEMO.nbAssocies.toLocaleString('fr-FR')} associes</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: C.goldBg, color: C.gold, border: `1px solid ${C.goldLine}` }}>{WEMO.nbBiens} biens</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Prix / part', value: `${WEMO.prixPart} EUR` },
            { label: 'Val. reconst.', value: `${WEMO.valeurReconstitution.toFixed(2)} EUR` },
            { label: 'TD 2025', value: '15,27%', accent: C.success },
            { label: 'TD cible LT', value: '7%', accent: C.gold },
            { label: 'TRI cible', value: '7,5%' },
            { label: 'Souscription', value: '10% HT' },
            { label: 'Gestion', value: '11% HT' },
            { label: 'Delai jouiss.', value: '7 mois' },
          ].map(c => (
            <div key={c.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9.5, color: C.ivoryDim, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4, letterSpacing: '.03em' }}>{c.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: c.accent || C.ivory, fontFamily: FONT_SERIF }}>{c.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.ivoryDim, textTransform: 'uppercase', marginBottom: 8, letterSpacing: '.06em' }}>Repartition geographique</div>
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
              { label: 'Education', pct: WEMO.actifEducation, color: '#22d3ee' },
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

        <div style={{ marginTop: 12, fontSize: 11, color: C.ivoryDim }}>
          Ticket minimum : {euro(WEMO.ticketMin)} ({WEMO.ticketMin / WEMO.prixPart} parts) - Duree recommandee : {WEMO.dureeRecommandee} ans
        </div>
      </div>

      {/* ── DISCLAIMER ────────────────────────────────────────────── */}
      <div style={{ background: 'rgba(201,168,76,0.06)', border: `1px solid ${C.goldLine}`, borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 11.5, lineHeight: 1.7, color: C.ivoryMuted }}>
        <strong style={{ color: C.gold }}>Avertissement</strong> — Le taux de distribution 2025 de 15,27% ne reflete pas la performance future. Ce taux exceptionnel s'explique par la phase de lancement de la SCPI et des conditions d'acquisition particulierement favorables. Le taux cible long terme est de <strong style={{ color: C.ivory }}>7% net de frais de gestion, brut de fiscalite</strong> (non garanti). Les performances passees ne prejudgent pas des performances futures. L'investissement en SCPI comporte un risque de perte en capital. Frais de souscription : 10% HT. Commission de gestion : 11% HT (deja deduite du taux de distribution). Pas de commission de sortie (SCPI a capital variable).
      </div>

      {/* ── SIMULATION INPUTS + RESULTS ───────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <Slider label="Montant investi" value={montant} onChange={setMontant} min={1000} max={500000} step={1000} suffix="EUR" formatValue={v => `${euro(v)} (${Math.floor(v / WEMO.prixPart)} parts)`} />

          {montantEffectif !== montant && (
            <div style={{ fontSize: 11, color: C.ivoryDim, marginTop: -12, marginBottom: 12 }}>
              Arrondi a {nbParts} parts = {euro(montantEffectif)}
            </div>
          )}

          <Slider label="Hypothese de rendement long terme" value={rendement} onChange={setRendement} min={4} max={12} step={0.25} suffix="%" />
          <div style={{ fontSize: 10.5, color: C.ivoryDim, marginTop: -12, marginBottom: 16, lineHeight: 1.5 }}>
            Cible officielle Wemo One : <strong style={{ color: C.gold }}>7% net de frais, brut de fiscalite</strong>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontFamily: FONT_SANS }}>Structure de detention</div>
            <PillSelect options={[{ value: 'IR', label: 'IR (personne physique)' }, { value: 'IS', label: 'IS (societe)' }, { value: 'AV', label: 'Assurance Vie' }, { value: 'SCI_IS', label: 'SCI a l\'IS' }]} value={structure} onChange={setStructure} />
          </div>

          {(structure === 'IR' || structure === 'AV') && <Slider label="Votre TMI" value={tmiRate} onChange={setTmiRate} min={0} max={45} step={1} suffix="%" />}
          {(structure === 'IS' || structure === 'SCI_IS') && <Slider label="Taux IS applicable" value={isRate} onChange={setIsRate} min={15} max={33} step={1} suffix="%" />}
          <Slider label="Duree de detention" value={duree} onChange={setDuree} min={3} max={20} suffix="ans" />
          <Slider label="Hypothese revalorisation annuelle" value={revalo} onChange={setRevalo} min={0} max={5} step={0.5} suffix="%" />

          {duree < 8 && (
            <div style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: C.warn, marginTop: 8 }}>
              Duree inferieure a la duree recommandee de {WEMO.dureeRecommandee} ans. La liquidite des parts n'est pas garantie et le marche secondaire peut impliquer une decote.
            </div>
          )}

          <div style={{ background: C.card, borderRadius: 8, padding: '12px 14px', marginTop: 16, fontSize: 11.5, lineHeight: 1.6, color: C.ivoryDim }}>
            <strong style={{ color: C.ivory }}>Frais & Fiscalite</strong><br />
            - Frais de souscription : <strong style={{ color: C.ivory }}>10% HT en sus</strong> du capital investi ({euro(result.ir.capitalEnParts)} + {euro(result.ir.fraisEntree)} = {euro(result.ir.decaissementTotal)})<br />
            - Commission de gestion : <strong style={{ color: C.ivory }}>11% HT</strong> — deja incluse dans le taux de distribution (net de frais)<br />
            - <strong style={{ color: C.success }}>Pas de commission de sortie</strong> — SCPI a capital variable, retrait par confrontation au marche<br />
            - PS 17,2% uniquement sur la part francaise ({(WEMO.francePct * 100).toFixed(1)}%) soit {euro(Math.round(result.ir.revenusBrutsAn * WEMO.francePct))} d'assiette<br />
            - Les revenus europeens ({(WEMO.foreignPct * 100).toFixed(1)}%) sont <strong style={{ color: C.success }}>exoneres de prelevements sociaux</strong>
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
                  ['Capital generateur de revenus', euro(result.ir.capitalEnParts), euro(result.is.capitalEnParts)],
                  ['Frais souscription (10% HT, en sus)', euro(result.ir.fraisEntree), euro(result.is.fraisEntree)],
                  ['Decaissement total', euro(result.ir.decaissementTotal), euro(result.is.decaissementTotal)],
                  [`Revenus bruts / an (${rendement}%)`, euro(result.ir.revenusBrutsAn), euro(result.is.revenusBrutsAn)],
                  [`PS 17,2% (part FR ${(WEMO.francePct * 100).toFixed(1)}%)`, euro(result.ir.psAn) + '/an', '—'],
                  [`${structure === 'IS' || structure === 'SCI_IS' ? 'IS' : 'IR'} / an`, euro(result.ir.impotAn) + '/an', euro(result.is.impotAn) + '/an'],
                  ['Revenus nets / an', euro(result.ir.revenusNetsAn), euro(result.is.revenusNetsAn)],
                  [`Revenus nets cumules (${duree} ans)`, euro(result.ir.totalNet), euro(result.is.totalNet)],
                  ['Capital a la sortie', euro(result.ir.capitalSortie), euro(result.is.capitalSortie)],
                ].map(([label, irVal, isVal], i) => (
                  <tr key={i}>
                    <td style={tdLabel}>{label}</td>
                    <td style={tdVal}>{irVal}</td>
                    <td style={tdVal}>{isVal}</td>
                  </tr>
                ))}
                <tr style={{ background: 'rgba(201,168,76,0.05)' }}>
                  <td style={{ padding: '10px 12px', color: C.gold, fontWeight: 700, fontSize: 13 }}>TRI estime</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: C.gold, fontWeight: 700, fontSize: 16, fontFamily: FONT_SERIF }}>{pctFmt(result.ir.tri)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: C.gold, fontWeight: 700, fontSize: 16, fontFamily: FONT_SERIF }}>{pctFmt(result.is.tri)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 10, color: C.ivoryDim, marginTop: 8, lineHeight: 1.5 }}>
            Simulation basee sur une hypothese de rendement de {rendement}% (cible officielle : 7%, non garanti). TRI calcule par actualisation des flux nets. Pas de frais de sortie (SCPI a capital variable).
          </div>
        </div>
      </div>

      {/* ── CHART ─────────────────────────────────────────────────── */}
      <SectionDivider label="Evolution du patrimoine" />
      <div ref={chartRef} style={{ height: 300, background: '#fff', borderRadius: 10, padding: 16 }}>
        <Line data={chartData} options={{ ...chartDefaults }} />
      </div>

      {/* ── ACTIONS ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Btn onClick={handleCopySim} variant={copied ? 'outline' : 'gold'}>{copied ? '--- Copie' : 'Copier la simulation'}</Btn>
        <Btn onClick={handleAINote} variant="outline" disabled={aiLoading}>{aiLoading ? 'Generation...' : 'Generer note IA'}</Btn>
        <ExportPDFButton onExport={async clientName => {
          const dt = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
          const doc = new jsPDF()
          const conseiller = 'Louis Music'
          const emailC = 'louis@entasis-conseil.fr'

          pdfCoverPage(doc, 'SCPI Wemo One', clientName, conseiller, emailC, dt)
          doc.addPage()
          pdfHeader(doc, dt)
          let y = 35
          y = pdfSec(doc, y, 'Parametres de simulation', dt)
          y = pdfRows(doc, y, [
            ['Capital en parts', fmt(montantEffectif)], ['Nombre de parts', pNum(nbParts)],
            ['Frais souscription (10% HT, en sus)', fmt(result.ir.fraisEntree)],
            ['Decaissement total', fmt(result.ir.decaissementTotal)],
            ['Structure de detention', structure], ['Hypothese rendement', rendement + ' %'],
            ['Duree de detention', duree + ' ans'], ['Revalorisation annuelle', revalo + ' %/an'],
          ], dt)
          y += 10
          y = pdfSec(doc, y, 'Comparaison IR vs IS', dt)
          y = pdfCompTable(doc, y, ['', 'IR', 'IS'], [
            { cells: ['Capital generateur de revenus', fmt(result.ir.capitalEnParts), fmt(result.is.capitalEnParts)] },
            { cells: ['Frais souscription (en sus)', fmt(result.ir.fraisEntree), fmt(result.is.fraisEntree)] },
            { cells: ['Decaissement total', fmt(result.ir.decaissementTotal), fmt(result.is.decaissementTotal)] },
            { cells: ['Revenus bruts / an (' + rendement + '%)', fmt(result.ir.revenusBrutsAn), fmt(result.is.revenusBrutsAn)] },
            { cells: ['PS 17,2% (part FR 14,5%)', fmt(result.ir.psAn) + '/an', '-'] },
            { cells: ['Impot / an', fmt(result.ir.impotAn) + '/an', fmt(result.is.impotAn) + '/an'] },
            { cells: ['Revenus nets / an', fmt(result.ir.revenusNetsAn), fmt(result.is.revenusNetsAn)] },
            { cells: ['Revenus cumules (' + duree + ' ans)', fmt(result.ir.totalNet), fmt(result.is.totalNet)] },
            { cells: ['Capital a la sortie', fmt(result.ir.capitalSortie), fmt(result.is.capitalSortie)] },
            { cells: ['TRI estime', pPct(result.ir.tri), pPct(result.is.tri)], _bold: true },
          ], dt)
          y += 10
          y = pdfKPIBlocks(doc, y, [
            { label: 'TRI estime (IR)', value: pPct(result.ir.tri), accent: navy },
            { label: 'Rev. nets / an (IR)', value: fmt(result.ir.revenusNetsAn), accent: green },
            { label: 'TRI estime (IS)', value: pPct(result.is.tri), accent: navy },
            { label: 'Rev. nets / an (IS)', value: fmt(result.is.revenusNetsAn), accent: green },
          ], dt)
          const img = await captureChartImage(chartRef)
          y = pdfChartPage(doc, img, 'Evolution du patrimoine SCPI', y, dt)
          pdfDisclaimer(doc, y, dt)
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
   TAB 4 — SIMULATEUR ACHAT IMMOBILIER NEUF
═══════════════════════════════════════════════════════════════════════════ */
const DISPOSITIFS_IMMO = [
  { value: 'LLI', label: 'LLI', desc: 'TVA 10%, loyer plafonne, engagement 20 ans' },
  { value: 'LMNP', label: 'LMNP', desc: 'Amortissement, micro-BIC ou reel' },
  { value: 'RP', label: 'Residence principale', desc: 'Pas de dispositif fiscal' },
  { value: 'PTZ', label: 'PTZ', desc: 'Primo-accedant, pret a taux zero' },
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
    const loyerM2 = dispositif === 'LLI' ? 12 : dispositif === 'LMNP' ? 14 : 0
    const loyerMensuel = surface * loyerM2
    const loyerAnnuel = loyerMensuel * 12
    const rendBrut = prixBien > 0 ? loyerAnnuel / prixBien : 0
    const cashflowMensuel = loyerMensuel - mensualiteTotale
    const economieTVA = dispositif === 'LLI' ? Math.round(prixBien * 0.10) : 0

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
      { label: 'Capital restant du', data: result.yearlyRestant, borderColor: C.danger, backgroundColor: `${C.danger}15`, fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
      { label: 'Valeur estimee du bien', data: result.yearlyValeur, borderColor: C.success, fill: false, tension: 0.3, pointRadius: 0, borderWidth: 2 },
    ],
  }

  async function handleAIEmail() {
    setAiLoading(true)
    try {
      const prompt = `Redige un email professionnel pour un client interesse par un achat immobilier neuf en ${dispositif}. Bien: ${euro(prixBien)}, ${surface}m2, mensualite ${euro(result.mensualiteTotale)}, apport ${euro(apport)}, rendement brut ${pctFmt(result.rendBrut)}, cashflow mensuel ${euro(result.cashflowMensuel)}. L'email doit proposer un RDV pour approfondir le projet. Signe "L'equipe Entasis Conseil".`
      const text = await callAI('Tu es CGP chez Entasis Conseil, specialise en immobilier neuf. Redige des emails professionnels, informatifs et engageants. Mentionne que les projections sont indicatives.', prompt)
      setAiEmail(text)
    } catch (e) { setAiEmail('Erreur : ' + e.message) }
    setAiLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <Slider label="Prix du bien VEFA" value={prixBien} onChange={setPrixBien} min={100000} max={800000} step={5000} suffix="EUR" formatValue={v => euro(v)} />
          <Field label="Surface" value={surface} onChange={setSurface} suffix="m2" />
          <div style={{ height: 14 }} />
          <Slider label="Apport personnel" value={apport} onChange={setApport} min={0} max={Math.min(prixBien, 300000)} step={5000} suffix="EUR" formatValue={v => euro(v)} />

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontFamily: FONT_SANS }}>Duree d'emprunt</div>
            <PillSelect options={[{ value: 15, label: '15 ans' }, { value: 20, label: '20 ans' }, { value: 25, label: '25 ans' }]} value={dureeEmprunt} onChange={v => setDureeEmprunt(Number(v))} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Taux d'interet" value={tauxInteret} onChange={setTauxInteret} suffix="%" step="0.05" />
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
            <div style={{ fontSize: 13, fontWeight: 700, color: C.gold, marginBottom: 12, fontFamily: FONT_SERIF }}>Recapitulatif acquisition</div>
            {[
              ['Prix du bien', euro(prixBien)],
              ['Frais de notaire (2,5%)', euro(result.fraisNotaire)],
              ['Cout total acquisition', euro(result.coutTotal)],
              ['Apport', euro(apport)],
              ['Montant emprunte', euro(result.emprunt)],
            ].map(([label, val], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${C.bd}`, fontSize: 12, fontWeight: i === 2 || i === 4 ? 700 : 400 }}>
                <span style={{ color: C.ivoryMuted }}>{label}</span>
                <span style={{ color: i === 2 || i === 4 ? C.ivory : C.ivoryMuted }}>{val}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <ResultCard label="Mensualite totale" value={euro(result.mensualiteTotale)} accent={C.gold} sub={`Credit ${euro(result.mensualiteCredit)} + Ass. ${euro(result.assuranceMensuelle)}`} />
            <ResultCard label="Cout du credit" value={euro(result.coutCredit)} accent={C.warn} />
            {(dispositif === 'LLI' || dispositif === 'LMNP') && (
              <>
                <ResultCard label="Rendement brut" value={pctFmt(result.rendBrut)} accent={C.success} sub={`Loyer : ${euro(result.loyerMensuel)}/mois`} />
                <ResultCard label="Cashflow mensuel" value={euro(result.cashflowMensuel)} accent={result.cashflowMensuel >= 0 ? C.success : C.danger} />
              </>
            )}
            {dispositif === 'LLI' && <ResultCard label="Economie TVA (10% vs 20%)" value={euro(result.economieTVA)} accent={C.success} />}
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
                {['Annee', 'Interets', 'Capital rembourse', 'Capital restant du'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Annee' ? 'left' : 'right', padding: '8px 12px', color: C.ivoryDim, fontSize: 10, textTransform: 'uppercase', fontWeight: 700, borderBottom: `1px solid ${C.bd}`, position: 'sticky', top: 0, background: C.card }}>{h}</th>
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
        <Btn onClick={handleAIEmail} variant="outline" disabled={aiLoading}>{aiLoading ? 'Generation...' : 'Generer email client (IA)'}</Btn>
        <ExportPDFButton onExport={async clientName => {
          const dt = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
          const doc = new jsPDF()
          const conseiller = 'Louis Music'
          const emailC = 'louis@entasis-conseil.fr'

          pdfCoverPage(doc, 'Achat Immobilier Neuf', clientName, conseiller, emailC, dt)
          doc.addPage()
          pdfHeader(doc, dt)
          let y = 35
          const tauxApport = result.coutTotal > 0 ? ((apport / result.coutTotal) * 100).toFixed(1) : '0'
          y = pdfSec(doc, y, 'Parametres du bien', dt)
          y = pdfRows(doc, y, [
            ['Prix du bien', fmt(prixBien)],
            ['Surface', surface + ' m2'],
            ['Dispositif fiscal', dispositif],
          ], dt)
          y += 10
          y = pdfSec(doc, y, 'Acquisition', dt)
          y = pdfRows(doc, y, [
            ['Prix du bien FAI', fmt(prixBien)],
            ['Frais de notaire 2,5% (taux reduit neuf)', fmt(result.fraisNotaire)],
            ['Cout total acquisition', fmt(result.coutTotal)],
            ['Apport personnel', fmt(apport)],
            ['Taux d\'apport', tauxApport + ' %'],
            ['Montant emprunte', fmt(result.emprunt)],
          ], dt)
          y += 10
          y = pdfSec(doc, y, 'Financement', dt)
          const coutInterets = Math.round(result.mensualiteCredit * dureeEmprunt * 12 - result.emprunt)
          y = pdfRows(doc, y, [
            ['Duree d\'emprunt', dureeEmprunt + ' ans'],
            ['Taux d\'interet', tauxInteret + ' %'],
            ['Taux assurance emprunteur', tauxAssurance + ' %'],
            ['Mensualite hors assurance', fmt(result.mensualiteCredit)],
            ['Assurance mensuelle', fmt(result.assuranceMensuelle)],
            ['Mensualite totale', fmt(result.mensualiteTotale)],
            ['Cout total des interets', fmt(coutInterets)],
            ['Cout total du credit (interets + assurance)', fmt(result.coutCredit)],
          ], dt)
          y += 10
          if (dispositif === 'LLI' || dispositif === 'LMNP') {
            y = pdfSec(doc, y, 'Rendement locatif', dt)
            const rendRows = [
              ['Loyer mensuel estime', fmt(result.loyerMensuel)],
              ['Cashflow mensuel brut', fmt(result.cashflowMensuel), result.cashflowMensuel >= 0 ? 'green' : 'red'],
              ['Rendement brut', pPct(result.rendBrut)],
            ]
            if (dispositif === 'LLI') rendRows.push(['Economie TVA (10% vs 20%)', fmt(result.economieTVA), 'green'])
            y = pdfRows(doc, y, rendRows, dt)
            y += 10
          }
          const valeurFuture = Math.round(prixBien * Math.pow(1.01, dureeEmprunt))
          const capitalRembourse = result.emprunt
          const pvLatente = valeurFuture - prixBien
          const effortMensuel = result.mensualiteTotale - (result.loyerMensuel || 0)
          y = pdfSec(doc, y, 'Synthese patrimoniale', dt)
          y = pdfRows(doc, y, [
            ['Valeur estimee dans ' + dureeEmprunt + ' ans (+1%/an)', fmt(valeurFuture)],
            ['Capital rembourse', fmt(capitalRembourse)],
            ['Plus-value latente estimee', fmt(pvLatente), 'green'],
            ['Effort d\'epargne mensuel net', fmt(effortMensuel), effortMensuel > 0 ? 'red' : 'green'],
          ], dt)
          y += 10
          const keyKpis = [
            { label: 'Mensualite totale', value: fmt(result.mensualiteTotale), accent: navy },
            { label: 'Cout du credit', value: fmt(result.coutCredit), accent: red },
          ]
          if (dispositif === 'LLI' || dispositif === 'LMNP') {
            keyKpis.push({ label: 'Rendement brut', value: pPct(result.rendBrut), accent: green })
            keyKpis.push({ label: 'Cashflow mensuel', value: fmt(result.cashflowMensuel), accent: result.cashflowMensuel >= 0 ? green : red })
          }
          y = pdfKPIBlocks(doc, y, keyKpis, dt)
          const img = await captureChartImage(chartRef)
          y = pdfChartPage(doc, img, 'Capital restant vs Valeur du bien', y, dt)
          pdfDisclaimer(doc, y, dt)
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
   TAB 5 — GENERATEUR DE LETTRE
═══════════════════════════════════════════════════════════════════════════ */
const LETTER_TYPES = [
  { value: 'mission', label: 'Lettre de mission' },
  { value: 'presentation', label: 'Presentation produit' },
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
      const prompt = `Redige une ${typeName} pour le client "${nomClient || '[Nom du client]'}".
Objet : ${objet || '[Non precise]'}
Points cles a aborder :
${pointsCles || '[Aucun point cle specifie]'}
Ton souhaite : ${ton}

La lettre doit etre professionnelle, datee du jour, avec en-tete Entasis Conseil et signature du conseiller. Format complet pret a envoyer.`

      const system = `Tu es un assistant redactionnel pour Entasis Conseil, cabinet de gestion de patrimoine.
Tu rediges des courriers et documents professionnels conformes aux standards du metier de CGP.
Utilise un francais impeccable et adapte le registre au ton demande.
En-tete : Entasis Conseil — Cabinet de Gestion de Patrimoine
Mentions legales : CIF enregistre sous le n XXXXXX — ORIAS n XXXXXX
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

        <Field label="Nom du client" value={nomClient} onChange={setNomClient} type="text" placeholder="M. / Mme ..." />
        <div style={{ height: 14 }} />
        <Field label="Objet" value={objet} onChange={setObjet} type="text" placeholder="Objet du courrier..." />
        <div style={{ height: 14 }} />
        <Field label="Points cles a aborder" value={pointsCles} onChange={setPointsCles} type="textarea" placeholder="- Point 1&#10;- Point 2&#10;- Point 3" />
        <div style={{ height: 14 }} />

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontFamily: FONT_SANS }}>Ton</div>
          <PillSelect options={TONES} value={ton} onChange={setTon} />
        </div>

        <Btn onClick={handleGenerate} disabled={loading}>{loading ? 'Generation en cours...' : 'Generer la lettre (IA)'}</Btn>
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
              <Btn onClick={handleCopy} variant={copied ? 'outline' : 'gold'}>{copied ? '--- Copie' : 'Copier'}</Btn>
              <Btn onClick={handleDownload} variant="outline">Telecharger .txt</Btn>
              <Btn onClick={handleGenerate} variant="ghost" disabled={loading}>Regenerer</Btn>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 300, background: C.card, borderRadius: 10, border: `1px dashed ${C.bdGold}` }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.3 }}>*</div>
              <div style={{ fontSize: 13, color: C.ivoryDim }}>Remplissez le formulaire et cliquez sur</div>
              <div style={{ fontSize: 13, color: C.gold, fontWeight: 600 }}>"Generer la lettre"</div>
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
  { id: 'per', label: 'Simulateur PER' },
  { id: 'av', label: 'Assurance Vie' },
  { id: 'scpi', label: 'SCPI Wemo One' },
  { id: 'immo', label: 'Achat Immo Neuf' },
  { id: 'lettre', label: 'Generateur Lettre' },
]

const TAB_COMPONENTS = {
  per: SimulateurPER,
  av: SimulateurAssuranceVie,
  scpi: SimulateurSCPI,
  immo: SimulateurImmoNeuf,
  lettre: GenerateurLettre,
}

export default function OutilsCGP() {
  const [activeTab, setActiveTab] = useState('per')
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
