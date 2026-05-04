import { describe, it, expect } from 'vitest';
import {
  PASS_2026,
  calcIR,
  getTMI,
  plafondPerSalarie,
  economieFiscaleReelle,
  tauxConversionRente,
  calcRenteMensuelle,
  imposeCapitalUneFois,
  imposeCapitalFractionne,
} from './per-fiscal';

describe('PASS_2026', () => {
  it('vaut 48060 €', () => {
    expect(PASS_2026).toBe(48060);
  });
});

describe('calcIR (barème 2026, 1 part)', () => {
  it('aucun impôt sous le seuil', () => {
    expect(calcIR(11497, 1)).toBe(0);
  });
  it('11% sur la tranche 11 497 - 29 315', () => {
    // 20 000€ → impôt = (20000 - 11497) * 0.11 = 935.33 → 935
    expect(calcIR(20000, 1)).toBe(Math.round((20000 - 11497) * 0.11));
  });
  it('30% sur la tranche 29 315 - 83 823', () => {
    // 50 000€ → 17818*0.11 + (50000-29315)*0.30 = 1960 + 6205.5 = 8165
    const expected = Math.round(17818 * 0.11 + (50000 - 29315) * 0.30);
    expect(calcIR(50000, 1)).toBe(expected);
  });
  it('41% sur la tranche 83 823 - 180 294', () => {
    const expected = Math.round(17818 * 0.11 + 54508 * 0.30 + (120000 - 83823) * 0.41);
    expect(calcIR(120000, 1)).toBe(expected);
  });
  it('quotient familial, 80k 2 parts est moins taxé que 80k 1 part', () => {
    expect(calcIR(80000, 2)).toBeLessThan(calcIR(80000, 1));
  });
  it('renvoie 0 pour revenu négatif ou parts invalides', () => {
    expect(calcIR(-1000, 1)).toBe(0);
    expect(calcIR(50000, 0)).toBe(0);
  });
});

describe('getTMI', () => {
  it('0% sous le seuil', () => {
    expect(getTMI(10000, 1)).toBe(0);
  });
  it('11% à 20k 1 part', () => {
    expect(getTMI(20000, 1)).toBe(0.11);
  });
  it('30% à 50k 1 part', () => {
    expect(getTMI(50000, 1)).toBe(0.30);
  });
  it('41% à 120k 1 part', () => {
    expect(getTMI(120000, 1)).toBe(0.41);
  });
  it('45% au dessus de 180k', () => {
    expect(getTMI(250000, 1)).toBe(0.45);
  });
});

describe('plafondPerSalarie', () => {
  it('minimum = 10% du PASS quand revenu faible', () => {
    expect(plafondPerSalarie(20000)).toBe(PASS_2026 * 0.10);
  });
  it('10% des revenus si dans la fourchette', () => {
    expect(plafondPerSalarie(80000)).toBe(8000);
  });
  it('plafonné à 8 PASS x 10% pour très hauts revenus', () => {
    expect(plafondPerSalarie(500000)).toBe(PASS_2026 * 8 * 0.10);
  });
});

describe('economieFiscaleReelle (fix bug TRI)', () => {
  it('versement sous le plafond, eco fiscale = versement * tmi', () => {
    expect(economieFiscaleReelle(5000, 8000, 0.30)).toBe(1500);
  });
  it('versement sur le plafond, eco fiscale plafonnée', () => {
    // Un avocat verse 12 000€/an au PER avec un plafond de 8 000€ et TMI 41%
    // L\'éco fiscale est limitée à 8000 * 0.41 = 3280
    expect(economieFiscaleReelle(12000, 8000, 0.41)).toBe(8000 * 0.41);
  });
});

