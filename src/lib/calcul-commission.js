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
  DATE_REMISE_A_ZERO_RENTABILITE,
  brutCumule,
} from './bareme-entasis'

/**
 * Mappe un produit de l'UI (deal.product + deal.company) vers une clé
 * du barème BAREME_PRODUITS.
 *
 * Liste UI : 'PER Individuel', 'Assurance Vie Française', 'SCPI',
 *           'Produits Structurés', 'Private Equity', 'Prévoyance TNS',
 *           'Mutuelle Santé', 'Autre'
 *
 * Retourne null si le mapping n'est pas trouvé (commission = 0 par défaut).
 * Note : les colonnes BDD sont en anglais (product, company), pas en
 * français (produit, compagnie).
 */
export function mapProduitDeal(deal) {
  if (!deal) return null
  // Support des deux conventions (anglais BDD + français legacy)
  const produit = (deal.product || deal.produit || '').toLowerCase()
  const compagnie = (deal.company || deal.compagnie || '').toLowerCase()

  // PER (Individuel ET Obligatoire / PERO — Louis 28/05/2026)
  // Le PERO se rémunère au même taux que le PER Individuel côté Entasis.
  // Le check 'per' attrape déjà 'PER Individuel' et 'PERO' (commence par "per").
  if (produit.includes('per') || produit === 'pero') {
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
// Helper : choisit le bon taux de frais d'entrée selon l'assiette du produit.
// Permet aux conseillers de saisir des frais différents pour la PP (versement
// mensuel) et la PU (versement unique) sur le même contrat. Fallback sur
// l'ancienne colonne frais_entree_pct pour les deals créés avant la
// séparation.
function fraisPourProduit(deal, produit) {
  const f = produit?.assiette === 'pu'
    ? deal.frais_entree_pu_pct ?? deal.frais_entree_pct
    : deal.frais_entree_pp_pct ?? deal.frais_entree_pct
  return Number(f ?? FRAIS_ENTREE_DEFAUT_PCT)
}

export function commissionBruteDeal(deal, contrat, part = 1) {
  const produitKey = mapProduitDeal(deal)
  if (!produitKey) {
    return { produitKey: null, assiette: 0, taux: 0, montantPlein: 0, montant: 0, horsPalier: false, part }
  }
  const produit = BAREME_PRODUITS[produitKey]
  const assiette = assietteDeal(deal, produitKey)
  // Ordre de placement / replacement : annule uniquement la commission sur
  // la PARTIE PU (versement unique transféré chez nous, pas de nouveaux
  // frais d'entrée). La PP (versement mensuel programmé) reste commissionnée
  // normalement car c'est un engagement nouveau du client.
  if (deal?.is_ordre_placement && produit.assiette === 'pu') {
    return {
      produitKey, assiette, taux: 0,
      tauxMandataire: true,
      montantPlein: 0, montant: 0,
      horsPalier: produit.horsPalier, part,
      ordrePlacement: true,
    }
  }
  const frais = fraisPourProduit(deal, produit)

  // Mandataire / Gérant : toujours taux mandataire
  // CDI/CDD/Alternant/Stagiaire rentabilisé : taux CDI
  // CDI/CDD/Alternant/Stagiaire NON rentabilisé : taux mandataire (booster)
  let taux
  let tauxMandataire   // true si on applique le taux mandataire (mandataire ou CDI sous seuil)
  if (!TYPES_AVEC_SEUIL_RENTABILITE.includes(contrat?.type_contrat)) {
    taux = produit.mandataire(frais)
    tauxMandataire = true
  } else if (contrat?.rentabilise) {
    taux = produit.cdi(frais)
    tauxMandataire = false
  } else {
    taux = produit.mandataire(frais)
    tauxMandataire = true
  }

  const montantPlein = (assiette * taux) / 100
  const montant = montantPlein * part

  return {
    produitKey,
    assiette,
    taux,
    tauxMandataire,          // flag UI : true = taux mandataire, false = taux CDI
    montantPlein,            // commission qu'aurait reçu un seul conseiller
    montant,                 // commission effective après split co-conseiller
    horsPalier: produit.horsPalier,
    part,
  }
}

/**
 * Helper interne : calcule le taux applicable pour un produit donné selon
 * le contrat (factorise la logique mandataire / CDI / rentabilisé).
 */
function tauxPourProduit(produit, contrat, frais) {
  if (!produit) return 0
  if (!TYPES_AVEC_SEUIL_RENTABILITE.includes(contrat?.type_contrat)) {
    return produit.mandataire(frais)
  }
  if (contrat?.rentabilise) {
    return produit.cdi(frais)
  }
  return produit.mandataire(frais)
}

/**
 * Calcule TOUTES les commissions générées par un deal — gère le cas où un
 * deal a à la fois une PP mensuelle ET un versement unique (PU) — typiquement
 * un PER ou une AV où le client met un capital initial + des versements
 * réguliers. Dans ce cas, on retourne 2 lignes :
 *   1. Commission PP sur le produit principal (PER swisslife, AV, ...)
 *   2. Commission PU sur pu_versement_libre
 *
 * Pour les produits dont l'assiette est déjà PU (SCPI, UCS, MH, etc.), on
 * retourne juste la commission principale, pas de double calcul.
 *
 * @returns {Array} un tableau de calcs (1 ou 2 éléments)
 */
export function commissionsDeal(deal, contrat, part = 1) {
  const main = commissionBruteDeal(deal, contrat, part)
  if (!main.produitKey) return []

  const out = [main]

  // Si le produit principal a une assiette PP ET que le deal a aussi une PU
  // renseignée → ajouter une 2e ligne de commission sur la PU via
  // pu_versement_libre. Sinon une seule ligne.
  const mainProduit = BAREME_PRODUITS[main.produitKey]
  const puMontant = Number(deal.pu || 0)
  if (mainProduit?.assiette === 'pp' && puMontant > 0) {
    const puProduit = BAREME_PRODUITS['pu_versement_libre']
    if (puProduit && deal?.is_ordre_placement) {
      // Ordre de placement : PU non commissionnée (le client a transféré son
      // contrat existant en gestion chez nous, pas de nouveaux frais).
      out.push({
        produitKey: 'pu_versement_libre',
        assiette: puMontant,
        taux: 0,
        tauxMandataire: true,
        montantPlein: 0,
        montant: 0,
        horsPalier: puProduit.horsPalier,
        part,
        ordrePlacement: true,
      })
    } else if (puProduit) {
      const frais = fraisPourProduit(deal, puProduit)   // utilise frais_entree_pu_pct
      const taux = tauxPourProduit(puProduit, contrat, frais)
      // Détermine si on est au taux mandataire ou CDI (même logique que
      // commissionBruteDeal — gardés en sync).
      let tauxMandataire
      if (!TYPES_AVEC_SEUIL_RENTABILITE.includes(contrat?.type_contrat)) {
        tauxMandataire = true
      } else if (contrat?.rentabilise) {
        tauxMandataire = false
      } else {
        tauxMandataire = true
      }
      const montantPlein = (puMontant * taux) / 100
      out.push({
        produitKey: 'pu_versement_libre',
        assiette: puMontant,
        taux,
        tauxMandataire,
        montantPlein,
        montant: montantPlein * part,
        horsPalier: puProduit.horsPalier,
        part,
      })
    }
  }

  return out
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
  // Ordre de placement : annule UNIQUEMENT la partie PU (pas la PP).
  // - Si le produit principal est PU (ex: deal "PU Versement libre") → 0
  // - Si le produit principal est PP → on garde la PP mais on annule le
  //   bonus PU additionnel ci-dessous
  const isOP = !!deal?.is_ordre_placement
  let total = 0
  if (!(isOP && produit.assiette === 'pu')) {
    const frais = fraisPourProduit(deal, produit)
    const taux = produit.mandataire(frais)
    total = (assiette * taux * part) / 100
  }

  // Si le produit principal est PP (PER, AV) et que le deal a aussi une PU,
  // ajouter la valeur cabinet du versement unique via pu_versement_libre
  // (sauf si is_ordre_placement → on annule cette partie).
  const puMontant = Number(deal.pu || 0)
  if (!isOP && produit.assiette === 'pp' && puMontant > 0) {
    const puProduit = BAREME_PRODUITS['pu_versement_libre']
    if (puProduit) {
      const fraisPu = fraisPourProduit(deal, puProduit)
      const tauxPu = puProduit.mandataire(fraisPu)
      total += (puMontant * tauxPu * part) / 100
    }
  }

  return total
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
  // Point de départ effectif = max(date_debut, DATE_REMISE_A_ZERO_RENTABILITE)
  // Cohérent avec brutCumule : on ne compte que la prod signée à partir
  // de cette date.
  const debutContrat = new Date(contrat.date_debut)
  const remiseZero = new Date(DATE_REMISE_A_ZERO_RENTABILITE)
  const debut = debutContrat > remiseZero ? debutContrat : remiseZero
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
 * Règle Louis (2026-05-25) — modèle Entasis en deux phases :
 *
 *   PHASE 1 — Remboursement du salaire (NON RENTABILISÉ)
 *   ────────────────────────────────────────────────────
 *   Tant que la production cumulée du conseiller (évaluée au TAUX
 *   MANDATAIRE = "valeur cabinet") n'a pas remboursé son salaire cumulé
 *   depuis l'embauche, AUCUN variable ne lui est versé. Toutes les
 *   commissions générées servent à rembourser le coût qu'il représente
 *   pour le cabinet. Le conseiller voit chaque deal en "rembourse-
 *   salaire" plutôt qu'en variable réel.
 *
 *   PHASE 2 — Primes (RENTABILISÉ)
 *   ────────────────────────────────
 *   Une fois le salaire cumulé remboursé, on applique le barème CDI
 *   officiel BAREME-CDI-2026 :
 *     • PP (PER, AV) → soumise au palier PP mensuel
 *     • PU (Versement libre, Transfert) → soumise au palier PU mensuel
 *     • HORS PALIER (SCPI, MH, Girardin, PE, UCS, Prévoyance, Mutuelle)
 *       → commissionnés DÈS LE 1er EURO
 *
 *   MANDATAIRES / GÉRANTS
 *   ─────────────────────
 *   Pas de salaire à rembourser → considérés rentabilisés dès la 1re €
 *   → commission immédiate au taux mandataire sur tout.
 *
 * Co-conseiller : assiette + commission divisées par 2.
 *
 * @param {Array}  dealsMois         - Deals signés du mois (principal OU co)
 * @param {Object} contrat           - { type_contrat, palier_pp_mensuel, … }
 * @param {Boolean} rentabilise      - Pré-calculé par evaluerRentabilite()
 *                                     true = phase 2 (primes), false = phase 1
 * @param {Object} profile           - Profile Supabase (pour codes matching)
 * @returns {{ variablePp, variablePu, variableHorsPalier, total,
 *             ppRealisee, puRealisee, palierPpAtteint, palierPuAtteint,
 *             rentabilise, detail }}
 */
export function commissionsMois(dealsMois = [], contrat, rentab, profile = null) {
  // Rétrocompatibilité : si on reçoit un booléen, on le promote en objet
  // { rentabilise } sans ecart (vieux signature). Sinon on attend l'objet
  // complet retourné par evaluerRentabilite() : { rentabilise, brutCumule,
  // valeurCumulee, ecart }.
  const rentabObj = typeof rentab === 'boolean' ? { rentabilise: rentab, ecart: 0 } : (rentab || { rentabilise: false, ecart: 0 })
  const rentabilise = !!rentabObj.rentabilise
  if (!contrat) {
    return {
      variablePp: 0, variablePu: 0, variableHorsPalier: 0, total: 0,
      ppRealisee: 0, puRealisee: 0,
      palierPpAtteint: false, palierPuAtteint: false,
      rentabilise: false,
      detail: [],
    }
  }
  const ctx = { ...contrat, rentabilise }
  // Règle Louis : "du moment qu'il rembourse son salaire il peut débloquer
  // son variable". Donc si le conseiller n'a pas de salaire à rembourser
  // (CDI à 0 €, stagiaire à 0 €, mandataire), pas de palier mensuel non
  // plus → variable déclenché dès le 1er € de production.
  const aucunSalaire = Number(contrat.salaire_brut_mensuel || 0) <= 0
  const palierPp = aucunSalaire ? 0 : Number(contrat.palier_pp_mensuel || 0)
  const palierPu = aucunSalaire ? 0 : Number(contrat.palier_pu_mensuel || 0)
  const codes = codesContrat(contrat, profile)

  let ppRealisee = 0
  let puRealisee = 0
  const detail = []

  // PHASE 1 : si pas rentabilisé, toute la prod sert à rembourser le salaire.
  // Aucun variable versé. Toutes les commissions calculées au taux mandataire
  // (= taux qui sert à la valeur cabinet), montantEffectif = 0.
  if (!rentabilise) {
    for (const deal of dealsMois) {
      const part = partDeal(deal, codes)
      if (!part) continue
      // ctx avec rentabilise=false → mandataire automatiquement
      const calcs = commissionsDeal(deal, { ...contrat, rentabilise: false }, part)
      for (const calc of calcs) {
        if (!calc.produitKey) continue
        const produit = BAREME_PRODUITS[calc.produitKey]
        const assietteEffective = calc.assiette * part
        if (produit.assiette === 'pp' && !produit.horsPalier) ppRealisee += assietteEffective
        else if (produit.assiette === 'pu' && !produit.horsPalier) puRealisee += assietteEffective
        detail.push({
          deal, ...calc, assietteEffective,
          montantEffectif: 0,
          sousPalier: false,
          remboursementSalaire: true,
        })
      }
    }
    return {
      variablePp: 0, variablePu: 0, variableHorsPalier: 0, total: 0,
      ppRealisee, puRealisee,
      palierPpAtteint: false, palierPuAtteint: false,
      rentabilise: false,
      detail,
    }
  }

  // 3. PHASE 2 : rentabilisé → seule la production AU-DESSUS du seuil
  //    cumulé est commissionnée. Les premiers euros de valeur cabinet du
  //    mois qui ont servi à rattraper / rembourser le salaire ne le sont
  //    pas. Décision Louis 27/05.
  //
  // Calcul du ratio :
  //   - valeurMoisTotale = somme(deals du mois : valeur cabinet × part)
  //   - ecart            = excédent valeur cumulée - salaire cumulé
  //                         (inclut déjà la valeur du mois)
  //   - ratio = min(1, ecart / valeurMoisTotale)
  //
  // Si l'ecart >= valeurMoisTotale (le conseiller était déjà largement
  // rentabilisé avant ce mois) → ratio = 1 → 100% du variable versé.
  // Si l'ecart < valeurMoisTotale (le conseiller vient de passer le
  // seuil ce mois) → seule la fraction excédentaire est commissionnée.
  // PHASE 2 — Logique deal-par-deal chronologique (décision Louis 27/05) :
  //
  //   "normalement c 1% là vu qu'il a mis 2% de frais sur le contrat,
  //    ensuite sur les prochaines affaires il passe en divisé par deux"
  //
  // Pour chaque deal du mois trié par date_signed :
  //   • Si le seuil cumulé N'ÉTAIT PAS franchi AVANT ce deal → taux
  //     mandataire (commission non versée, sert au remboursement)
  //   • Si le seuil ÉTAIT déjà franchi → taux CDI, commission versée 100 %
  //
  // Mandataires/gérants : pas de seuil → toujours rentabilisés → taux
  // mandataire sur tous leurs deals (déjà géré par le contexte ctx initial).
  const sansSeuil = !TYPES_AVEC_SEUIL_RENTABILITE.includes(contrat.type_contrat)
  const brutCumule = Number(rentabObj.brutCumule || 0)
  // Valeur cabinet cumulée AVANT le mois courant (= ce qui était déjà
  // remboursé en début de mois). On la déduit du total - ce qui est sur
  // le mois courant.
  const valeurMoisTotale = dealsMois.reduce((sum, deal) => {
    const part = partDeal(deal, codes)
    if (!part) return sum
    return sum + valeurCabinetDeal(deal, part)
  }, 0)
  const valeurAvantCeMois = Math.max(0, Number(rentabObj.valeurCumulee || 0) - valeurMoisTotale)

  let variablePp = 0
  let variablePu = 0
  let variableHorsPalier = 0

  // Tri chronologique des deals du mois (les plus anciens en premier).
  const dealsTries = [...dealsMois].sort((a, b) => {
    const da = a.date_signed ? new Date(a.date_signed).getTime() : 0
    const db = b.date_signed ? new Date(b.date_signed).getTime() : 0
    return da - db
  })

  let cumulCourant = valeurAvantCeMois   // valeur cabinet cumulée, évolue ligne par ligne
  for (const deal of dealsTries) {
    const part = partDeal(deal, codes)
    if (!part) continue
    // On calcule à la fois la version mandataire (référence pour seuil) et CDI
    // (qui s'appliquera pour les deals strictement après franchissement).
    const calcsMandataire = commissionsDeal(deal, { ...contrat, rentabilise: false }, part)
    const calcsCDI = commissionsDeal(deal, { ...contrat, rentabilise: true }, part)
    for (let i = 0; i < calcsMandataire.length; i++) {
      const calcMand = calcsMandataire[i]
      const calcCDI = calcsCDI[i] || calcMand
      if (!calcMand.produitKey) continue
      const produit = BAREME_PRODUITS[calcMand.produitKey]
      // Valeur cabinet de cette ligne = commission au taux mandataire (× part déjà inclus).
      const valeurLigne = calcMand.montant
      const cumulAvant = cumulCourant
      const cumulApres = cumulCourant + valeurLigne
      const assietteEffective = calcMand.assiette * part
      if (produit.assiette === 'pp' && !produit.horsPalier) ppRealisee += assietteEffective
      else if (produit.assiette === 'pu' && !produit.horsPalier) puRealisee += assietteEffective

      let montantEffectif, taux, tauxMandataire, montantBrut, remboursementSalaire
      if (sansSeuil) {
        // Mandataire/gérant : pas de seuil → toujours 100% au taux mandataire
        montantEffectif = calcMand.montant
        taux = calcMand.taux
        tauxMandataire = true
        montantBrut = calcMand.montant
        remboursementSalaire = false
      } else if (cumulApres <= brutCumule) {
        // Cas A — ce deal sert encore à rembourser le salaire (sous seuil)
        montantEffectif = 0
        taux = calcMand.taux
        tauxMandataire = true
        montantBrut = calcMand.montant
        remboursementSalaire = true
      } else if (cumulAvant >= brutCumule) {
        // Cas C — seuil déjà franchi → CDI, commission versée intégralement
        montantEffectif = calcCDI.montant
        taux = calcCDI.taux
        tauxMandataire = false
        montantBrut = calcCDI.montant
        remboursementSalaire = false
      } else {
        // Cas B — CE deal franchit le seuil → variable = excédent au-dessus du seuil
        // (différence entre cumul après et le seuil), pas un % de l'assiette.
        montantEffectif = cumulApres - brutCumule
        taux = calcMand.taux
        tauxMandataire = true
        montantBrut = calcMand.montant
        remboursementSalaire = false
      }

      detail.push({
        deal,
        produitKey: calcMand.produitKey,
        assiette: calcMand.assiette,
        taux,
        tauxMandataire,
        montantPlein: calcMand.montantPlein,
        montant: montantBrut,
        horsPalier: produit.horsPalier,
        part,
        assietteEffective,
        montantEffectif,
        sousPalier: false,
        remboursementSalaire,
      })

      if (produit.horsPalier) variableHorsPalier += montantEffectif
      else if (produit.assiette === 'pp') variablePp += montantEffectif
      else if (produit.assiette === 'pu') variablePu += montantEffectif

      cumulCourant = cumulApres
    }
  }

  return {
    variablePp,
    variablePu,
    variableHorsPalier,
    total: variablePp + variablePu + variableHorsPalier,
    ppRealisee,
    puRealisee,
    palierPpAtteint: true,    // déprécié : conservé pour compat UI, toujours true en phase 2
    palierPuAtteint: true,    // idem
    rentabilise: true,
    detail,
  }
}

/**
 * Filtre les deals signés sur un mois donné.
 *
 * Convention CRM : le mois est en français ("MAI", "JUIN", etc.) et stocké
 * dans `deal.month`. La colonne month a déjà été alignée sur date_signed
 * à la sauvegarde (cf. saveDeal dans App.jsx), donc filtrer sur d.month
 * suffit — c'est exactement ce que fait advisorMetrics dans lib/metrics.js.
 */
export function dealsDuMois(deals, monthStr) {
  if (!deals || !monthStr) return []
  return deals.filter(d => d.status === 'Signé' && d.month === monthStr)
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
