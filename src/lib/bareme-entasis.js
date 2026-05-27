// ═══════════════════════════════════════════════════════════════════════════
// BARÈME ENTASIS — Référence canonique du module Rémunération
// Source : barème interne BAREME-CDI-2026 (annexe contrat de travail)
//          + fiches de paie avril 2026 + décisions Louis Hatton (2026-05-25)
//
// CONFIDENTIALITÉ STRICTE
//   Ce fichier contient des politiques de rémunération internes au cabinet.
//   Les conseillers voient UNIQUEMENT leur propre situation dans l'UI.
//   Aucune comparaison inter-conseiller ne doit être exposée en front.
//   Voir RLS Supabase : supabase/migrations/20260525130000_conseiller_contrats.sql
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────
// Constantes générales
// ─────────────────────────────────────────────────────────────────────────

// Frais d'entrée — recommandation cabinet, modifiable par deal
export const FRAIS_ENTREE_DEFAUT_PCT = 1.0

// Date de remise à zéro du compteur de rentabilité (Louis 2026-05-25).
// Tous les contrats CDI/CDD/Alternant/Stagiaire repartent à zéro depuis
// cette date : on ignore le salaire des mois antérieurs ET les deals
// antérieurs pour le calcul du seuil de rentabilité.
// Format ISO YYYY-MM-DD. Mois courant = mai 2026 → compte normalement.
export const DATE_REMISE_A_ZERO_RENTABILITE = '2026-05-01'

// Types de contrats supportés
export const TYPES_CONTRAT = ['CDI', 'CDD', 'ALTERNANT', 'STAGIAIRE', 'MANDATAIRE', 'GERANT']

// Libellés affichables (UI)
export const LIBELLE_TYPE_CONTRAT = {
  CDI:        'CDI',
  CDD:        'CDD',
  ALTERNANT:  'Alternant',
  STAGIAIRE:  'Stagiaire',
  MANDATAIRE: 'Mandataire',
  GERANT:     'Gérant',
}

// Profils contraints par seuil de rentabilité (cf. règle Louis)
// Les autres (mandataires, gérants) ont leur taux fixe sans condition
export const TYPES_AVEC_SEUIL_RENTABILITE = ['CDI', 'CDD', 'ALTERNANT', 'STAGIAIRE']

// ─────────────────────────────────────────────────────────────────────────
// Grille des taux — barème BAREME-CDI-2026
//
// `assiette` indique sur quoi calculer la commission :
//   - 'pp' : PP annualisée (= prime mensuelle × 12)
//   - 'pu' : Prime Unique
//   - 'montant_investi'  : capital investi (immo, défisc)
//   - 'montant_collecte' : capital collecté (SCPI, PE, UCS)
//
// `horsPalier: true` → commission dès le 1er €, indépendant du palier mensuel.
// `horsPalier: false` → commission UNIQUEMENT sur la prod additionnelle
//                       au-delà du palier mensuel PP ou PU.
//
// Les taux exprimés en formule (frais) → fonction qui retourne le %
// final en fonction du frais d'entrée saisi sur le deal (typiquement 1 %).
// ─────────────────────────────────────────────────────────────────────────
export const BAREME_PRODUITS = {
  // Protection sociale / Prévoyance / Mutuelle (PP annualisée, hors palier)
  april: {
    libelle: 'April', categorie: 'protection_sociale', assiette: 'pp', horsPalier: true,
    cdi: () => 6.5, mandataire: () => 13.0,
  },
  swisslife_prev: {
    libelle: 'SwissLife (Prévoyance)', categorie: 'prevoyance', assiette: 'pp', horsPalier: true,
    cdi: () => 5.5, mandataire: () => 11.0,
  },
  spvie: {
    libelle: 'Spvie', categorie: 'protection_sociale', assiette: 'pp', horsPalier: true,
    cdi: () => 6.5, mandataire: () => 13.0,
  },

  // Épargne (PER, AV) — assiette PP annualisée, dépend du palier
  per_swisslife_abeille_n4: {
    libelle: 'PER SwissLife / Abeille N+4', categorie: 'epargne', assiette: 'pp', horsPalier: false,
    cdi: (frais) => frais / 2 + 5,
    mandataire: (frais) => frais + 10,
  },
  per_abeille_n3: {
    libelle: 'PER Abeille N+3', categorie: 'epargne', assiette: 'pp', horsPalier: false,
    cdi: (frais) => frais / 2 + 5,
    mandataire: (frais) => frais + 10,
  },
  av: {
    libelle: 'Assurance Vie', categorie: 'epargne', assiette: 'pp', horsPalier: false,
    cdi: (frais) => frais / 2 + 1,
    mandataire: (frais) => frais + 2,
  },

  // PU (Prime Unique) — palier PU séparé
  // Décision Louis 27/05 : on divise les frais par 2 (CDI touche la moitié
  // du frais d'entrée, mandataire touche tout le frais). Plus simple que
  // l'ancienne formule frais/4+0.5 / frais/2+1.
  pu_versement_libre: {
    libelle: 'PU Versement libre', categorie: 'pu', assiette: 'pu', horsPalier: false,
    cdi: (frais) => frais / 2,
    mandataire: (frais) => frais,
  },
  pu_transfert: {
    libelle: 'PU Transfert', categorie: 'pu', assiette: 'pu', horsPalier: false,
    cdi: (frais) => frais / 4,
    mandataire: (frais) => frais / 2,
  },

  // Immobilier / Défiscalisation / Placements ponctuels — hors palier
  mh: {
    libelle: 'Loi MH (Monuments Historiques)', categorie: 'immobilier', assiette: 'montant_investi', horsPalier: true,
    cdi: () => 1.5, mandataire: () => 3.0,
  },
  girardin: {
    libelle: 'Loi Girardin', categorie: 'defiscalisation', assiette: 'montant_investi', horsPalier: true,
    cdi: () => 1.0, mandataire: () => 2.0,
  },
  scpi: {
    libelle: 'SCPI', categorie: 'pierre_papier', assiette: 'montant_collecte', horsPalier: true,
    cdi: () => 0.75, mandataire: () => 1.5,
  },
  pe: {
    libelle: 'Private Equity', categorie: 'pierre_papier', assiette: 'montant_collecte', horsPalier: true,
    cdi: () => 0.75, mandataire: () => 1.5,
  },
  // UCS — politique interne (barème PDF = 0,5 % / 1 %, mais Louis a tranché 0,75 % / 1,5 %)
  ucs: {
    libelle: 'UCS Produits structurés', categorie: 'pierre_papier', assiette: 'montant_collecte', horsPalier: true,
    cdi: () => 0.75, mandataire: () => 1.5,
  },
}

