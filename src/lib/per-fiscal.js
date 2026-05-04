// src/lib/per-fiscal.js
// Helpers fiscaux et financiers utilisés par les simulateurs.
// Fonctions extraites pour pouvoir être testées indépendamment.
// Sources : barème IR 2026 (loi de finances), PASS 2026 = 48 060€,
// tables de mortalité INSEE (taux de conversion en rente viagère).

export const PASS_2026 = 48060;

export const TRANCHES_IR_2026 = [
  { min: 0, max: 11497, taux: 0 },
  { min: 11497, max: 29315, taux: 0.11 },
  { min: 29315, max: 83823, taux: 0.30 },
  { min: 83823, max: 180294, taux: 0.41 },
  { min: 180294, max: Infinity, taux: 0.45 },
];

// Calcule l'impôt sur le revenu via le barème progressif (système du quotient
// familial). Le résultat est arrondi à l'euro le plus proche.
export function calcIR(revenuImposable, parts) {
  if (revenuImposable <= 0 || parts <= 0) return 0;
  const revenuParPart = revenuImposable / parts;
  let impotParPart = 0;
  if (revenuParPart <= 11497) impotParPart = 0;
  else if (revenuParPart <= 29315) impotParPart = (revenuParPart - 11497) * 0.11;
  else if (revenuParPart <= 83823) impotParPart = 17818 * 0.11 + (revenuParPart - 29315) * 0.30;
  else if (revenuParPart <= 180294) impotParPart = 17818 * 0.11 + 54508 * 0.30 + (revenuParPart - 83823) * 0.41;
  else impotParPart = 17818 * 0.11 + 54508 * 0.30 + 96471 * 0.41 + (revenuParPart - 180294) * 0.45;
  return Math.round(impotParPart * parts);
}

// Tranche marginale d'imposition d'un foyer (taux marginal applicable sur
// l'euro suivant).
export function getTMI(revenuImposable, parts) {
  const q = revenuImposable / parts;
  for (let i = TRANCHES_IR_2026.length - 1; i >= 0; i--) {
    if (q > TRANCHES_IR_2026[i].min) return TRANCHES_IR_2026[i].taux;
  }
  return 0;
}

// Plafond de déduction PER d'un travailleur salarié pour l'année courante.
// Min, 10% du PASS. Max, 10% × 8 PASS. Sinon, 10% des revenus pros.
export function plafondPerSalarie(revenuImposable) {
  const min = PASS_2026 * 0.10;
  const max = PASS_2026 * 8 * 0.10;
  return Math.max(min, Math.min(revenuImposable * 0.10, max));
}

// Économie fiscale réelle pour un versement PER, plafonnée par le plafond
// déductible. Si le conseiller verse plus que son plafond, l'excédent ne
// génère pas d'économie (et reste reportable 3 ans, hors scope ici).
export function economieFiscaleReelle(versementAnnuel, plafondDeductible, tmi) {
  const versementDeductible = Math.min(versementAnnuel, plafondDeductible);
  return versementDeductible * tmi;
}

// Taux annuel de conversion d'un capital en rente viagère, en fonction de
// l'âge à la sortie. Approximation basée sur tables de mortalité INSEE
// + taux technique 1.0%, applicable à un assuré sain de la moyenne. Pour
// un calcul précis, l'assureur doit appliquer ses propres tables.
// Source, ordre de grandeur observé chez les assureurs vie (Generali,
// SwissLife) sur des PER en 2025-2026.
const RENTE_RATES = [
  { age: 55, taux: 0.0285 },
  { age: 60, taux: 0.0345 },
  { age: 62, taux: 0.0380 },
  { age: 64, taux: 0.0410 },
  { age: 65, taux: 0.0425 },
  { age: 67, taux: 0.0455 },
  { age: 70, taux: 0.0500 },
  { age: 75, taux: 0.0590 },
  { age: 80, taux: 0.0700 },
];

export function tauxConversionRente(ageRetraite) {
  if (ageRetraite <= RENTE_RATES[0].age) return RENTE_RATES[0].taux;
  if (ageRetraite >= RENTE_RATES[RENTE_RATES.length - 1].age) {
    return RENTE_RATES[RENTE_RATES.length - 1].taux;
  }
  for (let i = 0; i < RENTE_RATES.length - 1; i++) {
    const a = RENTE_RATES[i];
    const b = RENTE_RATES[i + 1];
    if (ageRetraite >= a.age && ageRetraite <= b.age) {
      // interpolation linéaire entre les 2 points
      const ratio = (ageRetraite - a.age) / (b.age - a.age);
      return a.taux + ratio * (b.taux - a.taux);
    }
  }
  return 0.04;
}

// Rente mensuelle viagère brute pour un capital donné et un âge à la sortie.
export function calcRenteMensuelle(capital, ageRetraite) {
  const taux = tauxConversionRente(ageRetraite);
  return Math.round(capital * taux / 12);
}

// Imposition d'une sortie en capital en une fois, post abattement 10%.
// Versements imposés au barème IR (revenu exceptionnel), plus-values au PFU.
export function imposeCapitalUneFois(totalVerse, plusValue, nbParts, autresRevenus = 0) {
  const baseVersementsImposable = totalVerse * 0.9; // abattement 10%
  // Le capital sort une seule année et s'ajoute aux autres revenus.
  const impotSans = calcIR(autresRevenus, nbParts);
  const impotAvec = calcIR(autresRevenus + baseVersementsImposable, nbParts);
  const impotVersements = Math.max(0, impotAvec - impotSans);
  const impotPlusValues = Math.round(plusValue * 0.30); // PFU 30%
  return {
    impotVersements,
    impotPlusValues,
    impotTotal: impotVersements + impotPlusValues,
  };
}

// Imposition d'une sortie en capital fractionné sur N années.
// Chaque année, 1/N du capital sort. La fraction des versements de l'année
// est imposée à l'IR comme un revenu (avec abattement 10% PLAFONNÉ à 4 123€
// en 2026, équivalent du 10% pension, à confirmer avec le contrat).
// La fraction des plus-values est PFU 30%.
export function imposeCapitalFractionne(totalVerse, plusValue, nbParts, autresRevenus = 0, anneesFractionnement = 10) {
  const versementsParAn = totalVerse / anneesFractionnement;
  const plusValueParAn = plusValue / anneesFractionnement;
  // Abattement 10% sur les versements, plafonné à 4 123€ (équivalent 10%
  // pension max 2026)
  const abattement = Math.min(versementsParAn * 0.10, 4123);
  const versementsImposables = versementsParAn - abattement;
  const impotSans = calcIR(autresRevenus, nbParts);
  const impotAvec = calcIR(autresRevenus + versementsImposables, nbParts);
  const impotVersementsParAn = Math.max(0, impotAvec - impotSans);
  const impotPlusValuesParAn = Math.round(plusValueParAn * 0.30);
  return {
    impotVersementsParAn,
    impotPlusValuesParAn,
    impotAnnuel: impotVersementsParAn + impotPlusValuesParAn,
    impotTotal: (impotVersementsParAn + impotPlusValuesParAn) * anneesFractionnement,
  };
}
