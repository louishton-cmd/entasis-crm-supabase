// ═══════════════════════════════════════════════════════════════════════════
// RÉMUNÉRATION — Onglet conseiller (vue perso) + manager (vue équipe)
//
// Vue conseiller :
//   • Booster motivation : barre de progression palier, écart au seuil
//     de rentabilité, projection si le pipeline signe
//   • Détail des deals du mois en cours
//
// Vue manager :
//   • Tableau équipe complète (un conseiller par ligne)
//   • Alertes sous-palier
//   • Pas de comparaison directe inter-conseillers : chaque ligne montre
//     uniquement la situation du conseiller, pas la moyenne ou un classement
//
// Doc canonique : src/lib/bareme-entasis.js
// Moteur calcul : src/lib/calcul-commission.js
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from 'react'
import * as contratsService from '../services/conseillerContrats'
import { LIBELLE_TYPE_CONTRAT } from '../lib/bareme-entasis'
import {
  commissionsMois,
  evaluerRentabilite,
  dealsDuMois,
  dealsDuConseiller,
  codesContrat,
} from '../lib/calcul-commission'

const fmtEur = (v) => Number(v || 0).toLocaleString('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
})
const fmtEurPrecis = (v) => Number(v || 0).toLocaleString('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 2,
})
const fmtPct = (v) => `${(Number(v || 0)).toFixed(1)} %`