describe('tauxConversionRente (fix taux 3.2% arbitraire)', () => {
  it('64 ans → ~4.10%', () => {
    expect(tauxConversionRente(64)).toBeCloseTo(0.0410, 4);
  });
  it('65 ans → ~4.25%', () => {
    expect(tauxConversionRente(65)).toBeCloseTo(0.0425, 4);
  });
  it('70 ans → 5.0%', () => {
    expect(tauxConversionRente(70)).toBeCloseTo(0.0500, 4);
  });
  it('80 ans → 7.0%', () => {
    expect(tauxConversionRente(80)).toBeCloseTo(0.0700, 4);
  });
  it('âges intermédiaires sont interpolés linéairement', () => {
    // 63 ans = entre 62 (3.80%) et 64 (4.10%) -> 3.95%
    expect(tauxConversionRente(63)).toBeCloseTo(0.0395, 4);
  });
  it('clamp aux bornes', () => {
    expect(tauxConversionRente(40)).toBeCloseTo(0.0285, 4);
    expect(tauxConversionRente(95)).toBeCloseTo(0.0700, 4);
  });
});

describe('calcRenteMensuelle', () => {
  it('200k à 64 ans → ~683€/mois (4.10% / 12)', () => {
    // 200000 * 0.041 / 12 = 683.33 → 683
    expect(calcRenteMensuelle(200000, 64)).toBe(Math.round(200000 * 0.041 / 12));
  });
  it('500k à 67 ans → ~1896€/mois', () => {
    expect(calcRenteMensuelle(500000, 67)).toBe(Math.round(500000 * 0.0455 / 12));
  });
});

describe('imposeCapitalUneFois', () => {
  it('versements taxés à l\'IR + plus-values au PFU', () => {
    // 100k versés, 50k plus-values, foyer sans autres revenus 1 part
    const r = imposeCapitalUneFois(100000, 50000, 1, 0);
    // versements imposable = 100000 * 0.9 = 90000, IR sur 90k 1 part
    const irAttendu = calcIR(90000, 1);
    expect(r.impotVersements).toBe(irAttendu);
    // PFU 30% sur 50k = 15000
    expect(r.impotPlusValues).toBe(15000);
    expect(r.impotTotal).toBe(irAttendu + 15000);
  });

  it('si autres revenus, le PER s\'ajoute au revenu imposable', () => {
    const r = imposeCapitalUneFois(50000, 20000, 1, 30000);
    // base = 50000 * 0.9 = 45000. Impôt = IR(75000) - IR(30000)
    const expected = calcIR(75000, 1) - calcIR(30000, 1);
    expect(r.impotVersements).toBe(expected);
  });
});

describe('imposeCapitalFractionne (fix bug fiscal capital fractionné)', () => {
  it('étale l\'imposition sur les années de fractionnement', () => {
    const r = imposeCapitalFractionne(100000, 50000, 1, 0, 10);
    // chaque année, 10000€ versements + 5000€ PV
    // versements imposables après abattement 10% = 9000
    const impotAn = calcIR(9000, 1) + Math.round(5000 * 0.30);
    expect(r.impotAnnuel).toBe(impotAn);
    expect(r.impotTotal).toBe(impotAn * 10);
  });

  it('abattement 10% plafonné à 4123 €', () => {
    // Versements 100k/an (gros PER) → abattement plafonné
    const r = imposeCapitalFractionne(1000000, 0, 1, 0, 10);
    // chaque année 100k versements, abattement 10% = 10000 mais plafonné à 4123
    // donc imposable = 100000 - 4123 = 95877
    const expected = calcIR(95877, 1);
    expect(r.impotVersementsParAn).toBe(expected);
  });

  it('le total fractionné est moins taxant que la sortie en une fois pour un haut revenu', () => {
    // 200k de versements + 100k PV pour quelqu\'un avec 50k autres revenus
    const uneFois = imposeCapitalUneFois(200000, 100000, 1, 50000);
    const fractionne = imposeCapitalFractionne(200000, 100000, 1, 50000, 10);
    // Le fractionné devrait coûter moins en IR car on évite le saut de tranche
    expect(fractionne.impotTotal).toBeLessThan(uneFois.impotTotal);
  });
});
