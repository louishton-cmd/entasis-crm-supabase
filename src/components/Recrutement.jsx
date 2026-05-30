// src/components/Recrutement.jsx
// Module Recrutement — workspace Tally.so + futur kanban des candidatures.
//
// Demandé par Louis 28/05/2026, "nouvel onglet Recrutement juste sous le
// Pilotage RH, on bosse avec https://tally.so/workspaces/wolq6x".
//
// V1, embed iframe + boutons d'action.
// V2 (future), pull des soumissions Tally via API (clé TALLY_API_KEY) et
// affichage d'un kanban (Reçu / Entretien / Recruté / Refusé).

import { useState } from 'react'

const TALLY_WORKSPACE = 'https://tally.so/workspaces/wolq6x'
// Quand on aura la clé Tally, on pourra appeler https://api.tally.so/...
// pour récupérer les soumissions et les afficher proprement.

export default function Recrutement() {
  const [showEmbed, setShowEmbed] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)

  return (
    <div>
      <div className="section-header mb-24">
        <div>
          <div className="section-kicker">Acquisition talents · pilotage</div>
          <div className="section-title">Recrutement 🎯</div>
          <div className="section-sub">
            Workspace Tally · Suivi des candidatures, entretiens et embauches.
          </div>
        </div>
      </div>

      {/* Cards d'accès rapide */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24,
      }}>
        {/* Carte principale Tally */}
        <div className="card" style={{ borderTop: '3px solid #6366F1', padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
              color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 18,
            }}>T</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6366F1' }}>
                Workspace Tally
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>
                Formulaires & soumissions
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 16 }}>
            Tous les formulaires de candidature, les soumissions, les emails automatiques. Connecté au workspace <code style={{ fontSize: 11 }}>wolq6x</code>.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a href={TALLY_WORKSPACE} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
              Ouvrir Tally ↗
            </a>
            <button onClick={() => setShowEmbed(v => !v)} className="btn btn-ghost btn-sm">
              {showEmbed ? '✕ Masquer l\'aperçu' : '👁 Aperçu intégré'}
            </button>
          </div>
        </div>

        {/* Carte processus de recrutement Entasis */}
        <div className="card" style={{ borderTop: '3px solid var(--gold)', padding: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold-dk, #A6843F)', marginBottom: 6 }}>
            Process Entasis
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginBottom: 14 }}>
            Pipeline candidat
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <Step n={1} label="Candidature reçue" color="#6366F1" />
            <Step n={2} label="Filtrage CV + LinkedIn" color="#0EA5E9" />
            <Step n={3} label="Entretien téléphonique (RH)" color="#10B981" />
            <Step n={4} label="Entretien direction" color="#F59E0B" />
            <Step n={5} label="Proposition d'embauche" color="var(--gold-dk, #A6843F)" />
          </div>
        </div>

        {/* Carte stats placeholder — sera remplie par l'API Tally */}
        <div className="card" style={{ borderTop: '3px solid #10B981', padding: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#10B981', marginBottom: 6 }}>
            Activité (à venir)
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)', marginBottom: 14 }}>
            Kanban candidatures
          </div>
          <div style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.6 }}>
            Pour automatiser la récupération des soumissions Tally directement dans le CRM (kanban, filtres, tagging),
            il faut générer une clé API Tally,
            <div style={{ marginTop: 8 }}>
              <a href="https://tally.so/help/developer-resources" target="_blank" rel="noreferrer"
                 style={{ fontSize: 11, color: '#6366F1', fontWeight: 600 }}>
                📖 Doc API Tally ↗
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Aperçu intégré (iframe) */}
      {showEmbed && (
        <div className="card" style={{ overflow: 'hidden', marginBottom: 24 }}>
          <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div className="section-kicker">Aperçu intégré</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
                Workspace Tally — wolq6x
              </div>
              {!iframeLoaded && (
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                  ⏳ Chargement… (Tally peut bloquer l'iframe selon ses paramètres de sécurité, dans ce cas, utilise "Ouvrir Tally ↗")
                </div>
              )}
            </div>
          </div>
          <iframe
            src={TALLY_WORKSPACE}
            title="Tally workspace"
            style={{ width: '100%', height: 720, border: 0, background: '#fff' }}
            onLoad={() => setIframeLoaded(true)}
          />
        </div>
      )}

      {/* Section "Comment ça marche" pour onboarder */}
      <div className="card" style={{ padding: 20, background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#4F46E5', marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          🚀 Mise en route rapide
        </div>
        <ol style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
          <li>Crée un formulaire dans Tally (CV upload + champs métier).</li>
          <li>Publie-le et partage le lien dans tes annonces LinkedIn / Welcome to the Jungle.</li>
          <li>Les candidatures arrivent dans <strong>Tally → Submissions</strong>, exporte-les en CSV ou utilise la vue Tally.</li>
          <li>Quand on aura la clé API Tally, je peux les remonter automatiquement dans un kanban CRM ici-même.</li>
        </ol>
      </div>
    </div>
  )
}

function Step({ n, label, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        background: `${color}20`, color, fontWeight: 700, fontSize: 11,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {n}
      </div>
      <div style={{ color: 'var(--t2)', fontWeight: 500 }}>{label}</div>
    </div>
  )
}
