import { describe, it, expect } from 'vitest';
import {
  MONTHS,
  euro,
  pct,
  initials,
  currentMonth,
  getClientName,
  emptyDeal,
  normalizeDeal,
} from './ui-shared';

describe('euro', () => {
  it('formate un montant en EUR français', () => {
    expect(euro(1500)).toBe('1 500 €'); // espace insécable
    expect(euro(0)).toBe('0 €');
    expect(euro(null)).toBe('0 €');
    expect(euro(undefined)).toBe('0 €');
  });
});

describe('pct', () => {
  it('retourne le pourcentage arrondi', () => {
    expect(pct(50, 100)).toBe(50);
    expect(pct(33, 99)).toBe(33);
    expect(pct(150, 100)).toBe(150);
  });
  it('plafonné à 999%', () => {
    expect(pct(99999, 100)).toBe(999);
  });
  it('retourne 0 si target = 0', () => {
    expect(pct(50, 0)).toBe(0);
  });
});

describe('initials', () => {
  it('retourne les initiales en majuscules', () => {
    expect(initials('Louis Hatton')).toBe('LH');
    expect(initials('jean-claude van damme')).toBe('JV');
    expect(initials('Madonna')).toBe('M');
  });
  it('? si nom vide', () => {
    expect(initials('')).toBe('?');
    expect(initials(null)).toBe('?');
  });
});

describe('currentMonth', () => {
  it('retourne un mois français en majuscules', () => {
    expect(MONTHS).toContain(currentMonth());
  });
});

describe('getClientName', () => {
  it('priorité au champ clients.nom (jointure)', () => {
    expect(getClientName({ clients: { nom: 'Marie' }, client: 'old' })).toBe('Marie');
  });
  it('fallback sur client', () => {
    expect(getClientName({ client: 'Pierre' })).toBe('Pierre');
  });
  it('fallback ultime sur Client', () => {
    expect(getClientName({})).toBe('Client');
    expect(getClientName(null)).toBe('Client');
  });
});

describe('emptyDeal', () => {
  it('retourne un deal vierge avec advisor_code optionnel', () => {
    const d = emptyDeal('LH');
    expect(d.advisor_code).toBe('LH');
    expect(d.status).toBe('En cours');
    expect(d.priority).toBe('Normale');
    expect(d.product).toBe('PER Individuel');
    expect(MONTHS).toContain(d.month);
  });
});

describe('normalizeDeal', () => {
  it('convertit pp_m et pu en nombres', () => {
    const d = normalizeDeal({ pp_m: '500', pu: '12000', client_age: '45' });
    expect(d.pp_m).toBe(500);
    expect(d.pu).toBe(12000);
    expect(d.client_age).toBe(45);
  });
  it('client_age null si vide', () => {
    expect(normalizeDeal({ pp_m: 0, pu: 0, client_age: '' }).client_age).toBeNull();
    expect(normalizeDeal({ pp_m: 0, pu: 0, client_age: null }).client_age).toBeNull();
  });
});
