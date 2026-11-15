import type { Movement, MovementReason, MovementType, StockLevel, Wine, WineColor } from '@/types';
import type { Op } from './store';
import { SERVER_TIME } from './sentinels';
import { htFromTtc, round2, today, uid } from '@/lib/utils';
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

/**
 * Construit les écritures atomiques : mouvements immuables (horodatés par le serveur) puis une seule écriture
 * par ligne de stock, qui cite les mouvements qui la justifient (contrôlé par les règles Firestore).
 */
export function buildMovementOps(orgId: string, inputs: MovementInput[], actor: Actor, now = Date.now(), currentStock?: StockLevel[]): Op[] {
  if (currentStock) {
    assertStockAvailability(currentStock, inputs);
  }
  const ops: Op[] = [];
  const levels = new Map<string, { wineId: string; siteId: string; by: number; mv: string[] }>();
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
    ops.push({ op: 'set', path: `orgs/${orgId}/movements/${id}`, data: { ...stripUndefined(mv), at: SERVER_TIME } });
    for (const d of stockDeltas(m)) {
      const key = stockId(m.wine.id, d.siteId);
      const level = levels.get(key) ?? { wineId: m.wine.id, siteId: d.siteId, by: 0, mv: [] };
      level.by += d.delta;
      level.mv.push(id);
      levels.set(key, level);
    }
  }
  for (const [key, l] of levels) {
    ops.push({
      op: 'inc',
      path: `orgs/${orgId}/stock/${key}`,
      field: 'qty',
      by: l.by,
      data: { id: key, wineId: l.wineId, siteId: l.siteId, mv: l.mv, updatedAt: now },
    });
  }
  return ops;
}