export default function Remuneration({ profile, deals, month }) {
  const isManager = profile?.role === 'manager'
  const [contrats, setContrats] = useState([])
  const [contratPerso, setContratPerso] = useState(null)
  const [loading, setLoading] = useState(true)
  const [vue, setVue] = useState(isManager ? 'manager' : 'perso')

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        if (isManager) {
          const liste = await contratsService.list()
          if (!alive) return
          setContrats(liste)
          // Le manager voit aussi sa propre ligne si elle existe
          const own = liste.find(c => c.profile_id === profile.id) ||
                      liste.find(c => c.full_name?.toLowerCase().includes((profile.full_name || '').toLowerCase()))
          setContratPerso(own || null)
        } else {
          const own = await contratsService.getOwn()
          if (!alive) return
          setContratPerso(own)
        }
      } catch (e) {
        console.error('[Remuneration] load', e)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [isManager, profile?.id, profile?.full_name])

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--t3)' }}>
        Chargement…
      </div>
    )
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <div className="section-kicker">{isManager ? 'Pilotage équipe' : 'Mon mois'}</div>
          <div className="section-title">Rémunération</div>
          <div className="section-sub">
            {isManager
              ? 'Variable de chaque conseiller, palier et seuil de rentabilité.'
              : 'Suivi de ton variable ce mois-ci, ton palier et ton seuil de rentabilité.'}
          </div>
        </div>
        {isManager && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className={`btn ${vue === 'manager' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setVue('manager')}>Vue équipe</button>
            <button
              className={`btn ${vue === 'perso' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setVue('perso')}>Ma vue conseiller</button>
          </div>
        )}
      </div>

      {vue === 'perso' && (
        <VueConseiller
          contrat={contratPerso}
          profile={profile}
          deals={deals}
          month={month}
          isManager={isManager}
        />
      )}

      {vue === 'manager' && isManager && (
        <VueManager
          contrats={contrats}
          deals={deals}
          month={month}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Vue conseiller : son propre suivi
// ─────────────────────────────────────────────────────────────────────────
function VueConseiller({ contrat, profile, deals, month, isManager }) {
  if (!contrat) {
    return (
      <div className="card card-p">
        <div className="empty-title">Aucun contrat trouvé</div>
        <div className="empty-sub" style={{ marginTop: 4 }}>
          {isManager
            ? 'Va dans Pilotage RH pour lier ton profil à un contrat.'
            : 'Demande à ton manager de créer ton contrat dans Pilotage RH.'}
        </div>
      </div>
    )
  }

  // Codes de matching : matricule + full_name + profile.advisor_code.
  // Inclure profile.advisor_code est essentiel — c'est lui qui est
  // stocké dans les deals (deal.advisor_code = 'AUTOP', 'PAULIN', etc.).
  const codesConseiller = useMemo(() => codesContrat(contrat, profile), [contrat, profile])

  // Deals où le conseiller intervient (principal OU co)
  const dealsConseiller = useMemo(
    () => dealsDuConseiller(deals, codesConseiller),
    [deals, codesConseiller]
  )

  const dealsMois = useMemo(
    () => dealsDuMois(dealsConseiller, month),
    [dealsConseiller, month]
  )

  const rentab = useMemo(
    () => evaluerRentabilite(contrat, dealsConseiller, profile),
    [contrat, dealsConseiller, profile]
  )

  const comm = useMemo(
    () => commissionsMois(dealsMois, contrat, rentab.rentabilise, profile),
    [dealsMois, contrat, rentab.rentabilise, profile]
  )

  const salaireFixe = Number(contrat.salaire_brut_mensuel || 0)
  const totalBrut = salaireFixe + comm.total
  const palierPp = Number(contrat.palier_pp_mensuel || 0)
  const palierPu = Number(contrat.palier_pu_mensuel || 0)
  const pctPalierPp = palierPp > 0 ? Math.min(100, (comm.ppRealisee / palierPp) * 100) : 0
  const pctPalierPu = palierPu > 0 ? Math.min(100, (comm.puRealisee / palierPu) * 100) : 0
  const resteAvantPalierPp = Math.max(0, palierPp - comm.ppRealisee)
  const resteAvantPalierPu = Math.max(0, palierPu - comm.puRealisee)

  // Les mandataires ne sont pas salariés : ils facturent Entasis. Pas de
  // salaire fixe, pas de "brut" (ils touchent le net facturé). On adapte
  // les KPIs en conséquence.
  const isMandataire = contrat.type_contrat === 'MANDATAIRE' || contrat.type_contrat === 'GERANT'

  return (
    <div>
      <div className="kpi-grid mb-24">
        {isMandataire ? (
          <>
            {/* Mandataire : pas de fixe ni de brut — ils facturent Entasis */}
            <div className="kpi-card kpi-card-green">
              <div className="kpi-label">Commissions {month}</div>
              <div className="kpi-value">{fmtEur(comm.total)}</div>
              <div className="kpi-hint">{dealsMois.length} dossier{dealsMois.length !== 1 ? 's' : ''} signé{dealsMois.length !== 1 ? 's' : ''}</div>
            </div>
            <div className="kpi-card kpi-card-blue">
              <div className="kpi-label">À facturer ce mois</div>
              <div className="kpi-value">{fmtEur(comm.total)}</div>
              <div className="kpi-hint">{LIBELLE_TYPE_CONTRAT[contrat.type_contrat]} · facture Entasis (net)</div>
            </div>
          </>
        ) : (
          <>
            <div className="kpi-card kpi-card-gold">
              <div className="kpi-label">Salaire fixe brut</div>
              <div className="kpi-value">{fmtEur(salaireFixe)}</div>
              <div className="kpi-hint">{LIBELLE_TYPE_CONTRAT[contrat.type_contrat]} · garanti</div>
            </div>
            <div className="kpi-card kpi-card-green">
              <div className="kpi-label">Variable {month}</div>
              <div className="kpi-value">{fmtEur(comm.total)}</div>
              <div className="kpi-hint">{dealsMois.length} dossier{dealsMois.length !== 1 ? 's' : ''} signé{dealsMois.length !== 1 ? 's' : ''}</div>
            </div>
            <div className="kpi-card kpi-card-blue">
              <div className="kpi-label">Total brut estimé</div>
              <div className="kpi-value">{fmtEur(totalBrut)}</div>
              <div className="kpi-hint">Fixe + variable du mois</div>
            </div>
          </>
        )}
      </div>

      {/* PHASE 1 — Seuil de déclenchement (tous les produits comptent) */}
      {!rentab.rentabilise && salaireFixe > 0 && (
        <PalierCard
          titre="Seuil de déclenchement du variable"
          realise={rentab.valeurCumulee}
          cible={rentab.brutCumule}
          pct={rentab.brutCumule > 0
            ? Math.min(100, (rentab.valeurCumulee / rentab.brutCumule) * 100)
            : 0}
          reste={Math.max(0, rentab.brutCumule - rentab.valeurCumulee)}
          atteint={false}
          variable={0}
          hint={`Plus que ${fmtEur(Math.max(0, rentab.brutCumule - rentab.valeurCumulee))} avant le déclenchement de ton variable. Tous les produits comptent dans ce seuil : PP, PU, SCPI, UCS, MH, Girardin, PE, Prévoyance, Mutuelle.`}
        />
      )}

      {/* PHASE 2 — Paliers PP / PU (une fois rentabilisé) */}
      {rentab.rentabilise && palierPp > 0 && (
        <PalierCard
          titre="Palier PP du mois"
          realise={comm.ppRealisee}
          cible={palierPp}
          pct={pctPalierPp}
          reste={resteAvantPalierPp}
          atteint={comm.palierPpAtteint}
          variable={comm.variablePp}
          hint={comm.palierPpAtteint
            ? 'Tu débloques le variable sur la production additionnelle.'
            : `Plus que ${fmtEur(resteAvantPalierPp)} de PP avant de débloquer ton variable PP.`}
        />
      )}

      {rentab.rentabilise && palierPu > 0 && (
        <PalierCard
          titre="Palier PU du mois"
          realise={comm.puRealisee}
          cible={palierPu}
          pct={pctPalierPu}
          reste={resteAvantPalierPu}
          atteint={comm.palierPuAtteint}
          variable={comm.variablePu}
          hint={comm.palierPuAtteint
            ? 'Tu débloques le variable PU sur la production additionnelle.'
            : `Plus que ${fmtEur(resteAvantPalierPu)} de PU avant de débloquer ton variable PU.`}
        />
      )}

      {/* Détail des deals du mois */}
      <SectionDetail comm={comm} month={month} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Carte palier avec barre de progression
// ─────────────────────────────────────────────────────────────────────────
function PalierCard({ titre, realise, cible, pct, reste, atteint, variable, hint }) {
  return (
    <div className="card card-p" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t3)' }}>{titre}</div>
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--t2)' }}>{hint}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.015em', fontVariantNumeric: 'tabular-nums' }}>
            {fmtEur(realise)} <span style={{ color: 'var(--t3)', fontWeight: 500, fontSize: 14 }}>/ {fmtEur(cible)}</span>
          </div>
          {atteint && variable > 0 && (
            <div style={{ fontSize: 12, color: 'var(--signed)', marginTop: 2 }}>
              Variable débloqué : {fmtEur(variable)}
            </div>
          )}
        </div>
      </div>
      <div style={{ height: 8, background: 'rgba(0,0,0,0.05)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: atteint
            ? 'linear-gradient(90deg, var(--signed) 0%, #2A9847 100%)'
            : 'linear-gradient(90deg, var(--gold) 0%, var(--gold-dk, #A6843F) 100%)',
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Section détail des deals du mois
// ─────────────────────────────────────────────────────────────────────────
function SectionDetail({ comm, month }) {
  if (!comm.detail.length) {
    return (
      <div className="card card-p" style={{ textAlign: 'center', padding: 32 }}>
        <div className="empty-title">Aucun dossier signé ce mois-ci</div>
        <div className="empty-sub" style={{ marginTop: 4 }}>
          Une fois tes dossiers signés en {month}, tu verras le détail ici.
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="panel-head">
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>Détail des dossiers du mois</div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
            {comm.detail.length} dossier{comm.detail.length !== 1 ? 's' : ''} · variable brut : {fmtEur(comm.total)}
          </div>
        </div>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Produit</th>
            <th style={{ textAlign: 'right' }}>Assiette</th>
            <th style={{ textAlign: 'right' }}>Taux</th>
            <th style={{ textAlign: 'right' }}>Commission</th>
            <th>Régime</th>
          </tr>
        </thead>
        <tbody>
          {comm.detail.map((d, i) => {
            const clientName = d.deal.clients
              ? `${d.deal.clients.prenom || ''} ${d.deal.clients.nom || ''}`.trim()
              : (d.deal.client_id || '—')
            // Phase 1 (avant seuil) : aucun variable versé tant que le
            //   seuil mensuel de déclenchement n'est pas franchi.
            // Sous palier : pareil pour les produits soumis au palier.
            const phase1 = d.remboursementSalaire
            const sousPalier = d.sousPalier
            const masqueValeurs = phase1 || sousPalier
            return (
              <tr key={d.deal.id || i}>
                <td className="cell-primary">{clientName || '—'}</td>
                <td>
                  <div>{d.deal.product || d.deal.produit || '—'}</div>
                  <div className="cell-sub">{d.deal.company || d.deal.compagnie || ''}</div>
                </td>
                <td className="cell-mono" style={{ textAlign: 'right' }}>{fmtEur(d.assiette)}</td>
                <td className="cell-mono" style={{ textAlign: 'right', color: masqueValeurs ? 'var(--t3)' : 'var(--t1)' }}>
                  {masqueValeurs ? '—' : fmtPct(d.taux)}
                </td>
                <td className="cell-mono" style={{ textAlign: 'right', fontWeight: 600, color: masqueValeurs ? 'var(--t3)' : 'var(--t1)' }}>
                  {masqueValeurs ? '—' : fmtEurPrecis(d.montantEffectif ?? d.montant)}
                </td>
                <td>
                  {phase1 ? (
                    <span className="badge badge-progress" title="Sous le seuil mensuel de déclenchement du variable">
                      Sous seuil
                    </span>
                  ) : sousPalier ? (
                    <span style={{ color: 'var(--t3)' }}>—</span>
                  ) : d.horsPalier ? (
                    <span className="badge badge-forecast">Hors palier</span>
                  ) : (
                    <span className="badge badge-signed">Au-dessus palier</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Vue manager : tableau équipe
// ─────────────────────────────────────────────────────────────────────────
function VueManager({ contrats, deals, month }) {
  const lignes = useMemo(() => {
    return contrats
      .filter(c => c.actif && c.type_contrat !== 'GERANT')
      .map(c => {
        const codes = codesContrat(c, null)
        const dealsConseiller = dealsDuConseiller(deals, codes)
        const dealsMois = dealsDuMois(dealsConseiller, month)
        const rentab = evaluerRentabilite(c, dealsConseiller)
        const comm = commissionsMois(dealsMois, c, rentab.rentabilise)
        return {
          contrat: c,
          rentab,
          comm,
          totalBrut: Number(c.salaire_brut_mensuel || 0) + comm.total,
        }
      })
  }, [contrats, deals, month])

  const totals = useMemo(() => {
    return {
      fixe: lignes.reduce((s, l) => s + Number(l.contrat.salaire_brut_mensuel || 0), 0),
      variable: lignes.reduce((s, l) => s + l.comm.total, 0),
      total: lignes.reduce((s, l) => s + l.totalBrut, 0),
    }
  }, [lignes])

  return (
    <div>
      {/* KPIs équipe — 3 cartes (le statut rentabilité reste interne au moteur). */}
      <div className="kpi-grid mb-24">
        <div className="kpi-card kpi-card-gold">
          <div className="kpi-label">Masse fixe brute / mois</div>
          <div className="kpi-value">{fmtEur(totals.fixe)}</div>
          <div className="kpi-hint">{lignes.length} conseiller{lignes.length !== 1 ? 's' : ''} actif{lignes.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="kpi-card kpi-card-green">
          <div className="kpi-label">Variable {month}</div>
          <div className="kpi-value">{fmtEur(totals.variable)}</div>
          <div className="kpi-hint">Commissions du mois</div>
        </div>
        <div className="kpi-card kpi-card-blue">
          <div className="kpi-label">Total brut équipe</div>
          <div className="kpi-value">{fmtEur(totals.total)}</div>
          <div className="kpi-hint">Fixe + variable {month}</div>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Conseiller</th>
              <th>Type</th>
              <th style={{ textAlign: 'right' }}>Brut fixe</th>
              <th style={{ textAlign: 'right' }}>PP réalisée</th>
              <th>Palier PP</th>
              <th style={{ textAlign: 'right' }}>Variable {month}</th>
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>
                Aucun conseiller actif. Ajoute des contrats dans Pilotage RH.
              </td></tr>
            ) : lignes.map(l => {
              const palierPp = Number(l.contrat.palier_pp_mensuel || 0)
              const pctPp = palierPp > 0 ? Math.min(100, (l.comm.ppRealisee / palierPp) * 100) : 100
              return (
                <tr key={l.contrat.id}>
                  <td>
                    <div className="cell-primary">{l.contrat.full_name}</div>
                    <div className="cell-sub">{l.contrat.matricule ? `Mat. ${l.contrat.matricule}` : ''}</div>
                  </td>
                  <td>
                    <span className="badge badge-normal">
                      {LIBELLE_TYPE_CONTRAT[l.contrat.type_contrat]}
                    </span>
                  </td>
                  <td className="cell-mono" style={{ textAlign: 'right' }}>{fmtEur(l.contrat.salaire_brut_mensuel)}</td>
                  <td className="cell-mono" style={{ textAlign: 'right' }}>{fmtEur(l.comm.ppRealisee)}</td>
                  <td>
                    {palierPp > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
                        <div style={{ flex: 1, height: 5, background: 'rgba(0,0,0,0.05)', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            width: `${pctPp}%`,
                            background: l.comm.palierPpAtteint ? 'var(--signed)' : 'var(--gold)',
                          }} />
                        </div>
                        <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', minWidth: 40, textAlign: 'right', color: l.comm.palierPpAtteint ? 'var(--signed)' : 'var(--t2)', fontWeight: 600 }}>
                          {pctPp.toFixed(0)}%
                        </span>
                      </div>
                    ) : <span style={{ color: 'var(--t3)', fontSize: 12 }}>—</span>}
                  </td>
                  <td className="cell-mono" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--t1)' }}>{fmtEur(l.comm.total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
