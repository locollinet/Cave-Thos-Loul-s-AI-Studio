import type { Wine } from '@/types';
import { norm } from './wine';

export interface WineFilters {
  region: string;
  subRegion: string;
  producer: string;
  color: string;
  country: string;
  vintage: string;
  grapes: string;
  format: string;
  stock: string;
  minQty: string;
  maxQty: string;
  price: 'sellPriceHT' | 'buyPriceHT' | 'menuPriceTTC';
  minPrice: string;
  maxPrice: string;
  apogee: boolean;
  characteristics: string;
}

export const EMPTY_FILTERS: WineFilters = {
  region: '', subRegion: '', producer: '', color: '', country: '', vintage: '',
  grapes: '', format: '', stock: '', minQty: '', maxQty: '',
  price: 'sellPriceHT', minPrice: '', maxPrice: '', apogee: false, characteristics: '',
};

export type WineGroupBy = 'terroir' | 'producer' | 'none';
export type WineSort = 'producer' | 'vintage' | 'qty' | 'price';

export function matchesWine(wine: Wine, qty: number, filters: WineFilters, query = '', year = new Date().getFullYear()): boolean {
  const text = norm([
    wine.producer, wine.name, wine.vintage, wine.region, wine.subRegion, wine.country,
    wine.appellation, wine.cuvee, wine.grapes, wine.ean,
  ].join(' '));
  if (!norm(query).split(/\s+/).filter(Boolean).every((term) => text.includes(term))) return false;
  for (const key of ['region', 'subRegion', 'producer', 'color', 'country', 'vintage'] as const) {
    if (filters[key] && norm(wine[key] ?? '') !== norm(filters[key])) return false;
  }
  if (filters.grapes && !norm(`${wine.grapes ?? ''} ${wine.technicalSheet?.cepage ?? ''}`).includes(norm(filters.grapes))) return false;
  if (filters.format && wine.formatCl !== Number(filters.format)) return false;
  if (filters.stock === 'in' && qty <= 0) return false;
  if (filters.stock === 'low' && !(qty > 0 && qty <= wine.alertThreshold)) return false;
  if (filters.stock === 'out' && qty > 0) return false;
  if (filters.stock === 'normal' && qty <= wine.alertThreshold) return false;
  if (filters.minQty !== '' && qty < Number(filters.minQty)) return false;
  if (filters.maxQty !== '' && qty > Number(filters.maxQty)) return false;
  const price = wine[filters.price];
  if ((filters.minPrice !== '' || filters.maxPrice !== '') && price === undefined) return false;
  if (filters.minPrice !== '' && price !== undefined && price < Number(filters.minPrice)) return false;
  if (filters.maxPrice !== '' && price !== undefined && price > Number(filters.maxPrice)) return false;
  if (filters.apogee && !(wine.apogeeFrom !== undefined && wine.apogeeTo !== undefined && year >= wine.apogeeFrom && year <= wine.apogeeTo)) return false;
  const documented = norm([wine.notes, ...Object.values(wine.technicalSheet ?? {}).filter((v) => typeof v === 'string')].join(' '));
  return norm(filters.characteristics).split(/\s+/).filter(Boolean).every((term) => documented.includes(term));
}

export function filterCount(filters: WineFilters): number {
  return Object.entries(filters).filter(([key, value]) => key !== 'price' && value !== '' && value !== false).length;
}

export interface WineSection {
  key: string;
  title: string;
  wines: Wine[];
  subgroups: { key: string; label: string; wines: Wine[] }[];
}

/**
 * Regroupe une liste déjà triée : par région (intertitres « sous-région · domaine »), par domaine, ou sans groupe.
 * L'ordre des vins à l'intérieur d'un groupe respecte le tri demandé ; les terroirs non renseignés passent en dernier.
 */
export function buildWineSections(wines: Wine[], by: WineGroupBy, unknown: string): WineSection[] {
  if (by === 'none') return [{ key: 'all', title: '', wines, subgroups: [{ key: 'all', label: '', wines }] }];
  const sections = new Map<string, WineSection>();
  for (const w of wines) {
    const title = (by === 'terroir' ? w.region : w.producer)?.trim() || unknown;
    const key = norm(title);
    const section = sections.get(key) ?? { key, title, wines: [], subgroups: [] };
    section.wines.push(w);
    const label = by === 'terroir' ? [w.subRegion?.trim(), w.producer.trim()].filter(Boolean).join(' · ') : '';
    const gk = norm(label);
    let sub = section.subgroups.find((g) => g.key === gk);
    if (!sub) {
      sub = { key: gk, label, wines: [] };
      section.subgroups.push(sub);
    }
    sub.wines.push(w);
    sections.set(key, section);
  }
  const last = norm(unknown);
  return [...sections.values()]
    .sort((a, b) => (a.key === last ? 1 : b.key === last ? -1 : a.title.localeCompare(b.title)))
    .map((s) => ({ ...s, subgroups: s.subgroups.sort((a, b) => a.label.localeCompare(b.label)) }));
}

/** Tri : `reverse` inverse le critère principal (les départages restent alphabétiques). Les prix inconnus restent en fin de liste. */
export function sortWines(wines: Wine[], qty: Map<string, number>, sort: WineSort, price: WineFilters['price'], reverse = false): Wine[] {
  const sign = reverse ? -1 : 1;
  return [...wines].sort((a, b) => {
    let diff = 0;
    if (sort === 'qty') diff = sign * ((qty.get(b.id) ?? 0) - (qty.get(a.id) ?? 0));
    if (sort === 'vintage') diff = sign * b.vintage.localeCompare(a.vintage, undefined, { numeric: true });
    if (sort === 'price') {
      const pa = a[price];
      const pb = b[price];
      diff = pa === undefined || pb === undefined ? (pa === undefined ? 1 : 0) - (pb === undefined ? 1 : 0) : sign * (pa - pb);
    }
    if (sort === 'producer') diff = sign * (a.producer.localeCompare(b.producer) || a.name.localeCompare(b.name));
    return diff || a.producer.localeCompare(b.producer) || a.name.localeCompare(b.name) || a.vintage.localeCompare(b.vintage);
  });
}

export interface SavedView {
  id: string;
  name: string;
  filters: WineFilters;
  q: string;
  group: WineGroupBy;
  sort: WineSort;
}

const viewsKey = (scope: string) => `lt-views:${scope}`;

export function loadViews(scope: string): SavedView[] {
  try {
    const raw = JSON.parse(localStorage.getItem(viewsKey(scope)) ?? '[]');
    return Array.isArray(raw) ? raw.filter((v) => v && typeof v.name === 'string').map((v) => ({ ...v, filters: { ...EMPTY_FILTERS, ...v.filters } })) : [];
  } catch {
    return [];
  }
}

export function saveViews(scope: string, views: SavedView[]): void {
  localStorage.setItem(viewsKey(scope), JSON.stringify(views.slice(0, 20)));
}

/** Raccourcis de sélection courants (cumulables avec les autres filtres). */
export const QUICK_FILTERS: { id: string; patch: Partial<WineFilters> }[] = [
  { id: 'instock', patch: { stock: 'in' } },
  { id: 'alerts', patch: { stock: 'low' } },
  { id: 'apogee', patch: { apogee: true } },
  { id: 'volume', patch: { minQty: '24' } },
];

export const quickActive = (filters: WineFilters, patch: Partial<WineFilters>): boolean =>
  Object.entries(patch).every(([k, v]) => filters[k as keyof WineFilters] === v);
