// src/components/UcsStructures.jsx
// Onglet "UCS Produits Structurés" : catalogue + simulateur de commission.
//
// Layout 2 colonnes (60% / 40%) sur desktop, empilé sur mobile.
// Charte Entasis : navy #0A1F44, or #C9A961, fond clair beige.
//
// Pour le simulateur (colonne droite), voir UCS-4.
// Pour l'interface admin (CSV upload + édition inline), voir UCS-5.

import { useEffect, useMemo, useState } from 'react'
import { logger } from '../lib/logger'
import * as ucsService from '../services/ucsStructures'
import * as clientsService from '../services/clients'
import * as structureursService from '../services/structureurs'

const ETATS = [
  { value: 'EN_COURS',   label: 'En cours',   color: '#15803d' },
  { value: 'CLOTURE',    label: 'Clôturé',    color: '#c2410c' },
  { value: 'ANNULATION', label: 'Annulé',     color: '#b91c1c' },
]

const FILTER_STORAGE_KEY = 'ucs.filters.v1'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de formatage
// ─────────────────────────────────────────────────────────────────────────────

const fmtEuro = (n) => {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  })
}

const fmtPct = (n) => {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 3 }) + '%'
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const daysUntil = (iso) => {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  return Math.floor(ms / 86400000)
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistance des filtres par conseiller (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_FILTERS = {
  etats: ['EN_COURS'],
  compagnies: [],          // [] = toutes
  sriMax: 7,
  ticketMin: 'all',        // 'all' / '1000' / '25000'
  search: '',
}

function loadFilters() {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY)
    if (!raw) return DEFAULT_FILTERS
    return { ...DEFAULT_FILTERS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_FILTERS
  }
}

function saveFilters(filters) {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters))
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export default function UcsStructures({ profile }) {
  const isManager = profile?.role === 'manager'
  const [ucs, setUcs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedUcsId, setSelectedUcsId] = useState(null)
  const [filters, setFilters] = useState(loadFilters)
  const [adminMode, setAdminMode] = useState(false)
  // Side panel structureur : visible uniquement pour les managers, ouvert au
  // clic sur un chip structureur dans une ligne du tableau.
  const [structureurPanelId, setStructureurPanelId] = useState(null)

  // Charge le catalogue (refetch si on change de mode pour rafraîchir après édition admin)
  const reload = () => {
    setLoading(true)
    return ucsService.listAll()
      .then(data => { setUcs(data); setError('') })
      .catch(e => {
        logger.warn('[UCS] listAll failed', e)
        setError(e.message || 'Erreur de chargement du catalogue')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    ucsService.listAll()
      .then(data => { if (active) { setUcs(data); setError('') } })
      .catch(e => {
        logger.warn('[UCS] listAll failed', e)
        if (active) setError(e.message || 'Erreur de chargement du catalogue')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  // Persistance filtres
  useEffect(() => { saveFilters(filters) }, [filters])

  // Liste des compagnies présentes dans le catalogue (pour le dropdown filtre)
  const allCompagnies = useMemo(() => {
    const set = new Set(ucs.map(u => u.compagnie).filter(Boolean))
    return Array.from(set).sort()
  }, [ucs])

  // Application des filtres (tri EN_COURS first + upfront DESC déjà côté service).
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    const ticketMin = filters.ticketMin === 'all' ? 0 : Number(filters.ticketMin)
    return ucs.filter(u => {
      if (filters.etats.length && !filters.etats.includes(u.etat)) return false
      if (filters.compagnies.length && !filters.compagnies.includes(u.compagnie)) return false
      if (u.sri != null && u.sri > filters.sriMax) return false
      if (ticketMin > 0 && Number(u.minimum_requis) < ticketMin) return false
      if (q) {
        const hay = `${u.nom_ucs} ${u.code_isin} ${u.compagnie}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [ucs, filters])

  const selectedUcs = ucs.find(u => u.id === selectedUcsId) || null

  // ─────────────────────────── Handlers filtres ───────────────────────────
  const toggleEtat = (value) => {
    setFilters(f => ({
      ...f,
      etats: f.etats.includes(value)
        ? f.etats.filter(e => e !== value)
        : [...f.etats, value],
    }))
  }

  const toggleCompagnie = (value) => {
    setFilters(f => ({
      ...f,
      compagnies: f.compagnies.includes(value)
        ? f.compagnies.filter(c => c !== value)
        : [...f.compagnies, value],
    }))
  }

  const resetFilters = () => setFilters(DEFAULT_FILTERS)

  // ───────────────────────────────── Render ─────────────────────────────────
  return (
    <div style={{ padding: '16px 24px 32px', maxWidth: 1600, margin: '0 auto' }}>
      <Header
        isManager={isManager}
        adminMode={adminMode}
        onToggleAdmin={() => setAdminMode(v => !v)}
      />

      {loading && <LoadingState />}
      {error && !loading && <ErrorState error={error} />}
      {!loading && !error && ucs.length === 0 && (
        <EmptyState isManager={isManager} onAdminClick={() => setAdminMode(true)} />
      )}

      {/* Mode admin : panneau d'import CSV au-dessus du layout principal */}
      {isManager && adminMode && (
        <AdminPanel onReload={reload} />
      )}

      {!loading && !error && ucs.length > 0 && (
        <div className="ucs-layout">
          <div className="ucs-catalogue">
            <FilterBar
              filters={filters}
              setFilters={setFilters}
              allCompagnies={allCompagnies}
              toggleEtat={toggleEtat}
              toggleCompagnie={toggleCompagnie}
              resetFilters={resetFilters}
              count={filtered.length}
              total={ucs.length}
            />
            <CatalogueTable
              ucs={filtered}
              selectedId={selectedUcsId}
              onSelect={setSelectedUcsId}
              adminMode={isManager && adminMode}
              onReload={reload}
              isManager={isManager}
              onStructureurClick={isManager ? setStructureurPanelId : undefined}
            />
          </div>
          <Simulator
            ucs={selectedUcs}
            profile={profile}
            isManager={isManager}
          />
        </div>
      )}

      {/* Side panel structureur (manager only) */}
      {isManager && structureurPanelId && (
        <StructureurSidePanel
          structureurId={structureurPanelId}
          onClose={() => setStructureurPanelId(null)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Header({ isManager, adminMode, onToggleAdmin }) {
  return (
    <div style={{
      marginBottom: 24,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 16,
      flexWrap: 'wrap',
    }}>
      <div>
        <h1 style={{
          fontFamily: 'var(--font-serif, Georgia, serif)',
          fontSize: 28,
          fontWeight: 700,
          color: 'var(--t1)',
          margin: 0,
          letterSpacing: '-0.01em',
        }}>
          UCS Produits Structurés
        </h1>
        <p style={{ fontSize: 13, color: 'var(--t3)', marginTop: 4 }}>
          Catalogue des produits structurés du groupement et simulateur de commission.
          {' '}<strong style={{ color: 'var(--gold)' }}>Commission conseiller : 1,5 % fixe</strong>
          {isManager && ' · Rétention cabinet = Upfront − 1,5 %'}
        </p>
      </div>
      {isManager && (
        <button
          onClick={onToggleAdmin}
          style={{
            padding: '8px 16px',
            fontSize: 12,
            fontWeight: 700,
            color: adminMode ? '#fff' : 'var(--t1)',
            background: adminMode ? 'var(--t1)' : '#fff',
            border: '1.5px solid var(--t1)',
            borderRadius: 8,
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
          }}
        >
          {adminMode ? 'Quitter le mode admin' : 'Mode administrateur'}
        </button>
      )}
    </div>
  )
}

function LoadingState() {
  return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>
      Chargement du catalogue...
    </div>
  )
}

function ErrorState({ error }) {
  return (
    <div style={{
      padding: 16,
      background: 'rgba(239,68,68,0.06)',
      border: '1px solid rgba(239,68,68,0.2)',
      borderRadius: 12,
      color: '#b91c1c',
      fontSize: 13,
      marginBottom: 16,
    }}>
      Erreur : {error}
      <br />
      <span style={{ fontSize: 11, opacity: 0.7 }}>
        La table UCS n'est peut-être pas encore créée. Vérifie que la migration SQL a été appliquée.
      </span>
    </div>
  )
}

function EmptyState({ isManager, onAdminClick }) {
  return (
    <div style={{
      padding: 32,
      textAlign: 'center',
      color: 'var(--t3)',
      fontSize: 13,
      background: 'var(--bg)',
      border: '1px dashed var(--bd)',
      borderRadius: 12,
    }}>
      Aucune UCS dans le catalogue.
      {isManager && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={onAdminClick}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 700,
              color: '#fff',
              background: 'var(--gold)',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Importer le CSV du groupement
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FilterBar : chips Etat, dropdown Compagnie, slider SRI, ticket min, recherche
// ─────────────────────────────────────────────────────────────────────────────

function FilterBar({ filters, setFilters, allCompagnies, toggleEtat, toggleCompagnie, resetFilters, count, total }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--bd)',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      {/* Ligne 1 : recherche + reset + compteur */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 360 }}>
          <input
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            placeholder="Rechercher (nom UCS, ISIN, compagnie)…"
            style={{
              width: '100%',
              padding: '8px 32px 8px 12px',
              fontSize: 13,
              border: '1px solid var(--bd)',
              borderRadius: 8,
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          {filters.search && (
            <button
              onClick={() => setFilters(f => ({ ...f, search: '' }))}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--t3)', fontSize: 16, padding: 0, lineHeight: 1,
              }}
              aria-label="Effacer la recherche"
            >×</button>
          )}
        </div>
        <button onClick={resetFilters} style={{
          padding: '6px 12px',
          fontSize: 12,
          background: 'var(--bg)',
          border: '1px solid var(--bd)',
          borderRadius: 6,
          color: 'var(--t2)',
          cursor: 'pointer',
        }}>Reset filtres</button>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t3)' }}>
          <strong style={{ color: 'var(--t1)' }}>{count}</strong> UCS sur {total}
        </div>
      </div>

      {/* Ligne 2 : chips Etat + compagnies + SRI + ticket */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Etat chips */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>État</span>
          {ETATS.map(e => {
            const active = filters.etats.includes(e.value)
            return (
              <button
                key={e.value}
                onClick={() => toggleEtat(e.value)}
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 12,
                  border: `1px solid ${active ? e.color : 'var(--bd)'}`,
                  background: active ? e.color : '#fff',
                  color: active ? '#fff' : 'var(--t2)',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                }}
              >{e.label}</button>
            )
          })}
        </div>

        {/* Compagnie multi-select (dropdown simple en chips) */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>Compagnie</span>
          {allCompagnies.length === 0 ? (
            <span style={{ fontSize: 11, color: 'var(--t3)', fontStyle: 'italic' }}>—</span>
          ) : (
            allCompagnies.map(c => {
              const active = filters.compagnies.includes(c)
              return (
                <button
                  key={c}
                  onClick={() => toggleCompagnie(c)}
                  style={{
                    padding: '3px 8px',
                    fontSize: 10.5,
                    fontWeight: 500,
                    borderRadius: 10,
                    border: `1px solid ${active ? 'var(--t1)' : 'var(--bd)'}`,
                    background: active ? 'var(--t1)' : '#fff',
                    color: active ? '#fff' : 'var(--t2)',
                    cursor: 'pointer',
                  }}
                >{c}</button>
              )
            })
          )}
        </div>

        {/* SRI max */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>SRI ≤</span>
          <input
            type="range"
            min={1}
            max={7}
            value={filters.sriMax}
            onChange={e => setFilters(f => ({ ...f, sriMax: Number(e.target.value) }))}
            style={{ width: 80 }}
          />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', minWidth: 12 }}>{filters.sriMax}</span>
        </div>

        {/* Ticket mini */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase' }}>Mini</span>
          {[
            { v: 'all',   l: 'Tous' },
            { v: '1000',  l: '1k€' },
            { v: '25000', l: '25k€' },
          ].map(opt => {
            const active = filters.ticketMin === opt.v
            return (
              <button
                key={opt.v}
                onClick={() => setFilters(f => ({ ...f, ticketMin: opt.v }))}
                style={{
                  padding: '3px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: `1px solid ${active ? 'var(--gold)' : 'var(--bd)'}`,
                  background: active ? 'var(--gold)' : '#fff',
                  color: active ? '#fff' : 'var(--t2)',
                  cursor: 'pointer',
                }}
              >{opt.l}</button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CatalogueTable : tableau dense, clic = sélection (chargement du simulateur)
// ─────────────────────────────────────────────────────────────────────────────

function CatalogueTable({ ucs, selectedId, onSelect, adminMode, onReload, isManager, onStructureurClick }) {
  if (ucs.length === 0) {
    return (
      <div style={{
        padding: 24,
        textAlign: 'center',
        color: 'var(--t3)',
        fontSize: 12,
        background: 'var(--bg)',
        border: '1px dashed var(--bd)',
        borderRadius: 12,
      }}>
        Aucune UCS ne correspond aux filtres actuels.
      </div>
    )
  }

  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--bd)',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--bd)' }}>
              <Th>État</Th>
              {/* Structureur : visible managers seulement (info commerciale stratégique) */}
              {isManager && <Th>Structureur</Th>}
              <Th>Nom UCS</Th>
              <Th>ISIN</Th>
              <Th>Compagnie</Th>
              {/* Ma commission : 1,5 % fixe, visible TOUS pour motivation conseiller */}
              <Th align="right">Ma comm.</Th>
              {/* Upfront : visible managers seulement (info négociée, ne pas exposer aux conseillers) */}
              {isManager && <Th align="right">Upfront</Th>}
              <Th align="right">Mini</Th>
              <Th align="right">Coupon/an</Th>
              <Th align="center">SRI</Th>
              <Th align="right">Fin commerc.</Th>
              {adminMode && <Th align="center">Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {ucs.map(u => (
              <Row
                key={u.id}
                u={u}
                selected={u.id === selectedId}
                onClick={() => onSelect(u.id)}
                adminMode={adminMode}
                onReload={onReload}
                isManager={isManager}
                onStructureurClick={onStructureurClick}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th style={{
      padding: '8px 12px',
      textAlign: align,
      fontSize: 10,
      fontWeight: 700,
      color: 'var(--t3)',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      whiteSpace: 'nowrap',
    }}>{children}</th>
  )
}

function Td({ children, align = 'left', style = {} }) {
  return (
    <td style={{
      padding: '10px 12px',
      textAlign: align,
      fontSize: 12,
      color: 'var(--t1)',
      borderTop: '1px solid var(--bd)',
      whiteSpace: 'nowrap',
      ...style,
    }}>{children}</td>
  )
}

function Row({ u, selected, onClick, adminMode, onReload, isManager, onStructureurClick }) {
  const etat = ETATS.find(e => e.value === u.etat)
  const dUntilFin = daysUntil(u.fin_commerc)
  const isFinSoon = dUntilFin != null && dUntilFin >= 0 && dUntilFin < 30
  const isFinPast = dUntilFin != null && dUntilFin < 0
  // upfront peut être NULL (notamment Abeille mini-campagnes via SwissLine circulaire)
  const hasUpfront = u.upfront != null && !isNaN(Number(u.upfront))
  const upfrontVal = hasUpfront ? Number(u.upfront) : null
  // Coupon annuel : on prend coupon_annualise si dispo, sinon coupon_periode × N
  const couponDisplay = u.coupon_annualise != null
    ? u.coupon_annualise
    : (u.coupon_client != null ? u.coupon_client : null)

  return (
    <tr
      onClick={onClick}
      style={{
        cursor: 'pointer',
        background: selected ? 'rgba(10,31,68,0.06)' : 'transparent',
        boxShadow: selected ? 'inset 3px 0 0 var(--gold)' : 'none',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--bg)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      <Td>
        <span style={{
          display: 'inline-block',
          padding: '2px 8px',
          fontSize: 9,
          fontWeight: 700,
          color: '#fff',
          background: etat?.color || '#666',
          borderRadius: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>{etat?.label || u.etat}</span>
      </Td>
      {/* CHIP STRUCTUREUR (patch #3) — masqué pour les conseillers (info commerciale stratégique).
          Affiché seulement aux managers, qui peuvent cliquer pour ouvrir le side panel. */}
      {isManager && (
        <Td>
          {u.structureur?.nom ? (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                if (onStructureurClick) onStructureurClick(u.structureur.id)
              }}
              disabled={!onStructureurClick}
              title={onStructureurClick
                ? `Voir la fiche ${u.structureur.nom}`
                : u.structureur.nom}
              style={{
                display: 'inline-block',
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700,
                color: '#fff',
                background: '#0A1F44',
                border: 'none',
                borderRadius: 4,
                cursor: onStructureurClick ? 'pointer' : 'default',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
                fontFamily: 'inherit',
              }}
            >
              {u.structureur.nom}
            </button>
          ) : (
            <span style={{ fontSize: 10, color: 'var(--t3)', fontStyle: 'italic' }}>—</span>
          )}
        </Td>
      )}
      <Td style={{ maxWidth: 320, whiteSpace: 'normal', lineHeight: 1.3 }}>
        {u.couleur_badge && (
          <span style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: 3,
            background: u.couleur_badge,
            marginRight: 6,
            verticalAlign: 'middle',
          }} />
        )}
        <span style={{ fontWeight: 600 }}>{u.nom_ucs}</span>
        {u.sous_jacent && (
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }} title={u.sous_jacent}>
            {u.sous_jacent.length > 60 ? u.sous_jacent.slice(0, 60) + '…' : u.sous_jacent}
          </div>
        )}
      </Td>
      <Td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--t2)' }}>{u.code_isin}</Td>
      <Td>
        <span style={{
          padding: '2px 8px',
          fontSize: 10,
          fontWeight: 600,
          borderRadius: 4,
          background: u.compagnie === 'SWISSLIFE' ? 'rgba(201,169,97,0.15)' : 'rgba(10,31,68,0.08)',
          color: u.compagnie === 'SWISSLIFE' ? '#7c5e1e' : '#0A1F44',
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}>{u.compagnie}</span>
      </Td>
      {/* Ma commission : 1,5 % fixe — visible tous, en or gras (motivation). */}
      <Td align="right">
        <span style={{
          fontWeight: 700,
          color: 'var(--gold)',
          fontSize: 12,
          letterSpacing: '0.01em',
        }} title="Commission conseiller fixe sur toutes les UCS">
          1,5 %
        </span>
      </Td>
      {/* Upfront : visible managers seulement. Les conseillers n'ont pas
          besoin de cette info négociée — leur commission est 1,5% fixe. */}
      {isManager && (
      <Td align="right" title={
        hasUpfront
          ? `Cabinet : ${fmtPct(upfrontVal - 1.5)} (conseiller fixe 1,5%)`
          : 'Upfront non renseigné — circulaire SwissLine ou à demander au structureur'
      }>
        {hasUpfront ? (
          <span style={{
            fontWeight: 700,
            color: upfrontVal < 1.5 ? '#b91c1c' : 'var(--t1)',
          }}>
            {fmtPct(upfrontVal)}
            {upfrontVal < 1.5 && <span style={{ marginLeft: 4 }}>⚠</span>}
          </span>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--t3)', fontStyle: 'italic' }}>n/a</span>
        )}
      </Td>
      )}
      <Td align="right" title={u.maximum_autorise ? `Max ${fmtEuro(u.maximum_autorise)}` : undefined}>
        {fmtEuro(u.minimum_requis)}
      </Td>
      <Td align="right" title={u.coupon_periode != null && u.frequence_coupon
        ? `${u.coupon_periode}% / ${u.frequence_coupon.toLowerCase()}`
        : undefined}>
        {couponDisplay != null ? fmtPct(couponDisplay) : '—'}
      </Td>
      <Td align="center">
        <span style={{
          display: 'inline-block',
          minWidth: 18,
          padding: '1px 5px',
          fontSize: 10,
          fontWeight: 700,
          borderRadius: 3,
          background: u.capital_garanti ? 'rgba(21,128,61,0.12)' : 'var(--bg)',
          border: `1px solid ${u.capital_garanti ? '#15803d' : 'var(--bd)'}`,
          color: u.capital_garanti ? '#15803d' : 'var(--t2)',
        }} title={u.capital_garanti ? 'Capital garanti à échéance' : undefined}>
          {u.sri ?? '—'}
        </span>
      </Td>
      <Td align="right" style={{ color: isFinPast ? '#b91c1c' : isFinSoon ? '#c2410c' : 'var(--t2)' }}>
        {fmtDate(u.fin_commerc)}
        {isFinSoon && !isFinPast && (
          <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.8 }}>({dUntilFin}j)</span>
        )}
      </Td>
      {adminMode && (
        <Td align="center" style={{ whiteSpace: 'nowrap' }}>
          <AdminRowActions u={u} onReload={onReload} />
        </Td>
      )}
    </tr>
  )
}

// Boutons d'action admin sur une row (changement statut + édition enveloppe).
// onClick=stopPropagation pour ne pas déclencher la sélection de la ligne.
function AdminRowActions({ u, onReload }) {
  const [busy, setBusy] = useState(false)

  const handleStatus = async (newEtat) => {
    if (busy) return
    if (!confirm(`Marquer "${u.nom_ucs}" comme ${newEtat} ?`)) return
    setBusy(true)
    try {
      await ucsService.markStatus(u.id, newEtat)
      await onReload?.()
    } catch (e) {
      alert(`Erreur : ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const handleEditEnveloppe = async () => {
    if (busy) return
    const raw = prompt(
      `Nouvelle enveloppe restante pour "${u.nom_ucs}" (€) :`,
      String(u.enveloppe_restante ?? '')
    )
    if (raw == null) return
    const val = parseFloat(String(raw).replace(/[^\d.-]/g, ''))
    if (isNaN(val)) {
      alert('Montant invalide')
      return
    }
    setBusy(true)
    try {
      await ucsService.update(u.id, { enveloppe_restante: val })
      await onReload?.()
    } catch (e) {
      alert(`Erreur : ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{ display: 'inline-flex', gap: 4 }}
    >
      <button
        onClick={handleEditEnveloppe}
        disabled={busy}
        title="Modifier l'enveloppe restante"
        style={adminActionBtn('var(--t2)')}
      >€</button>
      {u.etat !== 'CLOTURE' && (
        <button
          onClick={() => handleStatus('CLOTURE')}
          disabled={busy}
          title="Marquer CLOTURE"
          style={adminActionBtn('#c2410c')}
        >✕</button>
      )}
      {u.etat !== 'ANNULATION' && (
        <button
          onClick={() => handleStatus('ANNULATION')}
          disabled={busy}
          title="Marquer ANNULATION"
          style={adminActionBtn('#b91c1c')}
        >⊘</button>
      )}
      {u.etat !== 'EN_COURS' && (
        <button
          onClick={() => handleStatus('EN_COURS')}
          disabled={busy}
          title="Réactiver EN_COURS"
          style={adminActionBtn('#15803d')}
        >↺</button>
      )}
    </div>
  )
}

function adminActionBtn(color) {
  return {
    width: 26,
    height: 26,
    padding: 0,
    fontSize: 12,
    fontWeight: 700,
    color,
    background: '#fff',
    border: `1px solid ${color}`,
    borderRadius: 4,
    cursor: 'pointer',
    lineHeight: 1,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulator : colonne droite, sticky, calcul commission temps réel
// ─────────────────────────────────────────────────────────────────────────────

function Simulator({ ucs, profile, isManager }) {
  const [montantStr, setMontantStr] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState(null)
  const [clientResults, setClientResults] = useState([])
  const [saving, setSaving] = useState(false)
  const [savedFeedback, setSavedFeedback] = useState('')

  // Reset montant + client quand on change d'UCS
  useEffect(() => {
    setMontantStr('')
    setSelectedClient(null)
    setClientSearch('')
    setSavedFeedback('')
  }, [ucs?.id])

  // Parse le montant tapé (accepte espaces et virgules)
  const montant = useMemo(() => {
    const cleaned = montantStr.replace(/[^\d,.]/g, '').replace(',', '.')
    const n = parseFloat(cleaned)
    return isNaN(n) ? 0 : n
  }, [montantStr])

  const minimum = ucs?.minimum_requis ? Number(ucs.minimum_requis) : 0
  const isBelowMin = ucs && montant > 0 && montant < minimum
  const hasValidMontant = ucs && montant >= minimum
  // Upfront peut être NULL (Abeille mini-campagne circulaire SwissLine) →
  // pas de calcul de commission possible, on prévient l'utilisateur.
  const hasUpfront = ucs?.upfront != null && !isNaN(Number(ucs.upfront))

  // Calcul commission (pure function du service).
  // Côté conseiller la commission reste 1,5 % fixe même sans upfront négocié
  // (cas Abeille mini-campagne SwissLine). Seule la rétention cabinet exige
  // l'upfront — donc le warning "non calculable" est réservé au manager.
  const commission = useMemo(() => {
    if (!ucs || !hasValidMontant) return null
    if (hasUpfront) {
      return ucsService.computeCommission(montant, Number(ucs.upfront))
    }
    if (!isManager) {
      return {
        upfrontTotal: null,
        conseiller: (montant * 1.5) / 100,
        cabinet: null,
        isUnderwater: false,
      }
    }
    return null
  }, [ucs, montant, hasValidMontant, hasUpfront, isManager])

  // Coupon annuel : préférer coupon_annualise (nouveau schéma), fallback coupon_client (legacy)
  const couponAnnuelPct = ucs?.coupon_annualise != null
    ? Number(ucs.coupon_annualise)
    : (ucs?.coupon_client != null ? Number(ucs.coupon_client) : null)

  const couponAnnuel = useMemo(() => {
    if (!ucs || !hasValidMontant || couponAnnuelPct == null) return null
    return ucsService.computeCouponAnnuel(montant, couponAnnuelPct)
  }, [ucs, montant, hasValidMontant, couponAnnuelPct])

  // Format affichage avec espaces (européen)
  const formatInput = (v) => {
    if (!v) return ''
    const num = parseFloat(String(v).replace(/[^\d,.]/g, '').replace(',', '.'))
    if (isNaN(num)) return v
    return num.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
  }

  const handleMontantChange = (e) => {
    // On garde le texte brut pour permettre la saisie progressive
    setMontantStr(e.target.value)
    setSavedFeedback('')
  }

  const handleQuickAdd = (amount) => {
    setMontantStr(String(Math.round(montant + amount)))
    setSavedFeedback('')
  }

  const handleReset = () => {
    setMontantStr('')
    setSavedFeedback('')
  }

  // Recherche client (debounced 300ms via setTimeout)
  useEffect(() => {
    if (!clientSearch || clientSearch.length < 2) {
      setClientResults([])
      return
    }
    const t = setTimeout(async () => {
      try {
        const results = await clientsService.searchByQuery(clientSearch)
        setClientResults(results)
      } catch (e) {
        logger.warn('[UCS] client search failed', e)
        setClientResults([])
      }
    }, 300)
    return () => clearTimeout(t)
  }, [clientSearch])

  const handleSave = async () => {
    if (!ucs || !commission || !profile?.id) return
    setSaving(true)
    setSavedFeedback('')
    try {
      await ucsService.saveSimulation({
        ucsId: ucs.id,
        conseillerId: profile.id,
        clientId: selectedClient?.id || null,
        montant,
        commissionConseiller: commission.conseiller,
        commissionCabinet: commission.cabinet,
      })
      setSavedFeedback('Simulation enregistrée ✓')
    } catch (e) {
      logger.warn('[UCS] saveSimulation failed', e)
      setSavedFeedback(`Erreur : ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  // ───────────────── Render ─────────────────
  if (!ucs) {
    return (
      <div className="ucs-simulator">
        <h2 style={simulatorTitleStyle}>Simulateur de commission</h2>
        <p style={{ fontSize: 13, color: 'var(--t3)', margin: '8px 0 0' }}>
          Sélectionnez une UCS dans le catalogue pour démarrer une simulation.
        </p>
      </div>
    )
  }

  return (
    <div className="ucs-simulator">
      <h2 style={simulatorTitleStyle}>Simulateur de commission</h2>
      <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
        {ucs.nom_ucs}
      </div>
      <div style={{ marginTop: 2, fontSize: 11, color: 'var(--t3)', fontFamily: 'monospace' }}>
        {ucs.code_isin}
      </div>

      {/* Caractéristiques UCS sélectionnée */}
      <div style={{
        marginTop: 16,
        padding: 12,
        background: 'var(--bg)',
        borderRadius: 8,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '6px 12px',
        fontSize: 11,
      }}>
        <CharRow label="Compagnie" value={ucs.compagnie} />
        {/* Upfront : carte caractéristiques visible managers seulement */}
        {isManager && (
          <CharRow label="Upfront" value={fmtPct(ucs.upfront)} highlight />
        )}
        <CharRow label="Coupon/an" value={couponAnnuelPct != null ? fmtPct(couponAnnuelPct) : '—'} />
        <CharRow label="Mini ticket" value={fmtEuro(ucs.minimum_requis)} />
        <CharRow label="SRI" value={ucs.sri ?? '—'} />
        <CharRow label="Fin commerc." value={fmtDate(ucs.fin_commerc)} />
      </div>

      {/* Input montant */}
      <div style={{ marginTop: 20 }}>
        <label style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--t3)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: 6,
        }}>
          Montant client
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            inputMode="numeric"
            value={montantStr}
            onChange={handleMontantChange}
            placeholder={`Ex: ${fmtEuro(minimum * 4)}`}
            style={{
              width: '100%',
              padding: '12px 36px 12px 14px',
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--t1)',
              border: `2px solid ${isBelowMin ? '#b91c1c' : 'var(--bd)'}`,
              borderRadius: 8,
              outline: 'none',
              fontFamily: 'inherit',
              background: '#fff',
            }}
          />
          <span style={{
            position: 'absolute',
            right: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 16,
            color: 'var(--t3)',
            fontWeight: 600,
            pointerEvents: 'none',
          }}>€</span>
        </div>
        {isBelowMin && (
          <div style={{
            marginTop: 6,
            fontSize: 11,
            color: '#b91c1c',
            fontWeight: 500,
          }}>
            ⚠ Montant inférieur au minimum requis ({fmtEuro(minimum)})
          </div>
        )}
        {montant > 0 && !isBelowMin && (
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--t3)' }}>
            {formatInput(montant)} €
          </div>
        )}
      </div>

      {/* Boutons rapides */}
      <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[10000, 25000, 50000, 100000].map(a => (
          <button key={a} onClick={() => handleQuickAdd(a)} style={quickBtnStyle}>
            +{a / 1000}k
          </button>
        ))}
        <button onClick={handleReset} style={{ ...quickBtnStyle, background: 'transparent' }}>
          Reset
        </button>
      </div>

      {/* Cas spécial : pas d'upfront négocié (ex Abeille mini-campagne).
          Côté conseiller : pas de warning, la commission 1,5 % s'affiche
          normalement dans le bloc résultats. Côté manager : warning car
          la rétention cabinet (= upfront − 1,5 %) n'est pas calculable. */}
      {hasValidMontant && !hasUpfront && isManager && (
        <div style={{
          marginTop: 20,
          padding: 14,
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 10,
          fontSize: 12,
          color: '#92400e',
          lineHeight: 1.5,
        }}>
          <strong>⚠ Rétention cabinet non calculable</strong>
          <br />
          Upfront non renseigné pour cette UCS — la commission conseiller (1,5 %)
          reste due. Vérifie la circulaire {ucs?.compagnie === 'SWISSLIFE' ? 'SwissLine' : 'Abeille'}
          {' '}ou demande les conditions au structureur <strong>{ucs?.structureur?.nom || '?'}</strong>
          {' '}pour confirmer la rétention.
        </div>
      )}

      {/* Bloc résultats */}
      {commission && (
        <div style={{
          marginTop: 20,
          padding: 16,
          background: 'linear-gradient(to bottom, rgba(201,169,97,0.06), rgba(201,169,97,0.02))',
          border: '1px solid var(--gold-line, rgba(201,169,97,0.3))',
          borderRadius: 10,
        }}>
          <ResultLine label="Montant placé client" value={fmtEuro(montant)} />
          {/* Upfront total : visible managers seulement (sinon les conseillers
              peuvent calculer la rétention cabinet par soustraction). */}
          {isManager && (
            <>
              <ResultDivider />
              <ResultLine label={`Upfront total (${fmtPct(ucs.upfront)})`} value={fmtEuro(commission.upfrontTotal)} muted />
            </>
          )}

          {/* Ma commission — la ligne hero (or, gras, grand) */}
          <div style={{
            marginTop: 14,
            marginBottom: isManager ? 10 : 0,
            padding: '10px 12px',
            background: '#fff',
            border: '2px solid var(--gold)',
            borderRadius: 8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}>
            <span style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--gold)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              Ma commission (1,5 %)
            </span>
            <span style={{
              fontSize: 22,
              fontWeight: 800,
              color: 'var(--gold)',
              fontFamily: 'var(--font-serif, Georgia, serif)',
            }}>
              {fmtEuro(commission.conseiller)}
            </span>
          </div>

          {/* Rétention cabinet — visible manager seulement */}
          {isManager && (
            <>
              <ResultLine
                label={`Rétention cabinet (${fmtPct(Math.max(0, ucs.upfront - 1.5))})`}
                value={fmtEuro(commission.cabinet)}
                danger={commission.isUnderwater}
              />
              {commission.isUnderwater && (
                <div style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#b91c1c',
                }}>
                  ⚠ UCS non rentable cabinet, validation Louis requise
                </div>
              )}
            </>
          )}

          <ResultDivider />
          <ResultLine
            label={`Coupon annuel client (${couponAnnuelPct != null ? fmtPct(couponAnnuelPct) : '—'})`}
            value={fmtEuro(couponAnnuel)}
            muted
          />
        </div>
      )}

      {/* Sélecteur client + bouton sauvegarder */}
      {commission && (
        <div style={{ marginTop: 16 }}>
          <label style={{
            display: 'block',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--t3)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: 6,
          }}>
            Rattacher à un client (optionnel)
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={selectedClient ? `${selectedClient.nom} ${selectedClient.prenom || ''}`.trim() : clientSearch}
              onChange={e => {
                setClientSearch(e.target.value)
                if (selectedClient) setSelectedClient(null)
              }}
              placeholder="Rechercher un client…"
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: 12,
                border: '1px solid var(--bd)',
                borderRadius: 6,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            {clientResults.length > 0 && !selectedClient && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#fff',
                border: '1px solid var(--bd)',
                borderRadius: 6,
                marginTop: 2,
                maxHeight: 200,
                overflowY: 'auto',
                zIndex: 10,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              }}>
                {clientResults.map(c => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedClient(c)
                      setClientSearch('')
                      setClientResults([])
                    }}
                    style={{
                      padding: '8px 12px',
                      fontSize: 12,
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--bd)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  >
                    <div style={{ fontWeight: 600 }}>{c.nom} {c.prenom}</div>
                    <div style={{ fontSize: 10, color: 'var(--t3)' }}>{c.email} · {c.telephone}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              marginTop: 12,
              width: '100%',
              padding: '12px 16px',
              fontSize: 13,
              fontWeight: 700,
              color: '#fff',
              background: saving ? 'var(--t3)' : 'var(--t1)',
              border: 'none',
              borderRadius: 8,
              cursor: saving ? 'wait' : 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {saving ? 'Enregistrement...' : 'Sauvegarder cette simulation'}
          </button>

          {savedFeedback && (
            <div style={{
              marginTop: 8,
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 500,
              background: savedFeedback.startsWith('Erreur')
                ? 'rgba(239,68,68,0.08)'
                : 'rgba(16,185,129,0.08)',
              color: savedFeedback.startsWith('Erreur') ? '#b91c1c' : '#047857',
              borderRadius: 4,
              textAlign: 'center',
            }}>
              {savedFeedback}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const simulatorTitleStyle = {
  fontSize: 18,
  fontWeight: 700,
  color: 'var(--t1)',
  margin: 0,
  letterSpacing: '-0.005em',
}

const quickBtnStyle = {
  padding: '6px 12px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--t2)',
  background: 'var(--bg)',
  border: '1px solid var(--bd)',
  borderRadius: 6,
  cursor: 'pointer',
}

function CharRow({ label, value, highlight }) {
  return (
    <>
      <span style={{ color: 'var(--t3)', fontWeight: 500 }}>{label}</span>
      <span style={{
        textAlign: 'right',
        fontWeight: highlight ? 700 : 600,
        color: highlight ? 'var(--gold)' : 'var(--t1)',
      }}>{value}</span>
    </>
  )
}

function ResultLine({ label, value, muted, danger }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      padding: '4px 0',
    }}>
      <span style={{
        fontSize: muted ? 11 : 12,
        color: danger ? '#b91c1c' : muted ? 'var(--t3)' : 'var(--t2)',
        fontWeight: 500,
      }}>{label}</span>
      <span style={{
        fontSize: muted ? 12 : 14,
        fontWeight: danger ? 700 : muted ? 500 : 600,
        color: danger ? '#b91c1c' : muted ? 'var(--t3)' : 'var(--t1)',
        fontFamily: 'monospace',
      }}>{value}</span>
    </div>
  )
}

function ResultDivider() {
  return <div style={{ height: 1, background: 'var(--bd)', margin: '6px 0' }} />
}

// ─────────────────────────────────────────────────────────────────────────────
// AdminPanel : import CSV (upload + parse + preview + upsert batch)
// ─────────────────────────────────────────────────────────────────────────────
//
// Format CSV attendu (entête identique à la spec, séparateur virgule) :
//   etat,nom_ucs,code_isin,compagnie,upfront,minimum_requis,coupon_client,
//   constatation,sri,enveloppe_restante,fin_commerc,couleur_badge
//
// On parse côté navigateur (FileReader + parsing CSV simple), on affiche
// une preview des 5 premières lignes + un compteur, puis on upsert via
// ucsService.upsertMany (onConflict: code_isin → idempotent).

function AdminPanel({ onReload }) {
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null)   // { rows, errors }
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)   // { inserted } ou { error }

  const handleFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setParsed(null)
    setResult(null)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = String(evt.target?.result || '')
      const { rows, errors } = parseUcsCsv(text)
      setParsed({ rows, errors })
    }
    reader.onerror = () => {
      setParsed({ rows: [], errors: ['Erreur de lecture du fichier'] })
    }
    reader.readAsText(f, 'utf-8')
  }

  const handleImport = async () => {
    if (!parsed?.rows?.length || importing) return
    setImporting(true)
    setResult(null)
    try {
      const r = await ucsService.upsertMany(parsed.rows)
      setResult({ inserted: r.inserted })
      await onReload?.()
    } catch (e) {
      logger.warn('[UCS] upsertMany failed', e)
      setResult({ error: e.message })
    } finally {
      setImporting(false)
    }
  }

  const handleReset = () => {
    setFile(null)
    setParsed(null)
    setResult(null)
  }

  return (
    <div style={{
      background: '#fff',
      border: `2px solid var(--gold)`,
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 12,
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--t1)' }}>
            Mode administrateur · Import CSV
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--t3)' }}>
            Format attendu : <code style={{ fontSize: 11 }}>etat,nom_ucs,code_isin,compagnie,upfront,minimum_requis,coupon_client,constatation,sri,enveloppe_restante,fin_commerc,couleur_badge</code>
            <br />
            Upsert sur <code>code_isin</code> : idempotent, peut être ré-importé sans créer de doublons.
          </p>
        </div>
        {file && (
          <button onClick={handleReset} style={{
            padding: '6px 12px',
            fontSize: 11,
            background: 'var(--bg)',
            border: '1px solid var(--bd)',
            borderRadius: 6,
            cursor: 'pointer',
          }}>Effacer</button>
        )}
      </div>

      {/* File input */}
      <label style={{
        display: 'inline-block',
        padding: '10px 18px',
        fontSize: 12,
        fontWeight: 600,
        color: '#fff',
        background: 'var(--t1)',
        borderRadius: 8,
        cursor: 'pointer',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}>
        Choisir un fichier CSV
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
      </label>
      {file && (
        <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--t3)' }}>
          {file.name} ({(file.size / 1024).toFixed(1)} ko)
        </span>
      )}

      {/* Preview parse */}
      {parsed && (
        <div style={{
          marginTop: 16,
          padding: 12,
          background: 'var(--bg)',
          borderRadius: 8,
          fontSize: 12,
        }}>
          <div style={{ marginBottom: 8 }}>
            <strong style={{ color: 'var(--t1)' }}>{parsed.rows.length}</strong> lignes valides détectées
            {parsed.errors.length > 0 && (
              <span style={{ marginLeft: 12, color: '#c2410c' }}>
                · {parsed.errors.length} erreur{parsed.errors.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {parsed.errors.length > 0 && (
            <details style={{ marginBottom: 8 }}>
              <summary style={{ cursor: 'pointer', color: '#c2410c', fontSize: 11 }}>
                Voir les erreurs
              </summary>
              <ul style={{ fontSize: 11, color: '#7c2d12', margin: '4px 0', paddingLeft: 18 }}>
                {parsed.errors.slice(0, 10).map((err, i) => <li key={i}>{err}</li>)}
                {parsed.errors.length > 10 && <li>... et {parsed.errors.length - 10} autres</li>}
              </ul>
            </details>
          )}
          {parsed.rows.length > 0 && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--t2)' }}>
                Preview (5 premières lignes)
              </summary>
              <pre style={{
                fontSize: 10,
                margin: '6px 0 0',
                padding: 8,
                background: '#fff',
                borderRadius: 4,
                overflowX: 'auto',
                color: 'var(--t2)',
              }}>
                {JSON.stringify(parsed.rows.slice(0, 5), null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Bouton import */}
      {parsed?.rows?.length > 0 && !result && (
        <button
          onClick={handleImport}
          disabled={importing}
          style={{
            marginTop: 12,
            padding: '10px 20px',
            fontSize: 13,
            fontWeight: 700,
            color: '#fff',
            background: importing ? 'var(--t3)' : 'var(--gold)',
            border: 'none',
            borderRadius: 8,
            cursor: importing ? 'wait' : 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {importing ? 'Import en cours...' : `Importer ${parsed.rows.length} UCS dans Supabase`}
        </button>
      )}

      {/* Résultat */}
      {result && (
        <div style={{
          marginTop: 12,
          padding: 12,
          background: result.error ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
          border: `1px solid ${result.error ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
          borderRadius: 6,
          fontSize: 12,
          color: result.error ? '#b91c1c' : '#047857',
          fontWeight: 600,
        }}>
          {result.error
            ? `Erreur d'import : ${result.error}`
            : `✓ ${result.inserted} UCS importées avec succès`}
        </div>
      )}
    </div>
  )
}

// Parse CSV simple (séparateur virgule, gère les guillemets pour les valeurs
// avec virgule interne). Pas de dépendance externe.
function parseUcsCsv(text) {
  const errors = []
  const rows = []
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) {
    return { rows: [], errors: ['CSV vide ou pas d\'en-tête'] }
  }

  const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase())
  const expected = [
    'etat', 'nom_ucs', 'code_isin', 'compagnie', 'upfront',
    'minimum_requis', 'coupon_client', 'constatation', 'sri',
    'enveloppe_restante', 'fin_commerc', 'couleur_badge',
  ]
  const missing = expected.filter(c => !header.includes(c))
  if (missing.length) {
    return { rows: [], errors: [`Colonnes manquantes : ${missing.join(', ')}`] }
  }

  const idx = Object.fromEntries(expected.map(c => [c, header.indexOf(c)]))

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i])
    try {
      const row = {
        etat: String(cells[idx.etat] || '').trim().toUpperCase(),
        nom_ucs: String(cells[idx.nom_ucs] || '').trim(),
        code_isin: String(cells[idx.code_isin] || '').trim().toUpperCase(),
        compagnie: String(cells[idx.compagnie] || '').trim(),
        upfront: parseFloat(cells[idx.upfront]),
        minimum_requis: parseFloat(cells[idx.minimum_requis]),
        coupon_client: parseFloat(cells[idx.coupon_client]),
        constatation: String(cells[idx.constatation] || '').trim().toUpperCase() || null,
        sri: cells[idx.sri] ? parseInt(cells[idx.sri], 10) : null,
        enveloppe_restante: cells[idx.enveloppe_restante]
          ? parseFloat(cells[idx.enveloppe_restante])
          : null,
        fin_commerc: cells[idx.fin_commerc] || null,
        couleur_badge: cells[idx.couleur_badge] || null,
      }
      // Validations minimales
      if (!['EN_COURS', 'CLOTURE', 'ANNULATION'].includes(row.etat)) {
        errors.push(`Ligne ${i + 1} : etat invalide "${row.etat}"`)
        continue
      }
      if (!row.code_isin || !row.nom_ucs || !row.compagnie) {
        errors.push(`Ligne ${i + 1} : champs requis manquants`)
        continue
      }
      if (isNaN(row.upfront) || isNaN(row.minimum_requis) || isNaN(row.coupon_client)) {
        errors.push(`Ligne ${i + 1} : montants invalides`)
        continue
      }
      rows.push(row)
    } catch (e) {
      errors.push(`Ligne ${i + 1} : ${e.message}`)
    }
  }

  return { rows, errors }
}

// Parse une ligne CSV en gérant les "double quoted" cells (valeurs avec
// virgule interne). Implémentation minimaliste, suffisante pour l'export
// du groupement (pas de quotes échappées internes).
function parseCsvLine(line) {
  const cells = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (c === ',' && !inQuotes) {
      cells.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  cells.push(cur)
  return cells
}

// ─────────────────────────────────────────────────────────────────────────────
// StructureurSidePanel : fiche détail structureur en panel droite (manager only)
// Patch #3 : ouvre au clic sur le chip navy d'une ligne UCS.
// ─────────────────────────────────────────────────────────────────────────────

function StructureurSidePanel({ structureurId, onClose }) {
  const [structureur, setStructureur] = useState(null)
  const [ucsList, setUcsList] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      structureursService.getById(structureurId),
      structureursService.listUcsForStructureur(structureurId),
    ])
      .then(([s, list]) => {
        if (!active) return
        setStructureur(s)
        setUcsList(list)
      })
      .catch(e => logger.warn('[Structureur] load failed', e))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [structureurId])

  const handleMarkContacted = async () => {
    if (saving) return
    setSaving(true)
    try {
      await structureursService.markContactedToday(structureurId)
      const s = await structureursService.getById(structureurId)
      setStructureur(s)
    } catch (e) {
      alert(`Erreur : ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,31,68,0.35)',
        zIndex: 100,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(520px, 92vw)',
          height: '100%',
          background: '#fff',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.15)',
          overflowY: 'auto',
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Fiche structureur
            </div>
            <h2 style={{
              margin: '2px 0 0',
              fontSize: 22,
              fontWeight: 700,
              color: '#0A1F44',
              fontFamily: 'var(--font-serif, Georgia, serif)',
            }}>
              {loading ? 'Chargement…' : structureur?.nom || '?'}
            </h2>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32,
            border: '1px solid var(--bd)',
            borderRadius: 6,
            background: '#fff',
            cursor: 'pointer',
            fontSize: 16,
          }}>×</button>
        </div>

        {!loading && structureur && (
          <>
            {/* Section Identité */}
            <Section title="Identité">
              <KvRow k="Compagnies" v={
                (structureur.compagnies_travaillees || []).length === 0
                  ? <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>—</span>
                  : (
                    <div style={{ display: 'inline-flex', gap: 4 }}>
                      {(structureur.compagnies_travaillees || []).map(c => (
                        <span key={c} style={{
                          padding: '2px 8px',
                          fontSize: 10,
                          fontWeight: 600,
                          borderRadius: 4,
                          background: c === 'SWISSLIFE' ? 'rgba(201,169,97,0.15)' : 'rgba(10,31,68,0.08)',
                          color: c === 'SWISSLIFE' ? '#7c5e1e' : '#0A1F44',
                          letterSpacing: '0.03em',
                        }}>{c}</span>
                      ))}
                    </div>
                  )
              } />
              <KvRow k="Contact principal" v={structureur.contact_principal || '—'} />
              <KvRow k="Email" v={structureur.email
                ? <a href={`mailto:${structureur.email}`} style={{ color: 'var(--gold)' }}>{structureur.email}</a>
                : '—'} />
              <KvRow k="Téléphone" v={structureur.telephone || '—'} />
              <KvRow k="Dernier contact" v={
                structureur.date_dernier_contact
                  ? <span style={{
                      color: daysUntil(structureur.date_dernier_contact) != null
                        && Math.abs(daysUntil(structureur.date_dernier_contact)) > 60
                        ? '#b91c1c' : 'var(--t1)',
                    }}>
                      {fmtDate(structureur.date_dernier_contact)}
                    </span>
                  : <span style={{ color: '#b91c1c' }}>Jamais</span>
              } />
              <div style={{ marginTop: 8 }}>
                <button onClick={handleMarkContacted} disabled={saving} style={{
                  padding: '6px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  background: '#0A1F44',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: saving ? 'wait' : 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}>
                  {saving ? 'Sauvegarde…' : 'Marquer contact aujourd\'hui'}
                </button>
              </div>
            </Section>

            {/* Section UCS au catalogue */}
            <Section title={`UCS au catalogue (${ucsList.length})`}>
              {ucsList.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--t3)', fontStyle: 'italic' }}>
                  Aucune UCS rattachée à ce structureur.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {ucsList.map(u => {
                    const etat = ETATS.find(e => e.value === u.etat)
                    return (
                      <div key={u.id} style={{
                        padding: '8px 10px',
                        background: 'var(--bg)',
                        borderRadius: 6,
                        fontSize: 12,
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                      }}>
                        <span style={{
                          padding: '1px 6px',
                          fontSize: 8,
                          fontWeight: 700,
                          color: '#fff',
                          background: etat?.color || '#666',
                          borderRadius: 8,
                          letterSpacing: '0.04em',
                          whiteSpace: 'nowrap',
                        }}>{etat?.label || u.etat}</span>
                        <span style={{ flex: 1, lineHeight: 1.3 }}>{u.nom_ucs}</span>
                        <span style={{ fontWeight: 700, color: 'var(--t1)', whiteSpace: 'nowrap' }}>
                          {u.upfront != null ? fmtPct(u.upfront) : 'n/a'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>

            {/* Section Notes négociation */}
            <Section title="Notes de négociation">
              <NotesEditor
                structureurId={structureurId}
                initial={structureur.notes_negociation || ''}
                onSaved={async () => {
                  const s = await structureursService.getById(structureurId)
                  setStructureur(s)
                }}
              />
            </Section>
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{
      marginBottom: 20,
      padding: 16,
      background: '#fff',
      border: '1px solid var(--bd)',
      borderRadius: 10,
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--t3)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 10,
      }}>{title}</div>
      {children}
    </div>
  )
}

function KvRow({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', fontSize: 12 }}>
      <span style={{ color: 'var(--t3)' }}>{k}</span>
      <span style={{ color: 'var(--t1)', fontWeight: 500, textAlign: 'right', maxWidth: '65%' }}>{v}</span>
    </div>
  )
}

function NotesEditor({ structureurId, initial, onSaved }) {
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)

  useEffect(() => { setValue(initial) }, [initial])

  const handleSave = async () => {
    if (saving || value === initial) return
    setSaving(true)
    try {
      await structureursService.update(structureurId, { notes_negociation: value })
      setSavedAt(Date.now())
      await onSaved?.()
    } catch (e) {
      alert(`Erreur : ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Conditions négociées, dernières discussions, points d'attention…"
        rows={5}
        style={{
          width: '100%',
          padding: 10,
          fontSize: 12,
          border: '1px solid var(--bd)',
          borderRadius: 6,
          fontFamily: 'inherit',
          resize: 'vertical',
          color: 'var(--t1)',
          outline: 'none',
        }}
      />
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--t3)' }}>
          {savedAt ? '✓ Sauvegardé' : value !== initial ? 'Modifications non sauvegardées' : ''}
        </span>
        <button
          onClick={handleSave}
          disabled={saving || value === initial}
          style={{
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 600,
            color: '#fff',
            background: saving || value === initial ? 'var(--t3)' : 'var(--gold)',
            border: 'none',
            borderRadius: 6,
            cursor: saving || value === initial ? 'default' : 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {saving ? 'Sauvegarde…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}
