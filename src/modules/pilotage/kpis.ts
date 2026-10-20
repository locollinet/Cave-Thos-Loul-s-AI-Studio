import type { Movement, StockLevel, Wine } from '@/types';
import { stockByWine, stockValue } from '@/data/stock';
import { htFromTtc, round2 } from '@/lib/utils';
import { wineLabel } from '@/lib/wine';
import { computeTotals, daysBetween } from '../negoce/calc';
import type { SaleDocument } from '../negoce/types';
import type { AbcRow, BreakdownRow, DormantRow, Kpis, MonthPoint, Period, SaleLine, ShrinkLine, SiteRow, WinePerf } from './types';

export interface PilotageInput {
  wines: Wine[];
  stock: StockLevel[];
  movements: Movement[];
  docs: SaleDocument[];
  period: Period;
  siteId: string; // 'all' ou id de site
  restaurantMode: boolean;
  vatRate: number;
}

const inPeriod = (d: string, p: Period) => d >= p.from && d <= p.to;
const pct1 = (n: number) => Math.round(n * 1000) / 10;
const SHRINK = ['consommation', 'casse', 'degustation', 'offert'] as const;
type ShrinkReason = (typeof SHRINK)[number];
const isShrink = (r: string): r is ShrinkReason => (SHRINK as readonly string[]).includes(r);

export interface SalesData {
  sales: SaleLine[];
  shrink: ShrinkLine[];
  servicesHT: number;
}

/** Ventes (documents validés + ventes de stock hors documents) et coûts de consommation. */
export function buildSalesData(i: Omit<PilotageInput, 'siteId'> & { siteId?: string }): SalesData {
  const byId = new Map(i.wines.map((w) => [w.id, w]));
  const siteOk = (s: string) => !i.siteId || i.siteId === 'all' || s === i.siteId;
  const sales: SaleLine[] = [];
  const shrink: ShrinkLine[] = [];
  let servicesHT = 0;

  for (const d of i.docs) {
    if ((d.type !== 'invoice' && d.type !== 'credit_note') || (d.status !== 'validated' && d.status !== 'paid') || !inPeriod(d.date, i.period) || !siteOk(d.siteId)) continue;
    const sign = d.type === 'credit_note' ? -1 : 1;
    const t = computeTotals(d.lines, d.shippingHT, d.shippingVatRate, d.discountPct);
    servicesHT += sign * t.shippingHT;
    d.lines.forEach((l, idx) => {
      if (l.isService) {
        servicesHT += sign * t.lineNets[idx];
        return;
      }
      if (!l.wineId || l.isGift || !l.qty) return;
      sales.push({ date: d.date, wineId: l.wineId, siteId: d.siteId, qty: sign * l.qty, revenueHT: sign * t.lineNets[idx], costHT: sign * l.qty * (byId.get(l.wineId)?.buyPriceHT ?? 0), source: 'document' });
    });
  }

  for (const m of i.movements) {
    if (m.type !== 'out' || !inPeriod(m.date, i.period) || !siteOk(m.siteId)) continue;
    const w = byId.get(m.wineId);
    const unitCost = m.unitCostHT ?? w?.buyPriceHT ?? 0;
    if (m.reason === 'vente') {
      if (m.documentId) continue;
      sales.push({ date: m.date, wineId: m.wineId, siteId: m.siteId, qty: m.qty, revenueHT: m.qty * (m.unitPriceHT ?? w?.sellPriceHT ?? 0), costHT: m.qty * unitCost, source: 'movement' });
    } else if (m.reason === 'consommation' && i.restaurantMode) {
      const unitHT = w?.menuPriceTTC ? htFromTtc(w.menuPriceTTC, i.vatRate) : (w?.sellPriceHT ?? 0);
      sales.push({ date: m.date, wineId: m.wineId, siteId: m.siteId, qty: m.qty, revenueHT: m.qty * unitHT, costHT: m.qty * unitCost, source: 'theoretical' });
    } else if (isShrink(m.reason)) {
      shrink.push({ date: m.date, wineId: m.wineId, siteId: m.siteId, qty: m.qty, costHT: m.qty * unitCost, reason: m.reason });
    }
  }
  return { sales, shrink, servicesHT: round2(servicesHT) };
}

