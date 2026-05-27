// ═══════════════════════════════════════════════════════════════════════════
// PILOTAGE RH — Module manager-only
// Édition des contrats des conseillers : type, salaire brut, paliers PP/PU,
// dates de début/fin, statut actif/inactif.
//
// CONFIDENTIALITÉ STRICTE
//   Composant rendu UNIQUEMENT si profile.role === 'manager'.
//   Les RLS Supabase doublent cette garde côté serveur.
//
// Doc canonique : src/lib/bareme-entasis.js
// Migration BDD : supabase/migrations/20260525130000_conseiller_contrats.sql
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import * as service from '../services/conseillerContrats'
import * as profilesService from '../services/profiles'
import { impersonate } from '../services/impersonation'
import { TYPES_CONTRAT, LIBELLE_TYPE_CONTRAT } from '../lib/bareme-entasis'

const fmtEur = (v) => Number(v || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—')

const TYPE_COLORS = {
  GERANT:     { bg: 'var(--gold-soft, rgba(201,169,97,0.12))', fg: 'var(--gold-dk, #A6843F)' },
  CDI:        { bg: 'rgba(0,113,227,0.10)',                    fg: '#0071E3' },
  CDD:        { bg: 'rgba(0,113,227,0.10)',                    fg: '#0071E3' },
  ALTERNANT:  { bg: 'rgba(52,199,89,0.10)',                    fg: '#1F8B3B' },
  STAGIAIRE:  { bg: 'rgba(255,149,0,0.10)',                    fg: '#B36B00' },
  MANDATAIRE: { bg: 'rgba(0,0,0,0.04)',                        fg: 'var(--t2)' },
}

const EMPTY_CONTRAT = {
  matricule: '',
  full_name: '',
  type_contrat: 'CDI',
  salaire_brut_mensuel: 0,
  palier_pp_mensuel: 0,
  palier_pu_mensuel: 0,
  date_debut: new Date().toISOString().slice(0, 10),
  date_fin: null,
  actif: true,
  notes: '',
}

export default function PilotageRH() {
  const [contrats, setContrats] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)   // contrat en cours d'édition (modale)
  const [creating, setCreating] = useState(false)
  const [prefillProfile, setPrefillProfile] = useState(null)
  const [filterType, setFilterType] = useState('all')
  const [filterActif, setFilterActif] = useState('actifs')
  const [search, setSearch] = useState('')

  const reload = async () => {
    setLoading(true)
    try {
      const [data, prof] = await Promise.all([
        service.list(),
        profilesService.listTeam().catch(() => []),
      ])
      setContrats(data)
      setProfiles(prof)
    } catch (e) {
      toast.error('Erreur de chargement : ' + (e.message || ''))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  // Helper : normalisation de nom pour matching (insensible casse / accents /
  // tirets / apostrophes). "Nans MARRO-DUZAT" === "Nans Marro Duzat" ===
  // "nans marro-duzat", etc. Critique pour le matching des profils orphelins
  // où le format du nom diffère entre profiles.full_name et
  // conseiller_contrats.full_name.
  const normNom = (s) => (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // sans accents
    .replace(/[-–—_'.]/g, ' ')                          // tirets/apostrophes → espace
    .replace(/\s+/g, ' ').trim()

  // Profils Supabase non encore reliés à un contrat.
  // Pour chacun, on cherche un contrat existant sans profile_id qui matche
  // par nom (ou par matricule = advisor_code). Si trouvé → on propose
  // "Lier au contrat existant" au lieu de "+ Créer son contrat".
  // Permet de rattraper les contrats seedés sans profile_id.
  const profilsOrphelins = useMemo(() => {
    const linkedIds = new Set(contrats.map(c => c.profile_id).filter(Boolean))
    const contratsLibres = contrats.filter(c => !c.profile_id)
    return profiles
      .filter(p => p.is_active && !linkedIds.has(p.id))
      .map(p => {
        const contratExistant = contratsLibres.find(c =>
          normNom(c.full_name) === normNom(p.full_name) ||
          (p.advisor_code && c.matricule && p.advisor_code.toUpperCase() === c.matricule.toUpperCase())
        )
        return { ...p, contratExistant }
      })
      .sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''))
  }, [profiles, contrats])

  // Liaisons automatiques possibles (profil ↔ contrat existant)
  const liaisonsPossibles = profilsOrphelins.filter(p => p.contratExistant)

  const handleLierAuContrat = async (profilId, contratId) => {
    try {
      await service.update(contratId, { profile_id: profilId })
      toast.success('Contrat lié')
      reload()
    } catch (e) {
      toast.error('Erreur : ' + (e.message || ''))
    }
  }

  const handleLierTous = async () => {
    if (liaisonsPossibles.length === 0) return
    if (!confirm(`Lier automatiquement ${liaisonsPossibles.length} contrat(s) existant(s) à leur profil ? Les contrats sont matchés par nom ou code.`)) return
    let ok = 0
    for (const p of liaisonsPossibles) {
      try {
        await service.update(p.contratExistant.id, { profile_id: p.id })
        ok++
      } catch (e) {
        console.error('[PilotageRH] lier tous', e)
      }
    }
    toast.success(`${ok}/${liaisonsPossibles.length} contrat(s) liés`)
    reload()
  }

  const filtered = useMemo(() => {
    return contrats.filter(c => {
      if (filterType !== 'all' && c.type_contrat !== filterType) return false
      if (filterActif === 'actifs' && !c.actif) return false
      if (filterActif === 'inactifs' && c.actif) return false
      if (search) {
        const s = search.toLowerCase()
        if (!(c.full_name || '').toLowerCase().includes(s) &&
            !(c.matricule || '').toLowerCase().includes(s)) return false
      }
      return true
    })
  }, [contrats, filterType, filterActif, search])

  const stats = useMemo(() => {
    const actifs = contrats.filter(c => c.actif)
    return {
      total: actifs.length,
      cdi: actifs.filter(c => c.type_contrat === 'CDI').length,
      cdd: actifs.filter(c => c.type_contrat === 'CDD').length,
      alternants: actifs.filter(c => c.type_contrat === 'ALTERNANT').length,
      stagiaires: actifs.filter(c => c.type_contrat === 'STAGIAIRE').length,
      mandataires: actifs.filter(c => c.type_contrat === 'MANDATAIRE').length,
      masseSalarialeMensuelle: actifs.reduce((sum, c) => sum + Number(c.salaire_brut_mensuel || 0), 0),
    }
  }, [contrats])

  const handleSave = async (payload) => {
    try {
      if (payload.id) {
        await service.update(payload.id, payload)
        toast.success('Contrat mis à jour')
      } else {
        await service.create(payload)
        toast.success('Contrat créé')
      }
      setEditing(null)
      setCreating(false)
      reload()
    } catch (e) {
      toast.error('Erreur : ' + (e.message || ''))
    }
  }

  const handleToggleActif = async (contrat) => {
    if (!confirm(`${contrat.actif ? 'Désactiver' : 'Réactiver'} le contrat de ${contrat.full_name} ?`)) return
    try {
      await service.setActif(contrat.id, !contrat.actif)
      toast.success(contrat.actif ? 'Contrat désactivé' : 'Contrat réactivé')
      reload()
    } catch (e) {
      toast.error('Erreur : ' + (e.message || ''))
    }
  }

  // Impersonation : génère un magic link et ouvre la session du conseiller
  // ciblé dans un nouvel onglet. Tout est audité côté serveur.
  const handleImpersonate = async (contrat) => {
    if (!contrat.profile_id) {
      toast.error('Aucun profil Supabase lié — impossible d\'impersonner')
      return
    }
    const reason = prompt(
      `Se connecter en tant que ${contrat.full_name} ?\n\n` +
      `L'action sera journalisée dans audit_impersonation.\n` +
      `Raison (optionnelle) :`,
      ''
    )
    if (reason === null) return  // Annulé
    const toastId = toast.loading('Génération du lien…')
    try {
      const { link, target } = await impersonate(contrat.profile_id, reason)
      toast.success(`Connecté en tant que ${target.full_name || target.email}`, { id: toastId })
      // Ouvre dans un onglet de navigation privée idéalement, mais le browser
      // ne permet pas de forcer ça en JS → on ouvre dans un nouvel onglet
      // et on prévient l'utilisateur.
      window.open(link, '_blank', 'noopener,noreferrer')
    } catch (e) {
      toast.error('Erreur : ' + (e.message || ''), { id: toastId })
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="section-header">
        <div>
          <div className="section-kicker">Module manager · Confidentiel</div>
          <div className="section-title">Pilotage RH</div>
          <div className="section-sub">Contrats, salaires, paliers de commission par conseiller. Les conseillers n'ont accès qu'à leur propre ligne.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Nouveau contrat</button>
      </div>

      {/* KPIs */}
      <div className="kpi-grid mb-24">
        <div className="kpi-card kpi-card-blue">
          <div className="kpi-label">Effectif actif</div>
          <div className="kpi-value">{stats.total}</div>
          <div className="kpi-hint">{stats.cdi} CDI · {stats.cdd} CDD · {stats.alternants} alt. · {stats.stagiaires} stag. · {stats.mandataires} mand.</div>
        </div>
        <div className="kpi-card kpi-card-gold">
          <div className="kpi-label">Masse salariale brute / mois</div>
          <div className="kpi-value">{fmtEur(stats.masseSalarialeMensuelle)}</div>
          <div className="kpi-hint">Hors charges patronales et variables</div>
        </div>
        <div className="kpi-card kpi-card-green">
          <div className="kpi-label">Masse salariale brute / an</div>
          <div className="kpi-value">{fmtEur(stats.masseSalarialeMensuelle * 12)}</div>
          <div className="kpi-hint">Sur 12 mois constants</div>
        </div>
        <div className="kpi-card kpi-card-amber">
          <div className="kpi-label">Mandataires</div>
          <div className="kpi-value">{stats.mandataires}</div>
          <div className="kpi-hint">Indépendants — facturent Entasis</div>
        </div>
      </div>

      {/* Profils Supabase sans contrat (orphelins) */}
      {profilsOrphelins.length > 0 && (
        <div className="card mb-24" style={{ borderTop: '2px solid var(--apple-orange, #FF9500)' }}>
          <div className="panel-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#FF9500' }}>
                À traiter · {profilsOrphelins.length} profil{profilsOrphelins.length !== 1 ? 's' : ''}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginTop: 4 }}>
                Profils Supabase sans contrat
              </div>
              <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
                {liaisonsPossibles.length > 0
                  ? `${liaisonsPossibles.length} profil(s) matchent un contrat existant non lié — peut être rattaché en 1 clic.`
                  : "Ces conseillers se sont inscrits via une invitation mais n'ont pas encore de contrat."}
              </div>
            </div>
            {liaisonsPossibles.length > 0 && (
              <button className="btn btn-primary btn-sm" onClick={handleLierTous}>
                ↪ Lier auto les {liaisonsPossibles.length} match{liaisonsPossibles.length !== 1 ? 's' : ''}
              </button>
            )}
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {profilsOrphelins.map(p => {
              const hasMatch = !!p.contratExistant
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: hasMatch ? 'rgba(52,199,89,0.05)' : 'rgba(0,0,0,0.025)',
                  border: `0.5px solid ${hasMatch ? 'rgba(52,199,89,0.25)' : 'var(--bd)'}`,
                  borderRadius: 12,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                      {p.full_name || '(sans nom)'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                      {p.email} · {p.advisor_code ? `Code ${p.advisor_code}` : 'Sans code'} · {p.role === 'manager' ? 'Manager' : 'Conseiller'}
                    </div>
                    {hasMatch && (
                      <div style={{ fontSize: 11, color: 'var(--signed)', marginTop: 4, fontWeight: 500 }}>
                        ✓ Contrat trouvé : {p.contratExistant.full_name}
                        {p.contratExistant.matricule ? ` (mat. ${p.contratExistant.matricule})` : ''}
                      </div>
                    )}
                  </div>
                  {hasMatch ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleLierAuContrat(p.id, p.contratExistant.id)}
                      >↪ Lier au contrat existant</button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setPrefillProfile(p)
                          setCreating(true)
                        }}
                        title="Créer un nouveau contrat (ignorer le match)"
                      >+ Créer</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {/* Dropdown de liaison manuelle pour les cas où le
                          matching auto échoue (typos, prénoms différents, etc.).
                          Louis voit tous les contrats orphelins et choisit. */}
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const contratId = e.target.value
                          if (contratId) handleLierAuContrat(p.id, contratId)
                        }}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: '0.5px solid var(--bd)',
                          background: 'rgba(0,0,0,0.04)',
                          fontSize: 12,
                          fontFamily: 'inherit',
                          color: 'var(--t1)',
                          cursor: 'pointer',
                          maxWidth: 220,
                        }}
                        title="Lier ce profil à un contrat existant sans liaison"
                      >
                        <option value="">↪ Lier à un contrat…</option>
                        {contrats
                          .filter(c => !c.profile_id && c.actif)
                          .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
                          .map(c => (
                            <option key={c.id} value={c.id}>
                              {c.full_name}{c.matricule ? ` (mat. ${c.matricule})` : ''} · {LIBELLE_TYPE_CONTRAT[c.type_contrat]}
                            </option>
                          ))}
                      </select>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          setPrefillProfile(p)
                          setCreating(true)
                        }}
                      >+ Créer</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Frise chronologique — vue d'ensemble des échéances RH */}
      <TimelineRH contrats={contrats} />

      {/* Toolbar filtres */}
      <div className="table-toolbar mb-16" style={{ marginBottom: 16 }}>
        <input className="search-input" placeholder="Rechercher un conseiller…"
               value={search} onChange={e => setSearch(e.target.value)} />
        <select className="filter-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">Tous les types</option>
          {TYPES_CONTRAT.map(t => <option key={t} value={t}>{LIBELLE_TYPE_CONTRAT[t]}</option>)}
        </select>
        <select className="filter-select" value={filterActif} onChange={e => setFilterActif(e.target.value)}>
          <option value="actifs">Actifs seulement</option>
          <option value="inactifs">Inactifs seulement</option>
          <option value="all">Tous</option>
        </select>
      </div>

      {/* Tableau */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Conseiller</th>
              <th>Type</th>
              <th style={{ textAlign: 'right' }}>Brut / mois</th>
              <th style={{ textAlign: 'right' }}>Palier PP</th>
              <th style={{ textAlign: 'right' }}>Palier PU</th>
              <th>Début</th>
              <th>Fin</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>Chargement…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="table-empty-state">
                <div className="empty-title">Aucun contrat trouvé</div>
                <div className="empty-sub">Ajuste les filtres ou ajoute un nouveau contrat</div>
              </td></tr>
            ) : filtered.map(c => {
              const col = TYPE_COLORS[c.type_contrat] || TYPE_COLORS.CDI
              return (
                <tr key={c.id} style={{ opacity: c.actif ? 1 : 0.5 }}>
                  <td>
                    <div className="cell-primary">{c.full_name}</div>
                    <div className="cell-sub">{c.matricule ? `Mat. ${c.matricule}` : 'Sans matricule'}</div>
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-flex', padding: '3px 10px', borderRadius: 999,
                      fontSize: 11, fontWeight: 600, letterSpacing: '-0.005em',
                      background: col.bg, color: col.fg,
                    }}>
                      {LIBELLE_TYPE_CONTRAT[c.type_contrat] || c.type_contrat}
                    </span>
                  </td>
                  <td className="cell-mono" style={{ textAlign: 'right' }}>{fmtEur(c.salaire_brut_mensuel)}</td>
                  <td className="cell-mono" style={{ textAlign: 'right' }}>{c.palier_pp_mensuel > 0 ? fmtEur(c.palier_pp_mensuel) : '—'}</td>
                  <td className="cell-mono" style={{ textAlign: 'right' }}>{c.palier_pu_mensuel > 0 ? fmtEur(c.palier_pu_mensuel) : '—'}</td>
                  <td>{fmtDate(c.date_debut)}</td>
                  <td>{fmtDate(c.date_fin)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                      {c.profile_id && c.actif && c.type_contrat !== 'GERANT' && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleImpersonate(c)}
                          title="Se connecter en tant que ce conseiller (action auditée)"
                        >👤 Voir en tant que</button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(c)}>Éditer</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleToggleActif(c)}>
                        {c.actif ? 'Désactiver' : 'Réactiver'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modale d'édition / création */}
      {(editing || creating) && (
        <ContratModal
          contrat={
            editing
              ? editing
              : prefillProfile
                ? {
                    ...EMPTY_CONTRAT,
                    profile_id: prefillProfile.id,
                    full_name: prefillProfile.full_name || '',
                    matricule: prefillProfile.advisor_code || '',
                  }
                : { ...EMPTY_CONTRAT }
          }
          profiles={profiles}
          contratsExistants={contrats}
          onClose={() => { setEditing(null); setCreating(false); setPrefillProfile(null) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Modale d'édition / création de contrat
// ─────────────────────────────────────────────────────────────────────────
function ContratModal({ contrat, profiles = [], contratsExistants = [], onClose, onSave }) {
  const [form, setForm] = useState(contrat)
  const isNew = !contrat.id

  const handleChange = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  // Profils disponibles pour la liaison : actifs + non liés ailleurs (sauf
  // celui qu'on est en train d'éditer s'il était déjà lié).
  const profilsLies = useMemo(() => {
    const lies = new Set(
      contratsExistants
        .filter(c => c.id !== contrat.id && c.profile_id)
        .map(c => c.profile_id)
    )
    return profiles.filter(p => p.is_active && !lies.has(p.id))
  }, [profiles, contratsExistants, contrat.id])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.full_name?.trim()) return toast.error('Nom requis')
    if (!form.type_contrat) return toast.error('Type de contrat requis')
    if (!form.date_debut) return toast.error('Date de début requise')
    onSave(form)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="modal-head">
            <div>
              <div className="modal-title">{isNew ? 'Nouveau contrat' : `Éditer · ${contrat.full_name}`}</div>
              <div className="modal-subtitle">Confidentiel — données salariales</div>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>

          <div className="modal-body">
            {/* Profil Supabase lié — clé pour que le conseiller voie sa
                ligne via les RLS et que les deals soient correctement
                rattachés (advisor_code). */}
            <div className="form-group">
              <label className="form-label">Profil Supabase lié</label>
              <select
                className="form-select"
                value={form.profile_id || ''}
                onChange={e => {
                  const id = e.target.value || null
                  const p = profilsLies.find(x => x.id === id)
                  setForm(prev => ({
                    ...prev,
                    profile_id: id,
                    // Pré-remplit nom + matricule si vides et qu'on lie
                    full_name: prev.full_name || (p?.full_name || ''),
                    matricule: prev.matricule || (p?.advisor_code || ''),
                  }))
                }}
              >
                <option value="">— Aucun (contrat orphelin) —</option>
                {profilsLies.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || '(sans nom)'} · {p.email} {p.advisor_code ? `· ${p.advisor_code}` : ''}
                  </option>
                ))}
              </select>
              <div className="form-hint">
                Sans lien, le conseiller ne pourra pas voir sa rémunération côté CRM (RLS).
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Nom complet</label>
                <input className="form-input" value={form.full_name || ''}
                       onChange={e => handleChange('full_name', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Matricule</label>
                <input className="form-input" value={form.matricule || ''}
                       onChange={e => handleChange('matricule', e.target.value)}
                       placeholder="00009…" />
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Type de contrat</label>
                <select className="form-select" value={form.type_contrat}
                        onChange={e => handleChange('type_contrat', e.target.value)}>
                  {TYPES_CONTRAT.map(t => <option key={t} value={t}>{LIBELLE_TYPE_CONTRAT[t]}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Salaire brut mensuel (€)</label>
                <input className="form-input" type="number" step="0.01" min="0"
                       value={form.salaire_brut_mensuel}
                       onChange={e => handleChange('salaire_brut_mensuel', e.target.value)} />
                <div className="form-hint">0 pour mandataire / gérant</div>
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Palier PP mensuel (€)</label>
                <input className="form-input" type="number" step="100" min="0"
                       value={form.palier_pp_mensuel}
                       onChange={e => handleChange('palier_pp_mensuel', e.target.value)} />
                <div className="form-hint">Seuil PP à atteindre pour débloquer variable. 0 = aucun palier.</div>
              </div>
              <div className="form-group">
                <label className="form-label">Palier PU mensuel (€)</label>
                <input className="form-input" type="number" step="1000" min="0"
                       value={form.palier_pu_mensuel}
                       onChange={e => handleChange('palier_pu_mensuel', e.target.value)} />
                <div className="form-hint">Seuil PU à atteindre. 0 = aucun palier.</div>
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Date de début</label>
                <input className="form-input" type="date"
                       value={form.date_debut || ''}
                       onChange={e => handleChange('date_debut', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Date de fin (optionnel)</label>
                <input className="form-input" type="date"
                       value={form.date_fin || ''}
                       onChange={e => handleChange('date_fin', e.target.value || null)} />
                <div className="form-hint">CDD, fin de stage, etc.</div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Notes manager (privées)</label>
              <textarea className="form-textarea" rows={3}
                        value={form.notes || ''}
                        onChange={e => handleChange('notes', e.target.value)}
                        placeholder="Commentaires internes, dérogations, contexte…" />
            </div>

            {!isNew && (
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--t2)' }}>
                  <input type="checkbox" checked={!!form.actif}
                         onChange={e => handleChange('actif', e.target.checked)} />
                  Contrat actif
                </label>
              </div>
            )}
          </div>

          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary">{isNew ? 'Créer' : 'Enregistrer'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Frise chronologique RH
// Affiche les événements clés (embauches, fins de contrat, échéances)
// regroupés par mois sur une fenêtre de M-2 à M+6.
// ─────────────────────────────────────────────────────────────────────────
function TimelineRH({ contrats }) {
  const MOIS_AVANT = 2
  const MOIS_APRES = 5    // → 8 mois affichés au total (M-2 → M+5)
  const moisFr = ['Janv.', 'Févr.', 'Mars', 'Avril', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.']

  const { events, mois, currentIdx } = useMemo(() => {
    const now = new Date()
    const startMonth = new Date(now.getFullYear(), now.getMonth() - MOIS_AVANT, 1)
    const endMonth = new Date(now.getFullYear(), now.getMonth() + MOIS_APRES + 1, 0)
    const totalMois = MOIS_AVANT + 1 + MOIS_APRES
    const mois = []
    for (let i = 0; i < totalMois; i++) {
      const d = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1)
      mois.push({
        date: d,
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: moisFr[d.getMonth()],
        annee: d.getFullYear(),
      })
    }
    const out = []
    for (const c of contrats) {
      if (!c.actif && !c.date_fin) continue
      const pushEv = (dateStr, type) => {
        if (!dateStr) return
        const d = new Date(dateStr)
        if (d < startMonth || d > endMonth) return
        out.push({
          date: d,
          type,
          contrat: c,
          sub: `${LIBELLE_TYPE_CONTRAT[c.type_contrat]}${c.matricule ? ` · ${c.matricule}` : ''}`,
        })
      }
      pushEv(c.date_debut, 'start')
      pushEv(c.date_fin, 'end')
    }
    out.sort((a, b) => a.date - b.date)
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const currentIdx = mois.findIndex(m => m.key === currentKey)
    return { events: out, mois, currentIdx }
  }, [contrats])

  // Position 0→100% sur la frise pour une date donnée
  function dateToPercent(date) {
    if (mois.length === 0) return 0
    const start = mois[0].date.getTime()
    const end = new Date(mois[mois.length - 1].date.getFullYear(), mois[mois.length - 1].date.getMonth() + 1, 0).getTime()
    return Math.max(0, Math.min(100, ((date.getTime() - start) / (end - start)) * 100))
  }

  // Empilage vertical : on alterne haut/bas, et on évite que 2 events trop proches se chevauchent
  const placed = useMemo(() => {
    const arr = events.map((ev, i) => ({ ...ev, pct: dateToPercent(ev.date), i }))
    const lanes = { top: [], bottom: [] }   // pct des events déjà posés
    return arr.map((ev) => {
      // Choisit le côté avec le moins d'events à proximité (<8% d'écart)
      const proche = (side) => lanes[side].filter(p => Math.abs(p - ev.pct) < 8).length
      const side = proche('top') <= proche('bottom') ? 'top' : 'bottom'
      // Niveau d'empilage sur ce côté
      const niveau = proche(side)
      lanes[side].push(ev.pct)
      return { ...ev, side, niveau }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, mois])

  if (events.length === 0) {
    return (
      <div className="card card-p mb-24" style={{ textAlign: 'center', padding: '20px 16px', color: 'var(--t3)', fontSize: 13 }}>
        Aucune échéance RH dans les 6 prochains mois.
      </div>
    )
  }

  const todayPct = dateToPercent(new Date())
  const CARD_H = 56     // hauteur d'une carte d'événement
  const CARD_GAP = 6    // espace entre 2 niveaux
  const maxNiveauTop = Math.max(0, ...placed.filter(p => p.side === 'top').map(p => p.niveau))
  const maxNiveauBottom = Math.max(0, ...placed.filter(p => p.side === 'bottom').map(p => p.niveau))
  const hautTop = (maxNiveauTop + 1) * (CARD_H + CARD_GAP) + 18
  const hautBottom = (maxNiveauBottom + 1) * (CARD_H + CARD_GAP) + 18

  return (
    <div className="card mb-24 timeline-rh">
      <div className="panel-head">
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)' }}>
            Frise chronologique
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginTop: 4 }}>
            Échéances RH · {events.length} événement{events.length !== 1 ? 's' : ''} sur {mois.length} mois
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
            Embauches et fins de contrat — survol pour les détails.
          </div>
        </div>
      </div>
      <div className="panel-body" style={{ padding: '28px 36px 20px' }}>
        <div className="timeline-wrap" style={{
          position: 'relative',
          height: hautTop + 28 + hautBottom,
        }}>
          {/* Ligne horizontale principale */}
          <div style={{
            position: 'absolute',
            left: 0, right: 0,
            top: hautTop + 14,
            height: 2,
            background: 'linear-gradient(90deg, rgba(0,0,0,0.04) 0%, rgba(201,169,97,0.25) 50%, rgba(0,0,0,0.04) 100%)',
            borderRadius: 1,
          }} />
          {/* Marqueur "aujourd'hui" — petit triangle + halo */}
          <div className="timeline-today" style={{
            position: 'absolute',
            left: `${todayPct}%`,
            top: hautTop - 4,
            transform: 'translateX(-50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              color: 'var(--gold-dk)', textTransform: 'uppercase',
              marginBottom: 4,
            }}>aujourd'hui</div>
            <div style={{
              width: 0, height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: '6px solid var(--gold)',
            }} />
          </div>
          {/* Marqueurs des mois (ronds + label) */}
          {mois.map((m, i) => {
            const pct = (i + 0.5) / mois.length * 100
            const isCurrent = i === currentIdx
            const isPast = i < currentIdx
            return (
              <div key={m.key} style={{
                position: 'absolute',
                left: `${pct}%`,
                top: hautTop + 8,
                transform: 'translateX(-50%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
              }}>
                <div className={isCurrent ? 'timeline-dot-current' : ''} style={{
                  width: isCurrent ? 14 : 10,
                  height: isCurrent ? 14 : 10,
                  borderRadius: '50%',
                  background: isCurrent ? 'var(--gold)' : isPast ? '#D0D0D5' : '#fff',
                  border: isCurrent ? '2px solid #fff' : `2px solid ${isPast ? '#D0D0D5' : 'var(--bd-strong)'}`,
                  boxShadow: isCurrent
                    ? '0 0 0 4px rgba(201,169,97,0.15), 0 2px 6px rgba(201,169,97,0.35)'
                    : '0 1px 2px rgba(0,0,0,0.04)',
                }} />
                <div style={{
                  marginTop: 8,
                  fontSize: 10,
                  fontWeight: isCurrent ? 700 : 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: isCurrent ? 'var(--gold-dk)' : isPast ? 'var(--t3)' : 'var(--t2)',
                  whiteSpace: 'nowrap',
                }}>
                  {m.label}
                </div>
                {(i === 0 || m.date.getMonth() === 0) && (
                  <div style={{
                    fontSize: 9, color: 'var(--t3)', marginTop: 1,
                    fontVariantNumeric: 'tabular-nums',
                  }}>{m.annee}</div>
                )}
              </div>
            )
          })}
          {/* Événements — cartes flottantes */}
          {placed.map((ev, i) => {
            const isStart = ev.type === 'start'
            const isPast = ev.date < new Date()
            const lineColor = isStart ? '#34C759' : '#FF3B30'
            const offset = ev.niveau * (CARD_H + CARD_GAP)
            const top = ev.side === 'top'
              ? hautTop - 18 - CARD_H - offset
              : hautTop + 20 + offset
            const lineTop = ev.side === 'top'
              ? top + CARD_H
              : hautTop + 16
            const lineHeight = ev.side === 'top'
              ? hautTop + 14 - lineTop
              : top - lineTop
            return (
              <div
                key={i}
                className="timeline-event"
                style={{
                  position: 'absolute',
                  left: `${ev.pct}%`,
                  top,
                  transform: 'translateX(-50%)',
                  width: 180,
                  animationDelay: `${i * 60}ms`,
                  opacity: isPast ? 0.7 : 1,
                }}
              >
                {/* Connecteur vertical vers la timeline */}
                <div style={{
                  position: 'absolute',
                  left: '50%',
                  top: lineTop - top,
                  width: 1.5,
                  height: lineHeight,
                  background: `linear-gradient(${ev.side === 'top' ? '180deg' : '0deg'}, ${lineColor}66 0%, ${lineColor}00 100%)`,
                  transform: 'translateX(-50%)',
                }} />
                <div style={{
                  background: '#fff',
                  border: `0.5px solid var(--bd)`,
                  borderLeft: `3px solid ${lineColor}`,
                  borderRadius: 10,
                  padding: '8px 12px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
                  height: CARD_H,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 9, fontWeight: 700,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    color: lineColor,
                    marginBottom: 2,
                  }}>
                    <span>{isStart ? 'Embauche' : 'Fin'}</span>
                    <span style={{ color: 'var(--t3)', fontWeight: 600 }}>·</span>
                    <span style={{ color: 'var(--t2)', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'none' }}>
                      {ev.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--t1)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {ev.contrat.full_name}
                  </div>
                  <div style={{
                    fontSize: 11, color: 'var(--t3)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {ev.sub}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
