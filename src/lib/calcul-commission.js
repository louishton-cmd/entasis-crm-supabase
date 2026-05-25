// ═══════════════════════════════════════════════════════════════════════════
// MOTEUR DE CALCUL DE COMMISSION — Module Rémunération
//
// Fonctions pures, sans dépendance React/Supabase, testables unitairement.
// Source des règles : barème BAREME-CDI-2026 + décisions Louis Hatton.
// Doc canonique : src/lib/bareme-entasis.js
//
// CONFIDENTIALITÉ STRICTE
//   Tous les calculs s'appuient sur le contrat du conseiller concerné.
//   Aucune comparaison inter-conseiller n'est exposée par ces helpers.
// ═══════════════════════════════════════════════════════════════════════════

import {
  BAREME_PRODUITS,
  FRAIS_ENTREE_DEFAUT_PCT,
  TYPES_AVEC_SEUIL_RENTABILITE,
  brutCumule,
} from './bareme-entasis'

/**
 * Mappe un produit de l'UI (deal.produit + deal.compagnie) vers une clé
 * du barème BAREME_PRODUITS.
 *
 * Liste UI : 'PER Individuel', 'Assurance Vie Française', 'SCPI',
 *           'Produits Structurés', 'Private Equity', 'Prévoyance TNS',
 *           'Mutuelle Santé', 'Autre'
 *
 * Retourne null si le mapping n'est pas trouvé (commission = 0 par défaut).
 */
export function mapProduitDeal(deal) {
  if (!deal) return null
  const produit = (deal.produit || '').toLowerCase()
  const compagnie = (deal.compagnie || '').toLowerCase()

  // PER
  if (produit.includes('per')) {
    // On prend par défaut SwissLife / Abeille N+4 (taux le plus généreux)
    // Faute de tracking explicite N+3 vs N+4 sur les deals existants.
    return 'per_swisslife_abeille_n4'
  }

  // Assurance Vie
  if (produit.includes('assurance vie') || produit === 'av') {
    return 'av'
  }

  // SCPI
  if (produit.includes('scpi')) return 'scpi'

  // Produits structurés / UCS
  if (produit.includes('structur') || produit === 'ucs') return 'ucs'

  // Private Equity
  if (produit.includes('private equity') || produit === 'pe') return 'pe'

  // Prévoyance / Mutuelle — dépend de la compagnie
  if (produit.includes('prévoyance') || produit.includes('prevoyance') ||
      produit.includes('mutuelle') || produit.includes('santé')) {
    if (compagnie.includes('april')) return 'april'
    if (compagnie.includes('swiss')) return 'swisslife_prev'
    if (compagnie.includes('spvie')) return 'spvie'
    // Par défaut : SwissLife (taux le plus bas, conservatrice)
    return 'swisslife_prev'
  }

  // Immobilier MH / Girardin — pas dans la liste PRODUCTS de l'UI actuelle,
  // on les expose via le module Immo dédié et leurs deals utilisent
  // d'autres tables. On les laisse mappables si jamais ils apparaissent.
  if (produit.includes('monument') || produit === 'mh') return 'mh'
  if (produit.includes('girardin')) return 'girardin'

  return null
}

/**
 * Détermine l'assiette monétaire d'un deal pour le calcul commission.
 * Selon le produit, on prend la PP annualisée ou la PU.
 */
export function assietteDeal(deal, produitKey) {
  if (!deal || !produitKey) return 0
  const produit = BAREME_PRODUITS[produitKey]
  if (!produit) return 0

  switch (produit.assiette) {
    case 'pp':
      return Number(deal.pp_m || 0) * 12
    case 'pu':
      return Number(deal.pu || 0)
    case 'montant_investi':
    case 'montant_collecte':
      // Pour ces produits hors palier, on prend la PU si renseignée, sinon
      // la pp_m × 12. Adapter si une colonne `montant_investi` arrive plus tard.
      return Number(deal.pu || 0) || Number(deal.pp_m || 0) * 12
    default:
      return 0
  }
}