// ─────────────────────────────────────────────────────────────────────────
// Clause de reprise PP (résiliation client dans les 4 ans)
// Source : page 2 du barème BAREME-CDI-2026
// ─────────────────────────────────────────────────────────────────────────
export const TAUX_REPRISE_PP = {
  // N = année de signature : 100 % acquis (rien à reprendre)
  0: 1.00,
  1: 0.90,  // N+1 : si résil cette année, on reprend 10 %
  2: 0.70,  // N+2 : on reprend 30 %
  3: 0.60,  // N+3 : on reprend 40 %
  4: 0.50,  // N+4 : on reprend 50 %
  // 5+ : 100 % acquis définitivement (pas de reprise)
}

/**
 * Renvoie le taux de % de commission encore "acquis" pour une PP
 * signée il y a `anneesEcoulees` années (en cas de résiliation maintenant).
 * Si résiliation : le variable PP encaissé est repris à hauteur de (1 - taux).
 */
export function tauxAcquisPP(anneesEcoulees) {
  if (anneesEcoulees < 0) return 1.0
  if (anneesEcoulees >= 5) return 1.0
  return TAUX_REPRISE_PP[Math.floor(anneesEcoulees)] ?? 1.0
}

// ─────────────────────────────────────────────────────────────────────────
// Helper : applique le taux à un deal donné selon le contrat du conseiller
// et son seuil de rentabilité.
//
// @param {Object} deal     - { produit, montant, frais_entree_pct }
// @param {Object} contrat  - { type_contrat, rentabilise }
// @returns {number}        - Taux % à appliquer (ex: 1.5 pour 1,5 %)
//
// Règles :
//   • MANDATAIRE / GERANT : toujours taux mandataire
//   • CDI/CDD/Alternant/Stagiaire rentabilisé : taux CDI
//   • CDI/CDD/Alternant/Stagiaire NON rentabilisé : taux mandataire
//     (booster motivation jusqu'à atteinte du seuil)
// ─────────────────────────────────────────────────────────────────────────
export function tauxApplicable(deal, contrat) {
  const produit = BAREME_PRODUITS[deal.produit]
  if (!produit) return 0
  const frais = deal.frais_entree_pct ?? FRAIS_ENTREE_DEFAUT_PCT

  // Mandataire / gérant : toujours taux mandataire
  if (contrat.type_contrat === 'MANDATAIRE' || contrat.type_contrat === 'GERANT') {
    return produit.mandataire(frais)
  }

  // CDI / CDD / Alternant / Stagiaire : selon seuil de rentabilité
  if (contrat.rentabilise) {
    return produit.cdi(frais)
  }
  // Non rentabilisé → bascule taux mandataire (TOUS les produits, cf. Louis)
  return produit.mandataire(frais)
}

// ─────────────────────────────────────────────────────────────────────────
// Helper : convertit une PP mensuelle en PP annualisée
// ─────────────────────────────────────────────────────────────────────────
export const ppAnnualisee = (ppMensuelle) => Number(ppMensuelle || 0) * 12

// ─────────────────────────────────────────────────────────────────────────
// Helper : calcule le brut cumulé d'un contrat pour le SEUIL DE RENTABILITÉ.
// Le point de départ est le maximum entre :
//   • date_debut du contrat (embauche)
//   • DATE_REMISE_A_ZERO_RENTABILITE (consigne Louis 2026-05-25 : on fait
//     abstraction des mois précédant la mise en place du module)
// Cela permet d'éviter d'imposer à un alternant de rembourser 8 mois
// de salaire rétroactifs alors qu'il n'avait pas connaissance du système.
// ─────────────────────────────────────────────────────────────────────────
export function brutCumule(contrat, dateRef = new Date()) {
  if (!contrat?.salaire_brut_mensuel) return 0
  const debutContrat = new Date(contrat.date_debut)
  const remiseZero = new Date(DATE_REMISE_A_ZERO_RENTABILITE)
  // Point de départ effectif = max(date_debut, remise à zéro)
  const debut = debutContrat > remiseZero ? debutContrat : remiseZero
  const fin = contrat.date_fin ? new Date(contrat.date_fin) : dateRef
  const ref = dateRef < fin ? dateRef : fin
  if (ref < debut) return 0
  const moisCumules =
    (ref.getFullYear() - debut.getFullYear()) * 12 +
    (ref.getMonth() - debut.getMonth()) +
    (ref.getDate() >= debut.getDate() ? 1 : 0)
  return Math.max(0, moisCumules) * Number(contrat.salaire_brut_mensuel)
}