export function computeKpis(i: PilotageInput, data: SalesData = buildSalesData(i)): Kpis {
  const revenueHT = round2(data.sales.reduce((s, l) => s + l.revenueHT, 0));
  const cogs = round2(data.sales.reduce((s, l) => s + l.costHT, 0));
  const shrinkCost = round2(data.shrink.reduce((s, l) => s + l.costHT, 0));
  const grossMargin = round2(revenueHT - cogs);
  const sv = stockValue(i.wines, i.stock, i.siteId);
  const days = Math.max(1, daysBetween(i.period.from, i.period.to) + 1);
  const outCost = cogs + shrinkCost;
  return {
    revenueHT,
    servicesHT: data.servicesHT,
    cogs,
    grossMargin,
    marginRate: cogs > 0 ? pct1(grossMargin / cogs) : null,
    markRate: revenueHT > 0 ? pct1(grossMargin / revenueHT) : null,
    shrinkCost,
    marginAfterShrink: round2(grossMargin - shrinkCost),
    bottlesSold: data.sales.reduce((s, l) => s + l.qty, 0),
    stockCost: round2(sv.costHT),
    stockSell: round2(sv.sellHT),
    stockBottles: sv.bottles,
    turnover: sv.costHT > 0 && cogs > 0 ? Math.round(((cogs / sv.costHT) * 365 * 100) / days) / 100 : null,
    coverageDays: sv.costHT > 0 && outCost > 0 ? Math.round(sv.costHT / (outCost / days)) : null,
  };
}

export function winePerformance(sales: SaleLine[], wines: Wine[], stock: StockLevel[], siteId: string): WinePerf[] {
  const q = stockByWine(stock, siteId);
  const byId = new Map(wines.map((w) => [w.id, w]));
  const m = new Map<string, WinePerf>();
  for (const l of sales) {
    const w = byId.get(l.wineId);
    const p = m.get(l.wineId) ?? { wineId: l.wineId, label: w ? wineLabel(w) : l.wineId, qty: 0, revenueHT: 0, margin: 0, stock: q.get(l.wineId) ?? 0 };
    p.qty += l.qty;
    p.revenueHT = round2(p.revenueHT + l.revenueHT);
    p.margin = round2(p.margin + l.revenueHT - l.costHT);
    m.set(l.wineId, p);
  }
  for (const w of wines) {
    const stockQty = q.get(w.id) ?? 0;
    if (!m.has(w.id) && stockQty > 0 && !w.isArchived) m.set(w.id, { wineId: w.id, label: wineLabel(w), qty: 0, revenueHT: 0, margin: 0, stock: stockQty });
  }
  return [...m.values()];
}

export function rankWines(perfs: WinePerf[], n = 10): { top: WinePerf[]; flop: WinePerf[] } {
  const top = perfs.filter((p) => p.qty > 0).sort((a, b) => b.margin - a.margin).slice(0, n);
  const flop = [...perfs].sort((a, b) => a.margin - b.margin || a.qty - b.qty).slice(0, n);
  return { top, flop };
}

/** Pareto sur la marge : A jusqu'à 80 % cumulés, B jusqu'à 95 %, C au-delà. */
export function abcAnalysis(perfs: WinePerf[]): AbcRow[] {
  const sold = perfs.filter((p) => p.qty > 0).sort((a, b) => b.margin - a.margin);
  const total = sold.reduce((s, p) => s + Math.max(p.margin, 0), 0);
  let cumul = 0;
  return sold.map((p) => {
    const prev = total > 0 ? (cumul / total) * 100 : 100;
    cumul += Math.max(p.margin, 0);
    const cumulPct = total > 0 ? Math.round((cumul / total) * 1000) / 10 : 100;
    return { ...p, cumulPct, cls: p.margin <= 0 ? 'C' : prev < 80 ? 'A' : prev < 95 ? 'B' : 'C' };
  });
}