/**
 * Calcule la commission brute d'un deal pour un contrat donné, en supposant
 * que le seuil de rentabilité a déjà été évalué (`contrat.rentabilise`).
 *
 * Si le deal a un co-conseiller, la commission est divisée par 2. Le caller
 * doit indiquer la `part` (0.5 si co-conseiller présent, 1 sinon) — calculée
 * via partDeal() ci-dessous.
 *
 * @param {Object} deal     - { produit, compagnie, pp_m, pu, frais_entree_pct,
 *                              advisor_code, co_advisor_code }
 * @param {Object} contrat  - { type_contrat, rentabilise }
 * @param {number} part     - 0.5 si co-conseiller, 1 sinon (default: 1)
 * @returns {{ produitKey, assiette, taux, montantPlein, montant, horsPalier, part }}
 */
export function commissionBruteDeal(deal, contrat, part = 1) {
  const produitKey = mapProduitDeal(deal)
  if (!produitKey) {
    return { produitKey: null, assiette: 0, taux: 0, montantPlein: 0, montant: 0, horsPalier: false, part }
  }
  const produit = BAREME_PRODUITS[produitKey]
  const assiette = assietteDeal(deal, produitKey)
  const frais = Number(deal.frais_entree_pct ?? FRAIS_ENTREE_DEFAUT_PCT)

  // Mandataire / Gérant : toujours taux mandataire
  // CDI/CDD/Alternant/Stagiaire rentabilisé : taux CDI
  // CDI/CDD/Alternant/Stagiaire NON rentabilisé : taux mandataire (booster)
  let taux
  if (!TYPES_AVEC_SEUIL_RENTABILITE.includes(contrat?.type_contrat)) {
    taux = produit.mandataire(frais)
  } else if (contrat?.rentabilise) {
    taux = produit.cdi(frais)
  } else {
    taux = produit.mandataire(frais)
  }

  const montantPlein = (assiette * taux) / 100
  const montant = montantPlein * part

  return {
    produitKey,
    assiette,
    taux,
    montantPlein,            // commission qu'aurait reçu un seul conseiller
    montant,                 // commission effective après split co-conseiller
    horsPalier: produit.horsPalier,
    part,
  }
}

/**
 * Détermine la part de commission qui revient à un conseiller donné sur
 * un deal. Règle : si un co-conseiller est renseigné, la commission est
 * divisée 50/50 entre le conseiller principal et le co. Sinon le principal
 * touche 100 %.
 *
 * Le code passé peut matcher soit le matricule, soit le full_name du
 * contrat (résilience face aux conventions de saisie).
 *
 * @param {Object} deal
 * @param {string|string[]} codes - code(s) à tester (advisor_code ou full_name)
 * @returns {number} 0 (pas concerné), 0.5 (split) ou 1 (seul)
 */
export function partDeal(deal, codes) {
  const list = Array.isArray(codes) ? codes : [codes]
  const norm = (s) => (s || '').toString().trim().toUpperCase()
  const codesNorm = list.map(norm).filter(Boolean)
  const principal = norm(deal.advisor_code)
  const co = norm(deal.co_advisor_code)
  const isPrincipal = codesNorm.includes(principal)
  const isCo = co && codesNorm.includes(co)
  if (!isPrincipal && !isCo) return 0
  if (co) return 0.5
  return 1
}

/**
 * Codes potentiels d'un contrat (matricule + full_name + advisor_code éventuel
 * stocké dans le profile). Sert au matching avec deal.advisor_code /
 * deal.co_advisor_code.
 */
export function codesContrat(contrat, profile) {
  const out = []
  if (contrat?.matricule) out.push(contrat.matricule)
  if (contrat?.full_name) out.push(contrat.full_name)
  if (profile?.advisor_code) out.push(profile.advisor_code)
  return out
}

/**
 * "Valeur cabinet" d'un deal : ce qu'il rapporterait au cabinet si le
 * conseiller était mandataire (= taux maximum). Sert au calcul du seuil
 * de rentabilité. Multiplié par `part` (0.5 si co-conseiller, 1 sinon)
 * pour évaluer la contribution réelle d'un conseiller donné.
 */
export function valeurCabinetDeal(deal, part = 1) {
  const produitKey = mapProduitDeal(deal)
  if (!produitKey) return 0
  const produit = BAREME_PRODUITS[produitKey]
  const assiette = assietteDeal(deal, produitKey)
  const frais = Number(deal.frais_entree_pct ?? FRAIS_ENTREE_DEFAUT_PCT)
  const taux = produit.mandataire(frais)
  return (assiette * taux * part) / 100
}

