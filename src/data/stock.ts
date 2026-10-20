import type { Movement, MovementReason, MovementType, StockLevel, Wine } from '@/types';
import type { Op } from './store';
import { uid, today } from '@/lib/utils';
import { wineLabel } from '@/lib/wine';

export const stockId = (wineId: string, siteId: string) => `${wineId}__${siteId}`;

export interface MovementInput {
  wine: Pick<Wine, 'id' | 'producer' | 'name' | 'vintage' | 'formatCl'>;
  siteId: string;
  toSiteId?: string;
  type: MovementType;
  qty: number; // positif ; pour 'adjust', delta signé
  reason: MovementReason;
  date?: string;
  unitCostHT?: number;
  unitPriceHT?: number;
  partnerId?: string;
  documentId?: string;
  note?: string;
}

export interface Actor {
  userId: string;
  userName: string;
}

/** Variation de stock par site induite par un mouvement. */
export function stockDeltas(m: Pick<MovementInput, 'type' | 'qty' | 'siteId' | 'toSiteId'>): { siteId: string; delta: number }[] {
  switch (m.type) {
    case 'in':
      return [{ siteId: m.siteId, delta: m.qty }];
    case 'out':
      return [{ siteId: m.siteId, delta: -m.qty }];
    case 'adjust':
      return [{ siteId: m.siteId, delta: m.qty }];
    case 'transfer':
      return m.toSiteId ? [{ siteId: m.siteId, delta: -m.qty }, { siteId: m.toSiteId, delta: m.qty }] : [];
  }
}

/** Vérifie qu'aucun mouvement ne produit un stock négatif. Lève une erreur si le stock est insuffisant. */
export function assertStockAvailability(stock: StockLevel[], inputs: MovementInput[]): void {
  const sim = new Map<string, number>();
  for (const s of stock) sim.set(stockId(s.wineId, s.siteId), s.qty);
  for (const m of inputs) {
    for (const d of stockDeltas(m)) {
      const key = stockId(m.wine.id, d.siteId);
      const cur = sim.get(key) ?? 0;
      const next = cur + d.delta;
      if (next < 0) {
        throw new Error(`Stock insuffisant pour ${wineLabel(m.wine)} sur ce site (disponible : ${cur}, demandé : ${Math.abs(d.delta)})`);
      }
      sim.set(key, next);
    }
  }
}

/** Construit les écritures atomiques (mouvement immuable + incréments de stock). */
export function buildMovementOps(orgId: string, inputs: MovementInput[], actor: Actor, now = Date.now(), currentStock?: StockLevel[]): Op[] {
  if (currentStock) {
    assertStockAvailability(currentStock, inputs);
  }
  const ops: Op[] = [];
  for (const m of inputs) {
    if (!m.qty || (m.type === 'transfer' && (!m.toSiteId || m.toSiteId === m.siteId))) continue;
    const id = uid();
    const mv: Movement = {
      id,
      date: m.date ?? today(),
      wineId: m.wine.id,
      wineLabel: wineLabel(m.wine),
      siteId: m.siteId,
      toSiteId: m.toSiteId,
      type: m.type,
      qty: m.qty,
      reason: m.type === 'transfer' ? 'transfert' : m.reason,
      unitCostHT: m.unitCostHT,
      unitPriceHT: m.unitPriceHT,
      partnerId: m.partnerId,
      documentId: m.documentId,
      note: m.note,
      userId: actor.userId,
      userName: actor.userName,
      createdAt: now,
    };
    ops.push({ op: 'set', path: `orgs/${orgId}/movements/${id}`, data: stripUndefined(mv) });
    for (const d of stockDeltas(m)) {
      ops.push({
        op: 'inc',
        path: `orgs/${orgId}/stock/${stockId(m.wine.id, d.siteId)}`,
        field: 'qty',
        by: d.delta,
        data: { id: stockId(m.wine.id, d.siteId), wineId: m.wine.id, siteId: d.siteId, updatedAt: now },
      });
    }
  }
  return ops;
}

const stripUndefined = <T extends object>(o: T): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/* ------------------------------------------------------------ agrégats */

export const qtyAt = (stock: StockLevel[], wineId: string, siteId: string | 'all'): number =>
  stock.reduce((n, s) => (s.wineId === wineId && (siteId === 'all' || s.siteId === siteId) ? n + s.qty : n), 0);

export function stockByWine(stock: StockLevel[], siteId: string | 'all'): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of stock) if (siteId === 'all' || s.siteId === siteId) m.set(s.wineId, (m.get(s.wineId) ?? 0) + s.qty);
  return m;
}

export function stockValue(wines: Wine[], stock: StockLevel[], siteId: string | 'all'): { bottles: number; costHT: number; sellHT: number } {
  const q = stockByWine(stock, siteId);
  let bottles = 0;
  let costHT = 0;
  let sellHT = 0;
  for (const w of wines) {
    const n = q.get(w.id) ?? 0;
    if (n <= 0) continue;
    bottles += n;
    costHT += n * (w.buyPriceHT ?? 0);
    sellHT += n * (w.sellPriceHT ?? 0);
  }
  return { bottles, costHT, sellHT };
}

export type AlertKind = 'out' | 'low' | 'apogee' | 'past';

export function wineAlerts(w: Wine, qty: number, year = new Date().getFullYear()): AlertKind[] {
  const a: AlertKind[] = [];
  if (qty <= 0) a.push('out');
  else if (w.alertThreshold > 0 && qty <= w.alertThreshold) a.push('low');
  if (qty > 0 && w.apogeeTo && year > w.apogeeTo) a.push('past');
  else if (qty > 0 && w.apogeeFrom && w.apogeeTo && year >= w.apogeeFrom && year <= w.apogeeTo) a.push('apogee');
  return a;
}
