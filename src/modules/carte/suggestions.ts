import type { Movement, StockLevel, Wine } from '@/types';
import { qtyForSites } from './build';
import type { ListSection, WineList } from './types';

export type SuggestionKind = 'lowStock' | 'pastWindow' | 'dormant' | 'window' | 'margin';
export type SuggestionAction = 'pin' | 'remove' | 'include';

export interface Suggestion {
  id: string; // `${kind}:${wineId}` — sert aussi à mémoriser « ignorer »
  kind: SuggestionKind;
  wineId: string;
  producer: string;
  name: string;
  vintage: string;
  actions: SuggestionAction[];
  qty: number;
  shown: boolean;
  marginHT?: number;
  marginRate?: number;
  apogeeFrom?: number;
  apogeeTo?: number;
  idleDays?: number;
}

export const DORMANT_DAYS = 90;
export const LOW_STOCK_QTY = 2;
export const MARGIN_MIN_RATE = 0.6;
const MAX_MARGIN = 5;
const MAX_PER_KIND = 8;
const DAY = 86_400_000;

/** Ordre d'affichage : urgences d'abord, opportunités ensuite. */
export const SUGGESTION_ORDER: SuggestionKind[] = ['lowStock', 'pastWindow', 'dormant', 'window', 'margin'];

interface Input {
  list: WineList;
  wines: Wine[];
  stock: StockLevel[];
  movements: Movement[];
  sections: ListSection[];
  vatRate: number;
  now?: number;
}

const dayOf = (iso: string): number => {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) ? t : NaN;
};

/**
 * Suggestions de composition, déterministes (sans IA) : une seule par vin, par ordre de priorité.
 * - lowStock : vin affiché avec ≤ 2 bouteilles → retirer de la carte.
 * - pastWindow : apogée dépassée, encore en stock → mettre en avant pour écouler, ou retirer.
 * - dormant : en stock, aucune sortie depuis 90 jours (et détenu depuis au moins 90 jours) → épingler, ou remettre à la carte s'il en est exclu.
 * - window : dans sa fenêtre d'apogée → épingler.
 * - margin : meilleures marges en valeur (taux ≥ 60 %) non épinglées → épingler.
 */
