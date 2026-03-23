import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { PROMPT_IMMOBILIER } from '../config/promptImmo'

const euro = (v) => Number(v||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0})

const PROMOTEUR_COLORS = {
  greencity: { bg: 'rgba(22, 163, 74, 0.15)', text: '#4ade80', border: 'rgba(22,163,74,0.3)', label: 'GreenCity' },
  nexity: { bg: 'rgba(37, 99, 235, 0.15)', text: '#60a5fa', border: 'rgba(37,99,235,0.3)', label: 'Nexity' },
  'lp-promotion': { bg: 'rgba(234, 88, 12, 0.15)', text: '#fb923c', border: 'rgba(234,88,12,0.3)', label: 'LP Promotion' },
}

const STATUT_LABELS = {
  nouveau: 'NOUVEAU',
  disponible: 'DISPONIBLE',
  dernieres_opportunites: 'DERNIÈRES OPPS',
  travaux: 'TRAVAUX',
  livre: 'LIVRÉ',
}

const STATUT_COLORS = {
  nouveau: { bg: 'rgba(22,163,74,0.15)', text: '#4ade80', border: 'rgba(22,163,74,0.3)' },
  disponible: { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
  dernieres_opportunites: { bg: 'rgba(249,115,22,0.15)', text: '#fb923c', border: 'rgba(249,115,22,0.3)' },
  travaux: { bg: 'rgba(107,114,128,0.15)', text: '#9ca3af', border: 'rgba(107,114,128,0.3)' },
  livre: { bg: 'rgba(22,163,74,0.1)', text: '#86efac', border: 'rgba(22,163,74,0.2)' },
}

const DISPOSITIF_COLORS = {
  LLI: { bg: 'rgba(161,98,7,0.2)', text: '#fbbf24' },
  LMNP: { bg: 'rgba(37,99,235,0.2)', text: '#60a5fa' },
  PTZ: { bg: 'rgba(22,163,74,0.2)', text: '#4ade80' },
  'Bailleur Privé': { bg: 'rgba(139,92,246,0.2)', text: '#a78bfa' },
}

export default function CatalogueProgrammes({ setActiveTab }) {
  const [programmes, setProgrammes] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [filterRegion, setFilterRegion] = useState('tous')
  const [filterDispositif, setFilterDispositif] = useState('tous')
  const [filterType, setFilterType] = useState('tous')
  const [showAI, setShowAI] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    loadProgrammes()
  }, [])

  async function loadProgrammes() {
    console.log('[CatalogueProgrammes] Loading programmes...')
    setLoading(true)
    try {
      const { data, error } = await supabase.from('programmes').select('*').order('created_at', { ascending: false })
      console.log('[CatalogueProgrammes] Result:', { count: data?.length, error: error?.message || null })
      if (error) {
        console.error('[CatalogueProgrammes] Supabase error:', error.message, error.details, error.hint)
        toast.error('Erreur chargement programmes : ' + error.message)
        setProgrammes([])
      } else {
        setProgrammes(data || [])
      }
    } catch (err) {
      console.error('[CatalogueProgrammes] Exception:', err)
      toast.error('Erreur réseau : ' + err.message)
      setProgrammes([])
    } finally {
      setLoading(false)
    }
  }

  async function syncProgrammes() {
    setSyncing(true)
    try {
      const { data, error } = await supabase.functions.invoke('sync-programmes')
      if (error) throw error
      toast.success(`${data.synced} programmes GreenCity synchronisés`)
      await loadProgrammes()
    } catch (err) {
      toast.error('Erreur de synchronisation : ' + err.message)
    }
    setSyncing(false)
  }

  async function askAI(message) {
    setAiLoading(true)
    setAiResponse('')
    try {
      const response = await fetch('/api/generate-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: PROMPT_IMMOBILIER, userMessage: message })
      })
      const data = await response.json()
      if (data.error) throw new Error(data.error)
      setAiResponse(data.content || 'Pas de réponse')
    } catch (err) {
      setAiResponse('Erreur : ' + err.message)
    }
    setAiLoading(false)
  }

  const regions = useMemo(() => [...new Set(programmes.map(p => p.region).filter(Boolean))], [programmes])
  const allDispositifs = useMemo(() => [...new Set(programmes.flatMap(p => p.dispositifs || []))], [programmes])
  const allTypes = useMemo(() => [...new Set(programmes.flatMap(p => p.typologies || []))].sort(), [programmes])

  const filtered = useMemo(() => {
    return programmes.filter(p => {
      if (search && !p.nom?.toLowerCase().includes(search.toLowerCase()) && !p.ville?.toLowerCase().includes(search.toLowerCase())) return false
      if (filterRegion !== 'tous' && p.region !== filterRegion) return false
      if (filterDispositif !== 'tous' && !(p.dispositifs || []).includes(filterDispositif)) return false
      if (filterType !== 'tous' && !(p.typologies || []).includes(filterType)) return false
      return true
    })
  }, [programmes, search, filterRegion, filterDispositif, filterType])

  if (loading) {
    return (
      <div className="immo-loading">
        <div className="loading-spinner" />
        <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 12 }}>Chargement des programmes...</div>
      </div>
    )
  }

  return (
    <div className="immo-catalogue">
      {/* Search bar */}
      <div className="immo-catalogue-toolbar">
        <div className="immo-search-wrap">
          <span className="immo-search-icon">🔍</span>
          <input
            className="immo-search"
            placeholder="Rechercher un programme..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="immo-filter-select" value={filterRegion} onChange={e => setFilterRegion(e.target.value)}>
          <option value="tous">Toutes régions</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="immo-filter-select" value={filterDispositif} onChange={e => setFilterDispositif(e.target.value)}>
          <option value="tous">Tous dispositifs</option>
          {allDispositifs.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="immo-filter-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="tous">Tous types</option>
          {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className="btn-immo-secondary" onClick={syncProgrammes} disabled={syncing}>
          {syncing ? '⏳ Sync...' : '🔄 Synchroniser'}
        </button>
        <button className="btn-immo-ai" onClick={() => setShowAI(!showAI)} title="Assistant IA">
          ✨
        </button>
      </div>

      {/* AI Modal */}
      {showAI && (
        <div className="immo-ai-panel">
          <div className="immo-ai-header">
            <span>Assistant IA Immobilier</span>
            <button className="immo-ai-close" onClick={() => setShowAI(false)}>✕</button>
          </div>
          <div className="immo-ai-shortcuts">
            <button className="immo-ai-shortcut" onClick={() => askAI('Aide-moi à qualifier un client investisseur immobilier. Quelles questions poser ?')}>Qualifier</button>
            <button className="immo-ai-shortcut" onClick={() => askAI('Compare les dispositifs LLI, LMNP et PTZ pour un investisseur en IDF')}>Recommander dispositif</button>
            <button className="immo-ai-shortcut" onClick={() => askAI('Analyse les critères importants pour choisir un programme immobilier neuf en IDF')}>Analyser programme</button>
            <button className="immo-ai-shortcut" onClick={() => askAI('Rédige un email professionnel pour proposer un programme immobilier neuf à un client investisseur')}>Rédiger email</button>
          </div>
          <div className="immo-ai-input-wrap">
            <input
              className="immo-ai-input"
              placeholder="Décrivez le profil de votre client..."
              value={aiInput}
              onChange={e => setAiInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && aiInput.trim()) { askAI(aiInput); setAiInput('') } }}
            />
            <button className="btn-immo-small" onClick={() => { if (aiInput.trim()) { askAI(aiInput); setAiInput('') } }} disabled={aiLoading}>
              {aiLoading ? '...' : 'Envoyer'}
            </button>
          </div>
          {aiResponse && (
            <div className="immo-ai-response">
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{aiResponse}</pre>
            </div>
          )}
        </div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="immo-empty" style={{ marginTop: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏗️</div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Aucun programme trouvé</div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 8 }}>
            {programmes.length === 0 ? 'Cliquez sur "Synchroniser" pour importer les programmes GreenCity' : 'Modifiez vos filtres de recherche'}
          </div>
          {programmes.length === 0 && (
            <button className="btn-immo-primary" style={{ marginTop: 16 }} onClick={syncProgrammes} disabled={syncing}>
              {syncing ? 'Synchronisation...' : 'Synchroniser les programmes'}
            </button>
          )}
        </div>
      ) : (
        <div className="immo-catalogue-grid">
          {filtered.map(prog => {
            const pc = PROMOTEUR_COLORS[prog.promoteur_slug] || PROMOTEUR_COLORS.greencity
            const sc = STATUT_COLORS[prog.statut] || STATUT_COLORS.disponible
            return (
              <div key={prog.id} className="immo-catalogue-card">
                {/* Image / placeholder */}
                <div className="immo-catalogue-card-image">
                  {prog.image_url ? (
                    <img src={prog.image_url} alt={prog.nom} />
                  ) : (
                    <div className="immo-catalogue-card-placeholder">
                      <span style={{ fontSize: 28 }}>🏢</span>
                    </div>
                  )}
                  <div className="immo-catalogue-card-badges">
                    {prog.statut && prog.statut !== 'disponible' && (
                      <span className="immo-badge" style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                        {STATUT_LABELS[prog.statut] || prog.statut}
                      </span>
                    )}
                    <span className="immo-badge" style={{ background: pc.bg, color: pc.text, border: `1px solid ${pc.border}` }}>
                      {pc.label || prog.promoteur_slug}
                    </span>
                  </div>
                </div>

                <div className="immo-catalogue-card-body">
                  <div className="immo-catalogue-card-name">{prog.nom}</div>
                  <div className="immo-catalogue-card-ville">{prog.ville}{prog.code_postal ? ` · ${prog.code_postal}` : ''}</div>

                  {prog.typologies?.length > 0 && (
                    <div className="immo-programme-typos">
                      {prog.typologies.map(t => <span key={t} className="immo-typo-badge">{t}</span>)}
                    </div>
                  )}

                  {prog.dispositifs?.length > 0 && (
                    <div className="immo-programme-dispositifs">
                      {prog.dispositifs.map(d => {
                        const dc = DISPOSITIF_COLORS[d] || { bg: 'rgba(107,114,128,0.2)', text: '#9ca3af' }
                        return <span key={d} className="immo-dispositif-badge" style={{ background: dc.bg, color: dc.text }}>{d}</span>
                      })}
                    </div>
                  )}

                  {prog.date_livraison && (
                    <div className="immo-catalogue-card-detail">Livraison : {prog.date_livraison}</div>
                  )}
                  {prog.prix_a_partir_de && (
                    <div className="immo-catalogue-card-prix">À partir de : {euro(prog.prix_a_partir_de)}</div>
                  )}

                  <div className="immo-catalogue-card-actions">
                    <button className="btn-immo-small" onClick={() => setActiveTab('immo-dossiers')}>+ Dossier client</button>
                    {prog.url_fiche && (
                      <a href={prog.url_fiche} target="_blank" rel="noopener noreferrer" className="btn-immo-small-ghost">↗ Voir</a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