export function dormantWines(i: { wines: Wine[]; stock: StockLevel[]; movements: Movement[]; siteId: string; asOf: string; days?: number }): DormantRow[] {
  const days = i.days ?? 90;
  const q = stockByWine(i.stock, i.siteId);
  const lastOut = new Map<string, string>();
  const firstIn = new Map<string, string>();
  for (const m of i.movements) {
    if (i.siteId !== 'all' && m.siteId !== i.siteId) continue;
    if (m.type === 'out' && m.date <= i.asOf && (lastOut.get(m.wineId) ?? '') < m.date) lastOut.set(m.wineId, m.date);
    if (m.type === 'in' && (!firstIn.has(m.wineId) || m.date < firstIn.get(m.wineId)!)) firstIn.set(m.wineId, m.date);
  }
  const rows: DormantRow[] = [];
  for (const w of i.wines) {
    const stockQty = q.get(w.id) ?? 0;
    if (stockQty <= 0 || w.isArchived) continue;
    const last = lastOut.get(w.id) ?? null;
    const since = last ? daysBetween(last, i.asOf) : null;
    const entry = firstIn.get(w.id);
    if (since !== null ? since < days : entry !== undefined && daysBetween(entry, i.asOf) < days) continue;
    rows.push({ wineId: w.id, label: wineLabel(w), stock: stockQty, costValue: round2(stockQty * (w.buyPriceHT ?? 0)), lastOut: last, daysSince: since });
  }
  return rows.sort((a, b) => b.costValue - a.costValue);
}

export function marginBy(sales: SaleLine[], wines: Wine[], key: (w: Wine | undefined) => string): BreakdownRow[] {
  const byId = new Map(wines.map((w) => [w.id, w]));
  const m = new Map<string, BreakdownRow>();
  for (const l of sales) {
    const k = key(byId.get(l.wineId));
    const r = m.get(k) ?? { key: k, revenueHT: 0, margin: 0, qty: 0, markRate: null };
    r.revenueHT = round2(r.revenueHT + l.revenueHT);
    r.margin = round2(r.margin + l.revenueHT - l.costHT);
    r.qty += l.qty;
    m.set(k, r);
  }
  return [...m.values()].map((r) => ({ ...r, markRate: r.revenueHT > 0 ? pct1(r.margin / r.revenueHT) : null })).sort((a, b) => b.margin - a.margin);
}

export const BREAKDOWN_KEYS = {
  producer: (w: Wine | undefined) => w?.producer ?? '',
  region: (w: Wine | undefined) => w?.region ?? '',
  color: (w: Wine | undefined) => w?.color ?? '',
  format: (w: Wine | undefined) => (w ? String(w.formatCl) : ''),
};

export function monthlySeries(sales: SaleLine[], period: Period): MonthPoint[] {
  const pts = new Map<string, MonthPoint>();
  const [fy, fm] = period.from.split('-').map(Number);
  const [ty, tm] = period.to.split('-').map(Number);
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    const k = `${y}-${String(m).padStart(2, '0')}`;
    pts.set(k, { month: k, revenueHT: 0, cogs: 0, margin: 0 });
    if (m === 12) {
      y++;
      m = 1;
    } else m++;
  }
  for (const l of sales) {
    const p = pts.get(l.date.slice(0, 7));
    if (!p) continue;
    p.revenueHT = round2(p.revenueHT + l.revenueHT);
    p.cogs = round2(p.cogs + l.costHT);
    p.margin = round2(p.revenueHT - p.cogs);
  }
  return [...pts.values()];
}

export function bySite(i: PilotageInput, siteIds: string[]): SiteRow[] {
  const all = buildSalesData({ ...i, siteId: 'all' });
  return siteIds.map((siteId) => {
    const s = all.sales.filter((l) => l.siteId === siteId);
    const sv = stockValue(i.wines, i.stock, siteId);
    const revenueHT = round2(s.reduce((n, l) => n + l.revenueHT, 0));
    return { siteId, revenueHT, margin: round2(revenueHT - s.reduce((n, l) => n + l.costHT, 0)), stockCost: round2(sv.costHT), stockBottles: sv.bottles };
  });
}

export const periodPresets = (asOf: string): Record<'month' | 'quarter' | 'year' | 'last12', Period> => {
  const y = Number(asOf.slice(0, 4));
  const m = Number(asOf.slice(5, 7));
  const pad = (n: number) => String(n).padStart(2, '0');
  const qStart = Math.floor((m - 1) / 3) * 3 + 1;
  const back = new Date(`${asOf}T12:00:00Z`);
  back.setUTCFullYear(back.getUTCFullYear() - 1);
  back.setUTCDate(back.getUTCDate() + 1);
  return {
    month: { from: `${y}-${pad(m)}-01`, to: asOf },
    quarter: { from: `${y}-${pad(qStart)}-01`, to: asOf },
    year: { from: `${y}-01-01`, to: asOf },
    last12: { from: back.toISOString().slice(0, 10), to: asOf },
  };
};