/**
 * Calcule si un conseiller est "rentabilisé" à une date donnée.
 *
 * Règle Louis : un CDI/CDD/Alternant/Stagiaire est rentabilisé si la
 * valeur cumulée de sa production (au taux mandataire) depuis son embauche
 * dépasse le brut cumulé qu'il a touché sur la même période.
 *
 * Les mandataires et gérants sont toujours considérés "rentabilisés"
 * (ils n'ont pas de seuil applicable).
 *
 * Les deals avec co-conseiller comptent à 50 % pour la valeur cabinet
 * de chaque conseiller (split commission).
 *
 * @param {Object} contrat
 * @param {Array}  dealsHistoriques  - Deals signés où le conseiller est
 *                                     principal OU co
 * @param {Object} profile           - Profile Supabase (pour advisor_code)
 * @param {Date}   dateRef           - Date de référence (default: maintenant)
 * @returns {{ rentabilise: boolean, brutCumule, valeurCumulee, ecart }}
 */
export function evaluerRentabilite(contrat, dealsHistoriques = [], profile = null, dateRef = new Date()) {
  if (!contrat) {
    return { rentabilise: false, brutCumule: 0, valeurCumulee: 0, ecart: 0 }
  }
  if (!TYPES_AVEC_SEUIL_RENTABILITE.includes(contrat.type_contrat)) {
    return { rentabilise: true, brutCumule: 0, valeurCumulee: 0, ecart: 0 }
  }
  // Stagiaire à 0 € : aucun coût → toujours rentabilisé dès le 1er €
  if (Number(contrat.salaire_brut_mensuel || 0) <= 0) {
    return { rentabilise: true, brutCumule: 0, valeurCumulee: 0, ecart: 0 }
  }

  const brut = brutCumule(contrat, dateRef)
  const debut = new Date(contrat.date_debut)
  const codes = codesContrat(contrat, profile)
  const valeur = dealsHistoriques.reduce((sum, deal) => {
    if (!deal.date_signed) return sum
    const ds = new Date(deal.date_signed)
    if (ds < debut || ds > dateRef) return sum
    if (deal.status !== 'Signé') return sum
    const part = partDeal(deal, codes)
    if (!part) return sum
    return sum + valeurCabinetDeal(deal, part)
  }, 0)

  return {
    rentabilise: valeur >= brut,
    brutCumule: brut,
    valeurCumulee: valeur,
    ecart: valeur - brut,                // positif si rentabilisé, négatif si pas
  }
}

/**
 * Calcule la commission totale d'un mois pour un conseiller.
 *
 * Logique :
 *   1. Sépare les deals du mois en 3 groupes :
 *      - PP (produits avec assiette pp, hors palier=false) : PER, AV
 *      - PU (produits avec assiette pu, hors palier=false) : PU libre/transfert
 *      - Hors palier : SCPI, MH, Girardin, PE, UCS, Prév., Mutuelle
 *   2. PP : si total PP du mois >= palier_pp → variable sur l'EXCÉDENT seulement
 *      Sinon : 0 variable PP (le fixe couvre)
 *   3. PU : pareil avec palier_pu
 *   4. Hors palier : commission dès le 1er € quoi qu'il arrive
 *
 * Co-conseiller : si un deal en a un, l'assiette et la commission sont
 * comptées à 50 % pour chacun des deux conseillers (split équitable).
 *
 * Pour les mandataires (palier=0), tout est traité comme hors palier.
 *
 * @param {Array}  dealsMois         - Deals signés du mois (principal OU co)
 * @param {Object} contrat           - { type_contrat, palier_pp_mensuel, … }
 * @param {Boolean} rentabilise      - Pré-calculé par evaluerRentabilite()
 * @param {Object} profile           - Profile Supabase (pour codes matching)
 * @returns {{ variablePp, variablePu, variableHorsPalier, total,
 *             ppRealisee, puRealisee, palierPpAtteint, palierPuAtteint, detail }}
 */
