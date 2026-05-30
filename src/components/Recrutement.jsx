// src/components/Recrutement.jsx
// Module Recrutement complet — kanban candidatures + KPIs + fiches détail.
//
// Demandé par Louis 28/05/2026, "je veux un truc de ouf cet onglet".
//
// Architecture,
//   • Source primaire, BDD CRM (recruitment_candidates)
//   • Source secondaire (à venir), Tally API (sync auto via Lead Room)
//   • Manager-only (RLS)
//   • Drag & drop entre colonnes du kanban
//   • Modale détail avec timeline d'actions

import { useEffect, useMemo, useState } from 'react'
import * as recrutementService from '../services/recrutement'

const { STATUS_LABELS, PIPELINE_STATUSES, SOURCE_LABELS } = recrutementService

const TALLY_WORKSPACE = 'https://tally.so/workspaces/wolq6x'

const fmtDate = (iso, opts = {}) => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short', year: opts.full ? 'numeric' : '2-digit', ...opts,
    })
  } catch { return iso }
}
const daysAgo = (iso) => {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

export default function Recrutement() {
  const [candidates, setCandidates] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [includeRejected, setIncludeRejected] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [dragOverStatus, setDragOverStatus] = useState(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [list, statsData] = await Promise.all([
        recrutementService.list({ includeRejected, search }),
        recrutementService.getStats(),
      ])
      setCandidates(list)
      setStats(statsData)
    } catch (e) {
      setError(e.message || 'Erreur de chargement (la table existe-t-elle ? colle la migration SQL dans Supabase SQL Editor)')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { refresh() }, [includeRejected])
  useEffect(() => {
    const t = setTimeout(refresh, 300)
    return () => clearTimeout(t)
  }, [search])

  // Group by status pour le kanban
  const byStatus = useMemo(() => {
    const map = {}
    for (const status of PIPELINE_STATUSES) map[status] = []
    for (const c of candidates) {
      if (PIPELINE_STATUSES.includes(c.status)) {
        map[c.status].push(c)
      }
    }
    return map
  }, [candidates])

  const rejectedList = useMemo(
    () => candidates.filter(c => c.status === 'rejected'),
    [candidates]
  )

  async function handleDrop(targetStatus, candidateId) {
    setDragOverStatus(null)
    setDraggingId(null)
    if (!candidateId) return
    const candidate = candidates.find(c => c.id === candidateId)
    if (!candidate || candidate.status === targetStatus) return
    // Optimistic update
    setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, status: targetStatus, last_action_at: new Date().toISOString() } : c))
    try {
      await recrutementService.setStatus(candidateId, targetStatus)
      // Refresh stats only (la liste est déjà à jour optimistic)
      const statsData = await recrutementService.getStats()
      setStats(statsData)
    } catch (e) {
      alert(`Impossible de changer le statut, ${e.message}`)
      refresh()
    }
  }

  return (
    <div>
      <div className="section-header mb-24">
        <div>
          <div className="section-kicker">Acquisition talents · pilotage</div>
          <div className="section-title">Recrutement 🎯</div>
          <div className="section-sub">
            {stats ? `${stats.total} candidat${stats.total > 1 ? 's' : ''} total · ${stats.last30days} sur 30j` : 'Chargement…'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="🔍 Rechercher (nom, email, poste)…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="search-input"
            style={{ maxWidth: 240 }}
          />
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary btn-sm">
            + Nouveau candidat
          </button>
          <button onClick={() => setShowSettings(true)} className="btn btn-ghost btn-sm" title="Source des données">
            ⚙
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 16, background: 'rgba(239,68,68,0.08)', color: '#EF4444', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          ⚠ {error}
        </div>
      )}

      {/* ─── KPIs cabinet ───────────────────────────────────────── */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
          <KpiCard label="Candidatures (30j)" value={stats.last30days} color="#6366F1" icon="📥" />
          <KpiCard label="En entretien" value={(stats.byStatus.interview_rh || 0) + (stats.byStatus.interview_dir || 0)} color="#10B981" icon="🤝" />
          <KpiCard label="Propositions" value={stats.byStatus.offered || 0} color="#C5A55A" icon="✉" />
          <KpiCard label="Embauchés total" value={stats.byStatus.hired || 0} color="#059669" icon="🎉" />
          <KpiCard label="Refusés" value={stats.byStatus.rejected || 0} color="#6B7280" icon="✗" />
        </div>
      )}

      {/* ─── Kanban ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, marginBottom: 24 }}>
        {PIPELINE_STATUSES.map(status => {
          const info = STATUS_LABELS[status]
          const items = byStatus[status] || []
          const isOver = dragOverStatus === status
          return (
            <div key={status}
              onDragOver={e => { e.preventDefault(); setDragOverStatus(status) }}
              onDragLeave={() => setDragOverStatus(null)}
              onDrop={e => { e.preventDefault(); handleDrop(status, draggingId) }}
              style={{
                minWidth: 260, flex: '1 1 260px',
                background: isOver ? `${info.color}15` : 'var(--bg)',
                borderRadius: 'var(--rad)',
                border: `2px ${isOver ? 'dashed' : 'solid'} ${isOver ? info.color : 'var(--bd)'}`,
                padding: 10,
                transition: 'all 0.15s',
              }}>
              {/* Header colonne */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 4px', marginBottom: 8,
                borderBottom: `2px solid ${info.color}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{info.emoji}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: info.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {info.label}
                  </span>
                </div>
                <span style={{
                  padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: `${info.color}20`, color: info.color,
                }}>
                  {items.length}
                </span>
              </div>

              {/* Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 100 }}>
                {items.map(c => (
                  <CandidateCard key={c.id} candidate={c}
                    onSelect={() => setSelectedCandidate(c)}
                    onDragStart={() => setDraggingId(c.id)}
                    onDragEnd={() => setDraggingId(null)}
                    isDragging={draggingId === c.id}
                  />
                ))}
                {items.length === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--t3)', fontSize: 11, fontStyle: 'italic' }}>
                    Aucun candidat
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ─── Toggle refusés ─────────────────────────────────────── */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => setIncludeRejected(v => !v)} className="btn btn-ghost btn-sm">
          {includeRejected ? '✕ Masquer' : '👁 Voir'} les refusés ({rejectedList.length})
        </button>
        {!loading && candidates.length === 0 && !error && (
          <span style={{ fontSize: 12, color: 'var(--t3)' }}>
            Aucun candidat — ajoute-en un manuellement ou attends la sync Tally.
          </span>
        )}
      </div>

      {includeRejected && rejectedList.length > 0 && (
        <div className="card" style={{ marginBottom: 24, borderTop: '3px solid #6B7280' }}>
          <div className="panel-head">
            <div>
              <div className="section-kicker">Archive refusés</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>{rejectedList.length} refusé(s)</div>
            </div>
          </div>
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Candidat</th>
                <th>Poste</th>
                <th>Raison</th>
                <th>Refusé le</th>
              </tr>
            </thead>
            <tbody>
              {rejectedList.map(c => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedCandidate(c)}>
                  <td>
                    <div className="cell-primary">{c.full_name}</div>
                    <div className="cell-sub" style={{ fontSize: 11 }}>{c.email || ''}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{c.position || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--t2)' }}>{c.rejection_reason || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--t3)' }}>{fmtDate(c.updated_at, { full: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Modales ─────────────────────────────────────────────── */}
      {showAddModal && (
        <AddCandidateModal onClose={() => setShowAddModal(false)} onCreated={() => { setShowAddModal(false); refresh() }} />
      )}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
      {selectedCandidate && (
        <CandidateDetailModal
          candidate={selectedCandidate}
          onClose={() => setSelectedCandidate(null)}
          onUpdated={() => { refresh() }}
          onDeleted={() => { setSelectedCandidate(null); refresh() }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// CandidateCard — Carte d'un candidat dans le kanban
// ─────────────────────────────────────────────────────────────────────────
function CandidateCard({ candidate, onSelect, onDragStart, onDragEnd, isDragging }) {
  const sourceInfo = SOURCE_LABELS[candidate.source] || SOURCE_LABELS.manuel
  const age = daysAgo(candidate.applied_at)
  const initials = (candidate.full_name || '?')
    .split(/\s+/).map(s => s[0] || '').slice(0, 2).join('').toUpperCase()
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      style={{
        background: 'white',
        borderRadius: 8,
        padding: 10,
        boxShadow: isDragging ? '0 8px 20px rgba(0,0,0,0.15)' : '0 1px 2px rgba(0,0,0,0.04)',
        border: '1px solid var(--bd)',
        cursor: 'grab',
        opacity: isDragging ? 0.5 : 1,
        transition: 'box-shadow 0.15s, transform 0.15s',
        transform: isDragging ? 'scale(0.95) rotate(2deg)' : 'none',
      }}
      onMouseEnter={e => { if (!isDragging) e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)' }}
      onMouseLeave={e => { if (!isDragging) e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: `linear-gradient(135deg, ${sourceInfo.color} 0%, ${sourceInfo.color}99 100%)`,
          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 11, flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {candidate.full_name}
          </div>
          {candidate.position && (
            <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2, fontWeight: 500 }}>
              {candidate.position}
            </div>
          )}
          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{
              padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700,
              background: `${sourceInfo.color}20`, color: sourceInfo.color, letterSpacing: '0.03em',
            }} title={sourceInfo.label}>
              {sourceInfo.label.toUpperCase()}
            </span>
            {age != null && (
              <span style={{ fontSize: 10, color: 'var(--t3)' }}>
                J+{age}
              </span>
            )}
            {candidate.score > 0 && (
              <span style={{ fontSize: 10, color: '#F59E0B', fontWeight: 700, marginLeft: 'auto' }}>
                ★ {candidate.score}/10
              </span>
            )}
          </div>
          {(candidate.tags || []).slice(0, 3).map(t => (
            <span key={t} style={{
              display: 'inline-block', padding: '0 5px', borderRadius: 3, fontSize: 9, fontWeight: 600,
              background: 'rgba(0,0,0,0.06)', color: 'var(--t2)', marginRight: 3, marginTop: 4,
            }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// KpiCard — Mini KPI cabinet en haut
// ─────────────────────────────────────────────────────────────────────────
function KpiCard({ label, value, color, icon }) {
  return (
    <div className="card" style={{ padding: '14px 16px', borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// AddCandidateModal — Saisie manuelle d'un candidat
// ─────────────────────────────────────────────────────────────────────────
function AddCandidateModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', position: '',
    source: 'manuel', status: 'received',
    cv_url: '', linkedin_url: '', notes: '',
  })
  const [saving, setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!form.full_name.trim()) { alert('Nom requis'); return }
    setSaving(true)
    try {
      await recrutementService.create(form)
      onCreated()
    } catch (e) {
      alert(`Erreur, ${e.message}`)
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className="modal-head">
          <div>
            <div className="modal-title">+ Nouveau candidat</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>Saisie manuelle (hors Tally)</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        <form onSubmit={submit} className="modal-body" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="form-label">Nom complet *</label>
            <input className="form-input" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Téléphone</label>
              <input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="form-label">Poste visé</label>
            <input className="form-input" value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} placeholder="ex. Conseiller patrimonial CDI" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="form-label">Source</label>
              <select className="form-select" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
                {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Étape</label>
              <select className="form-select" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {PIPELINE_STATUSES.map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s].label}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="form-label">URL CV</label>
              <input className="form-input" value={form.cv_url} onChange={e => setForm({ ...form, cv_url: e.target.value })} placeholder="https://…" />
            </div>
            <div>
              <label className="form-label">LinkedIn</label>
              <input className="form-input" value={form.linkedin_url} onChange={e => setForm({ ...form, linkedin_url: e.target.value })} placeholder="https://linkedin.com/in/…" />
            </div>
          </div>
          <div>
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Création…' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// CandidateDetailModal — Vue complète d'un candidat avec timeline
// ─────────────────────────────────────────────────────────────────────────
function CandidateDetailModal({ candidate: initial, onClose, onUpdated, onDeleted }) {
  const [candidate, setCandidate] = useState(initial)
  const [actions, setActions] = useState([])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial)
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  async function reload() {
    try {
      const { candidate: fresh, actions: acts } = await recrutementService.getWithTimeline(initial.id)
      setCandidate(fresh)
      setActions(acts)
    } catch (e) {
      console.error(e)
    }
  }
  useEffect(() => { reload() }, [initial.id])

  async function saveDraft() {
    setSaving(true)
    try {
      const updated = await recrutementService.update(candidate.id, {
        full_name: draft.full_name,
        email: draft.email,
        phone: draft.phone,
        position: draft.position,
        score: Number(draft.score) || 0,
        cv_url: draft.cv_url,
        linkedin_url: draft.linkedin_url,
        notes: draft.notes,
      })
      setCandidate(updated)
      setEditing(false)
      reload()
      onUpdated()
    } catch (e) {
      alert(`Erreur, ${e.message}`)
    } finally { setSaving(false) }
  }

  async function saveNote() {
    if (!newNote.trim()) return
    setSaving(true)
    try {
      await recrutementService.addNote(candidate.id, newNote.trim())
      setNewNote('')
      reload()
      onUpdated()
    } catch (e) {
      alert(`Erreur, ${e.message}`)
    } finally { setSaving(false) }
  }

  async function changeStatus(s) {
    try {
      const u = await recrutementService.setStatus(candidate.id, s)
      setCandidate(u)
      reload()
      onUpdated()
    } catch (e) {
      alert(`Erreur, ${e.message}`)
    }
  }

  async function doReject() {
    if (!rejectReason.trim()) { alert('Indique une raison'); return }
    try {
      await recrutementService.reject(candidate.id, rejectReason.trim())
      setRejecting(false)
      onDeleted()
    } catch (e) {
      alert(`Erreur, ${e.message}`)
    }
  }

  const sourceInfo = SOURCE_LABELS[candidate.source] || SOURCE_LABELS.manuel
  const statusInfo = STATUS_LABELS[candidate.status] || STATUS_LABELS.received

  return (
    <div className="modal-overlay" onClick={onClose} style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 900, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-head" style={{ position: 'sticky', top: 0, background: 'white', zIndex: 10, borderBottom: `2px solid ${statusInfo.color}` }}>
          <div>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: `linear-gradient(135deg, ${sourceInfo.color} 0%, ${sourceInfo.color}99 100%)`,
                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 16,
              }}>
                {(candidate.full_name || '?').split(/\s+/).map(s => s[0] || '').slice(0, 2).join('').toUpperCase()}
              </div>
              <div>
                <div>{candidate.full_name}</div>
                <div style={{ fontSize: 12, color: 'var(--t3)', fontWeight: 400 }}>
                  {candidate.position || 'Poste non précisé'} · {sourceInfo.label} · Postulé le {fmtDate(candidate.applied_at, { full: true })}
                </div>
              </div>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ padding: 20 }}>
          {/* Pipeline visuel — étapes cliquables pour changer */}
          <div className="card" style={{ marginBottom: 20, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              Étape · clique pour changer
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PIPELINE_STATUSES.map(s => {
                const info = STATUS_LABELS[s]
                const isActive = candidate.status === s
                return (
                  <button key={s}
                    onClick={() => changeStatus(s)}
                    style={{
                      padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                      background: isActive ? info.color : `${info.color}15`,
                      color: isActive ? 'white' : info.color,
                      border: `1px solid ${isActive ? info.color : 'transparent'}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}>
                    {info.emoji} {info.label}
                  </button>
                )
              })}
              <button onClick={() => setRejecting(true)}
                style={{
                  padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                  background: 'rgba(239,68,68,0.10)', color: '#EF4444', border: 'none', cursor: 'pointer', marginLeft: 'auto',
                }}>
                ✗ Refuser
              </button>
            </div>
            {rejecting && (
              <div style={{ marginTop: 12, padding: 12, background: 'rgba(239,68,68,0.05)', borderRadius: 8 }}>
                <label className="form-label">Raison du refus</label>
                <input className="form-input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="ex. Profil junior, manque d'expérience patrimoniale" />
                <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setRejecting(false)}>Annuler</button>
                  <button className="btn btn-sm" style={{ background: '#EF4444', color: 'white' }} onClick={doReject}>Confirmer le refus</button>
                </div>
              </div>
            )}
          </div>

          {/* Infos + édition */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div className="section-kicker">Coordonnées & infos</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => editing ? setEditing(false) : (setDraft(candidate), setEditing(true))}>
                {editing ? '✕ Annuler' : '✎ Éditer'}
              </button>
            </div>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {!editing ? (
                <>
                  <InfoLine label="Email" value={candidate.email} link={candidate.email && `mailto:${candidate.email}`} />
                  <InfoLine label="Téléphone" value={candidate.phone} link={candidate.phone && `tel:${candidate.phone}`} />
                  <InfoLine label="Poste visé" value={candidate.position} />
                  <InfoLine label="Score" value={candidate.score ? `★ ${candidate.score}/10` : '—'} />
                  <InfoLine label="CV" value={candidate.cv_url ? '📎 Ouvrir' : '—'} link={candidate.cv_url} />
                  <InfoLine label="LinkedIn" value={candidate.linkedin_url ? '🔗 Profil' : '—'} link={candidate.linkedin_url} />
                </>
              ) : (
                <>
                  <EditField label="Nom complet" value={draft.full_name} onChange={v => setDraft({ ...draft, full_name: v })} />
                  <EditField label="Score (0-10)" type="number" value={draft.score} onChange={v => setDraft({ ...draft, score: v })} />
                  <EditField label="Email" type="email" value={draft.email} onChange={v => setDraft({ ...draft, email: v })} />
                  <EditField label="Téléphone" value={draft.phone} onChange={v => setDraft({ ...draft, phone: v })} />
                  <EditField label="Poste visé" value={draft.position} onChange={v => setDraft({ ...draft, position: v })} />
                  <div />
                  <EditField label="URL CV" value={draft.cv_url} onChange={v => setDraft({ ...draft, cv_url: v })} />
                  <EditField label="LinkedIn" value={draft.linkedin_url} onChange={v => setDraft({ ...draft, linkedin_url: v })} />
                </>
              )}
            </div>
            {editing && (
              <div style={{ padding: 12, borderTop: '1px solid var(--bd)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={saveDraft} disabled={saving}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            )}
          </div>

          {/* Notes manager */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="panel-head">
              <div>
                <div className="section-kicker">Notes manager</div>
                <div style={{ fontSize: 12, color: 'var(--t3)' }}>Impressions, points à creuser, références…</div>
              </div>
            </div>
            <div style={{ padding: 16 }}>
              {candidate.notes && (
                <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 8, marginBottom: 12, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {candidate.notes}
                </div>
              )}
              <textarea className="form-input" rows={3} value={newNote} onChange={e => setNewNote(e.target.value)}
                placeholder={candidate.notes ? 'Ajouter / modifier les notes…' : 'Première impression…'} />
              <div style={{ marginTop: 8, textAlign: 'right' }}>
                <button className="btn btn-sm btn-primary" onClick={saveNote} disabled={!newNote.trim() || saving}>
                  💾 Enregistrer
                </button>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="card">
            <div className="panel-head">
              <div className="section-kicker">📋 Timeline</div>
            </div>
            <div style={{ padding: 16 }}>
              {actions.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--t3)', fontSize: 12, padding: 16 }}>
                  Aucune action enregistrée.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {actions.map(a => (
                    <TimelineItem key={a.id} action={a} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoLine({ label, value, link }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--t1)', marginTop: 4 }}>
        {link ? <a href={link} target="_blank" rel="noreferrer" style={{ color: 'var(--gold-dk, #A6843F)', textDecoration: 'none', fontWeight: 600 }}>{value}</a> : (value || '—')}
      </div>
    </div>
  )
}

function EditField({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="form-label" style={{ fontSize: 10 }}>{label}</label>
      <input className="form-input" type={type} value={value || ''} onChange={e => onChange(e.target.value)} style={{ fontSize: 13 }} />
    </div>
  )
}

function TimelineItem({ action }) {
  const ACTION_INFO = {
    status_change: { emoji: '🔄', label: (p) => `Étape, ${STATUS_LABELS[p.from]?.label || p.from} → ${STATUS_LABELS[p.to]?.label || p.to}` },
    note_added:    { emoji: '📝', label: (p) => `Note, "${(p.text || '').slice(0, 60)}…"` },
    rejected:      { emoji: '✗', label: (p) => `Refusé (${p.reason || 'sans raison'})` },
    hired:         { emoji: '🎉', label: () => `Embauché` },
    email_sent:    { emoji: '✉', label: (p) => `Email envoyé, "${p.subject || ''}"` },
    interview_scheduled: { emoji: '📅', label: (p) => `Entretien programmé le ${fmtDate(p.date)}` },
  }
  const info = ACTION_INFO[action.action_type] || { emoji: '•', label: () => action.action_type }
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
      <div style={{ fontSize: 14 }}>{info.emoji}</div>
      <div style={{ flex: 1 }}>
        <div style={{ color: 'var(--t1)', fontWeight: 500 }}>{info.label(action.payload || {})}</div>
        <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>{fmtDate(action.created_at, { full: true })}</div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// SettingsModal — Configuration source Tally
// ─────────────────────────────────────────────────────────────────────────
function SettingsModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose} style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-head">
          <div>
            <div className="modal-title">⚙ Sources & paramètres</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ padding: 20 }}>
          <div className="card" style={{ padding: 16, marginBottom: 16, borderTop: '3px solid #6366F1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#6366F1', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>T</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Workspace Tally</div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>wolq6x</div>
              </div>
              <a href={TALLY_WORKSPACE} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>
                Ouvrir ↗
              </a>
            </div>
            <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.6 }}>
              Pour synchroniser automatiquement les soumissions Tally dans ce kanban,
              <ol style={{ marginTop: 8, paddingLeft: 18, color: 'var(--t2)' }}>
                <li>Va dans <strong>Tally → Settings → API tokens</strong></li>
                <li>Crée un token avec lecture sur le workspace wolq6x</li>
                <li>Envoie-le moi (Louis), je l'ajoute en variable d'environnement</li>
                <li>Un cron va alors importer les nouvelles candidatures toutes les 15 min</li>
              </ol>
            </div>
          </div>
          <div style={{ padding: 12, background: 'rgba(99,102,241,0.06)', borderRadius: 8, fontSize: 12, color: 'var(--t2)' }}>
            💡 En attendant la sync auto, tu peux <strong>ajouter manuellement</strong> les candidats avec le bouton "+ Nouveau candidat".
          </div>
        </div>
      </div>
    </div>
  )
}