/** Ajoute des champs (emplacements…) à l'écriture de stock d'un lot, ou une écriture fusionnée s'il n'y en a pas. */
export function withStockFields(ops: Op[], orgId: string, wineId: string, siteId: string, fields: Partial<Pick<StockLevel, 'bin' | 'bins'>>): Op[] {
  const path = `orgs/${orgId}/stock/${stockId(wineId, siteId)}`;
  const target = ops.find((o) => o.op === 'inc' && o.path === path);
  if (target && target.op === 'inc') {
    target.data = { ...(target.data ?? {}), ...fields };
    return ops;
  }
  return [...ops, { op: 'set', path, data: fields, merge: true }];
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

export function stockValue(wines: Wine[], stock: StockLevel[], siteId: string | 'all', vatRate = 20): { bottles: number; costHT: number; sellHT: number } {
  const q = stockByWine(stock, siteId);
  let bottles = 0;
  let costHT = 0;
  let sellHT = 0;
  for (const w of wines) {
    const n = q.get(w.id) ?? 0;
    if (n <= 0) continue;
    bottles += n;
    costHT += n * (w.buyPriceHT ?? 0);
    const unitSell = w.sellPriceHT ?? (w.menuPriceTTC ? htFromTtc(w.menuPriceTTC, vatRate) : 0);
    sellHT += n * unitSell;
  }
  return { bottles, costHT, sellHT };
}

export interface StockValuationSlice {
  bottles: number;
  refs: number;
  costHT: number;
  sellHT: number;
  menuTTC: number;
  marginHT: number;
  marginRate: number | null;
}

export interface StockValuation extends StockValuationSlice {
  unpricedCount: number;
  byColor: Partial<Record<WineColor, StockValuationSlice>>;
  bySite: Record<string, StockValuationSlice>;
}

const emptySlice = (): StockValuationSlice => ({
  bottles: 0,
  refs: 0,
  costHT: 0,
  sellHT: 0,
  menuTTC: 0,
  marginHT: 0,
  marginRate: null,
});

const finalizeSlice = (s: StockValuationSlice): StockValuationSlice => {
  const costHT = round2(s.costHT);
  const sellHT = round2(s.sellHT);
  const menuTTC = round2(s.menuTTC);
  const marginHT = round2(sellHT - costHT);
  const marginRate = sellHT > 0 ? Math.round((marginHT / sellHT) * 1000) / 10 : null;
  return { ...s, costHT, sellHT, menuTTC, marginHT, marginRate };
};

/** Valorisation détaillée du stock (achat HT, valeur carte HT/TTC, marge latente, ventilation par couleur et par site). */
export function stockValuation(
  wines: Wine[],
  stock: StockLevel[],
  siteId: string | 'all' = 'all',
  opts?: { vatRate?: number; preferMenuPrice?: boolean },
): StockValuation {
  const vatRate = opts?.vatRate ?? 20;
  const preferMenu = opts?.preferMenuPrice ?? false;
  const byId = new Map(wines.filter((w) => !w.isArchived).map((w) => [w.id, w]));
  const total = emptySlice();
  const byColor: Partial<Record<WineColor, StockValuationSlice>> = {};
  const bySite: Record<string, StockValuationSlice> = {};
  const seenTotal = new Set<string>();
  const seenColor = new Map<WineColor, Set<string>>();
  const seenSite = new Map<string, Set<string>>();
  const unpriced = new Set<string>();

  for (const lvl of stock) {
    if (lvl.qty <= 0) continue;
    const w = byId.get(lvl.wineId);
    if (!w) continue;
    const n = lvl.qty;
    const unitCost = w.buyPriceHT ?? 0;
    const unitMenuTTC = lvl.menuPriceTTC ?? w.menuPriceTTC ?? (w.sellPriceHT ? round2(w.sellPriceHT * (1 + vatRate / 100)) : 0);
    const unitSellHT = preferMenu && unitMenuTTC > 0
      ? htFromTtc(unitMenuTTC, vatRate)
      : (w.sellPriceHT ?? (unitMenuTTC > 0 ? htFromTtc(unitMenuTTC, vatRate) : 0));

    // Par site (toujours calculé pour tous les sites afin de permettre la comparaison)
    const ss = bySite[lvl.siteId] ?? (bySite[lvl.siteId] = emptySlice());
    ss.bottles += n;
    ss.costHT += n * unitCost;
    ss.sellHT += n * unitSellHT;
    ss.menuTTC += n * unitMenuTTC;
    let siteSet = seenSite.get(lvl.siteId);
    if (!siteSet) seenSite.set(lvl.siteId, (siteSet = new Set()));
    if (!siteSet.has(w.id)) {
      siteSet.add(w.id);
      ss.refs += 1;
    }

    if (siteId !== 'all' && lvl.siteId !== siteId) continue;

    total.bottles += n;
    total.costHT += n * unitCost;
    total.sellHT += n * unitSellHT;
    total.menuTTC += n * unitMenuTTC;
    if (!seenTotal.has(w.id)) {
      seenTotal.add(w.id);
      total.refs += 1;
      if (!w.buyPriceHT || w.buyPriceHT <= 0) unpriced.add(w.id);
    }

    const cs = byColor[w.color] ?? (byColor[w.color] = emptySlice());
    cs.bottles += n;
    cs.costHT += n * unitCost;
    cs.sellHT += n * unitSellHT;
    cs.menuTTC += n * unitMenuTTC;
    let colorSet = seenColor.get(w.color);
    if (!colorSet) seenColor.set(w.color, (colorSet = new Set()));
    if (!colorSet.has(w.id)) {
      colorSet.add(w.id);
      cs.refs += 1;
    }
  }

  for (const k of Object.keys(byColor) as WineColor[]) byColor[k] = finalizeSlice(byColor[k]!);
  for (const k of Object.keys(bySite)) bySite[k] = finalizeSlice(bySite[k]);

  return {
    ...finalizeSlice(total),
    unpricedCount: unpriced.size,
    byColor,
    bySite,
  };
}

export type AlertKind = 'out' | 'low' | 'apogee' | 'past';

export const effectiveAlertThreshold = (w: Pick<Wine, 'alertThreshold'>, level?: Pick<StockLevel, 'alertThreshold'>): number =>
  level?.alertThreshold !== undefined ? level.alertThreshold : w.alertThreshold;

export function wineAlerts(w: Wine, qty: number, year = new Date().getFullYear(), level?: Pick<StockLevel, 'alertThreshold'>): AlertKind[] {
  const a: AlertKind[] = [];
  const threshold = effectiveAlertThreshold(w, level);
  if (qty <= 0) a.push('out');
  else if (threshold > 0 && qty <= threshold) a.push('low');
  if (qty > 0 && w.apogeeTo && year > w.apogeeTo) a.push('past');
  else if (qty > 0 && w.apogeeFrom && w.apogeeTo && year >= w.apogeeFrom && year <= w.apogeeTo) a.push('apogee');
  return a;
}

export interface MaturityRiskRow {
  wine: Wine;
  qty: number;
  apogeeTo: number;
  yearsLeft: number; // <= 0 si apogée déjà dépassée
  annualOut: number; // bouteilles sorties sur les 12 derniers mois
  yearsToClear: number | null; // null si aucune sortie sur 12 mois
  costValueHT: number;
  menuValueTTC: number;
  urgency: 'past' | 'critical' | 'watch';
}

const CONSUMPTION_REASONS = new Set<MovementReason>(['vente', 'verre', 'consommation', 'offert', 'degustation', 'depot_vente']);

/**
 * Détecte les vins en stock dont la fin d'apogée est dépassée ou proche (<= horizonYears)
 * ET dont le rythme de sortie annuel ne permettra pas d'écouler le stock à temps.
 */
export function maturityRisk(
  wines: Wine[],
  stock: StockLevel[],
  movements: Movement[],
  opts?: { siteId?: string | 'all'; now?: number; horizonYears?: number; vatRate?: number },
): MaturityRiskRow[] {
  const siteId = opts?.siteId ?? 'all';
  const now = opts?.now ?? Date.now();
  const horizon = opts?.horizonYears ?? 2;
  const vatRate = opts?.vatRate ?? 20;
  const year = new Date(now).getFullYear();
  const cutoffIso = new Date(now - 365 * 86_400_000).toISOString().slice(0, 10);
  const qtyMap = stockByWine(stock, siteId);

  const out12 = new Map<string, number>();
  for (const m of movements) {
    if (m.type !== 'out' || !CONSUMPTION_REASONS.has(m.reason)) continue;
    if (siteId !== 'all' && m.siteId !== siteId) continue;
    if (m.date >= cutoffIso) out12.set(m.wineId, (out12.get(m.wineId) ?? 0) + m.qty);
  }

  const rows: MaturityRiskRow[] = [];
  for (const w of wines) {
    if (w.isArchived || !w.apogeeTo) continue;
    const qty = qtyMap.get(w.id) ?? 0;
    if (qty <= 0) continue;
    const yearsLeft = w.apogeeTo - year;
    if (yearsLeft > horizon) continue;

    const annualOut = out12.get(w.id) ?? 0;
    const yearsToClear = annualOut > 0 ? Math.round((qty / annualOut) * 10) / 10 : null;
    // Risque avéré si l'apogée est dépassée, ou si aucune sortie, ou si le temps d'écoulement dépasse le temps restant (+1 an de marge)
    const Window = Math.max(0.5, yearsLeft + 1);
    if (yearsLeft > 0 && yearsToClear !== null && yearsToClear <= Window) continue;

    const costValueHT = round2(qty * (w.buyPriceHT ?? 0));
    const unitTTC = w.menuPriceTTC ?? (w.sellPriceHT ? round2(w.sellPriceHT * (1 + vatRate / 100)) : 0);
    const menuValueTTC = round2(qty * unitTTC);
    const urgency: MaturityRiskRow['urgency'] = yearsLeft < 0 ? 'past' : yearsLeft === 0 || yearsToClear === null ? 'critical' : 'watch';

    rows.push({
      wine: w,
      qty,
      apogeeTo: w.apogeeTo,
      yearsLeft,
      annualOut,
      yearsToClear,
      costValueHT,
      menuValueTTC,
      urgency,
    });
  }

  const rank: Record<MaturityRiskRow['urgency'], number> = { past: 0, critical: 1, watch: 2 };
  return rows.sort((a, b) => rank[a.urgency] - rank[b.urgency] || b.costValueHT - a.costValueHT || a.yearsLeft - b.yearsLeft);
}

/**
 * Calcule le Coût Moyen Pondéré (CMP) lors d'une entrée en stock sur achat.
 * Si le stock précédent est <= 0 ou sans coût connu, retombe sur le coût d'entrée.
 */
export function computeWeightedAverageCost(oldQty: number, oldCostHT: number | undefined, inQty: number, inCostHT: number): number {
  if (inQty <= 0 || inCostHT <= 0) return round2(oldCostHT ?? 0);
  const safeOldQty = Math.max(0, oldQty);
  if (safeOldQty === 0 || !oldCostHT || oldCostHT <= 0) return round2(inCostHT);
  return round2((safeOldQty * oldCostHT + inQty * inCostHT) / (safeOldQty + inQty));
}