export function commissionsMois(dealsMois = [], contrat, rentabilise, profile = null) {
  if (!contrat) {
    return {
      variablePp: 0, variablePu: 0, variableHorsPalier: 0, total: 0,
      ppRealisee: 0, puRealisee: 0,
      palierPpAtteint: false, palierPuAtteint: false,
      detail: [],
    }
  }
  const ctx = { ...contrat, rentabilise }
  const palierPp = Number(contrat.palier_pp_mensuel || 0)
  const palierPu = Number(contrat.palier_pu_mensuel || 0)
  const codes = codesContrat(contrat, profile)

  // 1. Agrégation par catégorie. L'assiette retenue pour évaluer le palier
  //    est elle aussi divisée par 2 en cas de co-conseiller (sinon Alexis
  //    et Paulin "ensemble" toucheraient chacun le palier full après 17 k
  //    de PP, ce qui doublerait la production reconnue).
  let ppRealisee = 0
  let puRealisee = 0
  let variableHorsPalier = 0
  const detail = []

  for (const deal of dealsMois) {
    const part = partDeal(deal, codes)
    if (!part) continue
    const calc = commissionBruteDeal(deal, ctx, part)
    if (!calc.produitKey) continue
    const produit = BAREME_PRODUITS[calc.produitKey]
    const assietteEffective = calc.assiette * part
    if (produit.assiette === 'pp' && !produit.horsPalier) {
      ppRealisee += assietteEffective
    } else if (produit.assiette === 'pu' && !produit.horsPalier) {
      puRealisee += assietteEffective
    } else {
      // Hors palier : commission immédiate
      variableHorsPalier += calc.montant
    }
    detail.push({ deal, ...calc, assietteEffective })
  }

  // 2. Variable PP : sur l'excédent au-dessus du palier
  let variablePp = 0
  const palierPpAtteint = palierPp <= 0 || ppRealisee >= palierPp
  if (palierPpAtteint && ppRealisee > palierPp) {
    // On calcule le variable comme si tous les deals PP avaient été pris,
    // mais en n'appliquant le taux que sur la partie ABOVE palier.
    // Approche : ratio (ppRealisee - palierPp) / ppRealisee
    const ratio = palierPp > 0 ? (ppRealisee - palierPp) / ppRealisee : 1
    for (const d of detail) {
      const produit = BAREME_PRODUITS[d.produitKey]
      if (produit.assiette === 'pp' && !produit.horsPalier) {
        variablePp += d.montant * ratio
      }
    }
  }

  // 3. Variable PU : idem
  let variablePu = 0
  const palierPuAtteint = palierPu <= 0 || puRealisee >= palierPu
  if (palierPuAtteint && puRealisee > palierPu) {
    const ratio = palierPu > 0 ? (puRealisee - palierPu) / puRealisee : 1
    for (const d of detail) {
      const produit = BAREME_PRODUITS[d.produitKey]
      if (produit.assiette === 'pu' && !produit.horsPalier) {
        variablePu += d.montant * ratio
      }
    }
  }

  return {
    variablePp,
    variablePu,
    variableHorsPalier,
    total: variablePp + variablePu + variableHorsPalier,
    ppRealisee,
    puRealisee,
    palierPpAtteint,
    palierPuAtteint,
    detail,
  }
}

/**
 * Filtre les deals signés sur un mois donné (YYYY-MM).
 */
export function dealsDuMois(deals, monthStr) {
  if (!deals || !monthStr) return []
  return deals.filter(d => {
    if (d.status !== 'Signé') return false
    const ds = d.date_signed || d.date
    if (!ds) return false
    return String(ds).slice(0, 7) === monthStr
  })
}

/**
 * Filtre les deals concernant un conseiller, soit en tant que principal,
 * soit en tant que co-conseiller. Le matching est insensible à la casse.
 *
 * @param {Array} deals
 * @param {string|string[]} codes - code(s) du conseiller (matricule, full_name,
 *                                  advisor_code...)
 */
export function dealsDuConseiller(deals, codes) {
  if (!deals || !codes) return []
  const list = Array.isArray(codes) ? codes : [codes]
  const norm = (s) => (s || '').toString().trim().toUpperCase()
  const codesNorm = list.map(norm).filter(Boolean)
  if (codesNorm.length === 0) return []
  return deals.filter(d => {
    const a = norm(d.advisor_code)
    const c = norm(d.co_advisor_code)
    return codesNorm.includes(a) || (c && codesNorm.includes(c))
  })
}
