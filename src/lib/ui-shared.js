// src/lib/ui-shared.js
// Constantes et helpers UI partagés entre App.jsx et les composants extraits
// (DealsTable, PipelineBoard, etc.). Tout ce qui était redéclaré in-line
// auparavant.

export const MONTHS = ['JANVIER','FÉVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOÛT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DÉCEMBRE'];
export const STATUS_OPTIONS = ['Signé','En cours','Prévu','Annulé'];
export const PRIORITY_OPTIONS = ['Normale','Haute','Urgente'];
export const PRODUCTS = ['PER Individuel','Assurance Vie Française','SCPI','Produits Structurés','Private Equity','Prévoyance TNS','Mutuelle Santé','Autre'];
export const COMPANIES = ['SwissLife','Abeille Assurances','Generali','Cardif (BNP Paribas)','Spirica','Autre'];
export const SOURCES = ['Téléprospection','Leads Facebook','Parrainage Client','Réseau Personnel','Site Web Entasis','LinkedIn','Autre'];

export const STATUS_CLASS = {
  'Signé': 'badge badge-signed',
  'En cours': 'badge badge-progress',
  'Prévu': 'badge badge-forecast',
  'Annulé': 'badge badge-cancelled',
};
export const PRIORITY_CLASS = {
  'Urgente': 'badge badge-urgent',
  'Haute': 'badge badge-high',
  'Normale': 'badge badge-normal',
};

// ─── Helpers de formatage ───
export const euro = (v) =>
  Number(v || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export const pct = (v, t) =>
  t > 0 ? Math.min(999, Math.round((v / t) * 100)) : 0;

export const initials = (name) =>
  (name || '').split(' ').slice(0, 2).map(n => n[0] || '').join('').toUpperCase() || '?';

export const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `deal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const currentMonth = () => MONTHS[new Date().getMonth()] || 'MARS';

export function getClientName(deal) {
  return deal?.clients?.nom || deal?.client || 'Client';
}

export function emptyDeal(code = '') {
  return {
    id: uid(),
    month: currentMonth(),
    client: '',
    product: 'PER Individuel',
    pp_m: 0,
    pu: 0,
    advisor_code: code || '',
    co_advisor_code: '',
    source: 'Téléprospection',
    status: 'En cours',
    company: '',
    notes: '',
    priority: 'Normale',
    tags: [],
    date_expected: '',
    date_signed: '',
    client_phone: '',
    client_email: '',
    client_age: '',
  };
}

export function normalizeDeal(d) {
  return {
    ...d,
    pp_m: Number(d.pp_m || 0),
    pu: Number(d.pu || 0),
    client_age: d.client_age === '' || d.client_age == null ? null : Number(d.client_age),
  };
}
