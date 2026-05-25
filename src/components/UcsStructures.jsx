// src/components/UcsStructures.jsx
// Onglet "UCS Produits Structurés" : catalogue + simulateur de commission.
//
// Layout 2 colonnes (60% / 40%) sur desktop, empilé sur mobile.
// La spec complète est dans le brief Louis du 2026-05-25. Cette PR
// pose le squelette ; le catalogue + simulateur arrivent dans les
// PRs suivantes (UCS-3 et UCS-4).
//
// Charte Entasis (cohérente avec styles.css) :
//   - navy   : #0A1F44 (var --t1 / var --navy)
//   - or     : #C9A961 (var --gold)
//   - beige  : #F5EDD8
//   - fond   : var --bg

import { useEffect, useState } from 'react'
import { logger } from '../lib/logger'
import * as ucsService from '../services/ucsStructures'

export default function UcsStructures({ profile }) {
  const isManager = profile?.role === 'manager'
  const [ucs, setUcs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedUcsId, setSelectedUcsId] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    ucsService.listAll()
      .then(data => { if (active) setUcs(data) })
      .catch(e => {
        logger.warn('[UCS] listAll failed', e)
        if (active) setError(e.message || 'Erreur de chargement du catalogue')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const selectedUcs = ucs.find(u => u.id === selectedUcsId) || null

  return (
    <div style={{ padding: '16px 24px 32px', maxWidth: 1600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
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

      {/* États globaux */}
      {loading && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>
          Chargement du catalogue...
        </div>
      )}
      {error && !loading && (
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
        </div>
      )}
      {!loading && !error && ucs.length === 0 && (
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
            <>
              <br />
              <span style={{ fontSize: 12 }}>
                Importez le CSV du groupement via l'interface admin (à venir).
              </span>
            </>
          )}
        </div>
      )}

      {/* Layout principal : sera implémenté dans UCS-3 (catalogue) + UCS-4 (simulateur) */}
      {!loading && !error && ucs.length > 0 && (
        <div className="ucs-layout">
          <div className="ucs-catalogue">
            <p style={{ color: 'var(--t3)', fontSize: 12, fontStyle: 'italic' }}>
              {ucs.length} UCS chargées · Catalogue à venir (UCS-3)
            </p>
          </div>
          <div className="ucs-simulator">
            <p style={{ color: 'var(--t3)', fontSize: 12, fontStyle: 'italic' }}>
              {selectedUcs ? `Sélection : ${selectedUcs.nom_ucs}` : 'Aucune UCS sélectionnée'}
              {' · Simulateur à venir (UCS-4)'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