export function computeSuggestions({ list, wines, stock, movements, sections, vatRate, now = Date.now() }: Input): Suggestion[] {
  const qty = qtyForSites(stock, list.siteIds);
  const shown = new Set(sections.flatMap((s) => s.items.map((i) => i.wineId)));
  const bottlePrice = new Map<string, number>();
  for (const s of sections) for (const i of s.items) if (i.priceTTC && i.priceTTC > 0 && !bottlePrice.has(i.wineId)) bottlePrice.set(i.wineId, i.priceTTC);
  const pinned = new Set(list.pinnedWineIds);
  const excluded = new Set(list.excludedWineIds);
  const dismissed = new Set(list.dismissedSuggestions ?? []);
  const year = new Date(now).getFullYear();

  const lastOut = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  for (const m of movements) {
    if (list.siteIds.length && !list.siteIds.includes(m.siteId)) continue;
    const d = dayOf(m.date);
    if (!Number.isFinite(d)) continue;
    if (m.type === 'out') lastOut.set(m.wineId, Math.max(lastOut.get(m.wineId) ?? 0, d));
    firstSeen.set(m.wineId, Math.min(firstSeen.get(m.wineId) ?? Infinity, d));
  }

  const byKind = new Map<SuggestionKind, Suggestion[]>(SUGGESTION_ORDER.map((k) => [k, []]));
  const margins: Suggestion[] = [];
  const base = (w: Wine, n: number) => ({ wineId: w.id, producer: w.producer, name: w.name, vintage: w.vintage, qty: n, shown: shown.has(w.id) });

  for (const w of wines) {
    if (w.isArchived || w.hideFromMenu) continue;
    const n = qty.get(w.id) ?? 0;
    const isShown = shown.has(w.id);
    const isPinned = pinned.has(w.id);
    const candidates: Omit<Suggestion, 'id'>[] = [];

    if (isShown && n <= LOW_STOCK_QTY) candidates.push({ ...base(w, n), kind: 'lowStock', actions: ['remove'] });

    if (n > 0 && w.apogeeTo && year > w.apogeeTo && isShown) {
      candidates.push({ ...base(w, n), kind: 'pastWindow', actions: isPinned ? ['remove'] : ['pin', 'remove'], apogeeFrom: w.apogeeFrom, apogeeTo: w.apogeeTo });
    }

    if (n > 0 && !isPinned && (isShown || excluded.has(w.id))) {
      const since = lastOut.get(w.id) ?? Math.min(firstSeen.get(w.id) ?? Infinity, w.createdAt || Infinity);
      const idleDays = Number.isFinite(since) ? Math.floor((now - since) / DAY) : 0;
      if (idleDays >= DORMANT_DAYS) candidates.push({ ...base(w, n), kind: 'dormant', actions: [isShown ? 'pin' : 'include'], idleDays });
    }

    if (isShown && !isPinned && w.apogeeFrom && w.apogeeTo && year >= w.apogeeFrom && year <= w.apogeeTo) {
      candidates.push({ ...base(w, n), kind: 'window', actions: ['pin'], apogeeFrom: w.apogeeFrom, apogeeTo: w.apogeeTo });
    }

    const pick = candidates.find((c) => !dismissed.has(`${c.kind}:${w.id}`));
    if (pick) {
      byKind.get(pick.kind)?.push({ ...pick, id: `${pick.kind}:${w.id}` });
      continue;
    }

    const price = bottlePrice.get(w.id);
    if (isShown && !isPinned && price && w.buyPriceHT && w.buyPriceHT > 0 && !dismissed.has(`margin:${w.id}`)) {
      const ht = price / (1 + vatRate / 100);
      const marginHT = ht - w.buyPriceHT;
      const marginRate = marginHT / ht;
      if (marginRate >= MARGIN_MIN_RATE) margins.push({ ...base(w, n), id: `margin:${w.id}`, kind: 'margin', actions: ['pin'], marginHT: Math.round(marginHT * 100) / 100, marginRate });
    }
  }

  const label = (s: Suggestion) => `${s.producer} ${s.name} ${s.vintage}`;
  byKind.set('margin', margins.sort((a, b) => (b.marginHT ?? 0) - (a.marginHT ?? 0) || label(a).localeCompare(label(b))).slice(0, MAX_MARGIN));
  return SUGGESTION_ORDER.flatMap((k) => {
    const rows = byKind.get(k) ?? [];
    if (k !== 'margin') rows.sort((a, b) => (k === 'dormant' ? (b.idleDays ?? 0) - (a.idleDays ?? 0) : a.qty - b.qty) || label(a).localeCompare(label(b)));
    return rows.slice(0, MAX_PER_KIND);
  });
}

/** Modification de la carte correspondant à une action d'une suggestion. */
export function applySuggestion(list: WineList, s: Pick<Suggestion, 'id' | 'wineId'>, action: SuggestionAction | 'dismiss'): Partial<WineList> {
  const without = (ids: string[]) => ids.filter((x) => x !== s.wineId);
  switch (action) {
    case 'pin':
      return { pinnedWineIds: [...without(list.pinnedWineIds), s.wineId], excludedWineIds: without(list.excludedWineIds) };
    case 'remove':
      return { excludedWineIds: [...without(list.excludedWineIds), s.wineId], pinnedWineIds: without(list.pinnedWineIds) };
    case 'include':
      return { excludedWineIds: without(list.excludedWineIds) };
    default:
      return { dismissedSuggestions: [...(list.dismissedSuggestions ?? []).filter((x) => x !== s.id), s.id].slice(-200) };
  }
}
