import { describe, expect, it } from 'vitest';
import type { Movement, PurchaseInvoice, StockLevel, Wine } from '../src/types';
import { newDocument, withTotals } from '../src/modules/negoce/calc';
import type { DocLine, SaleDocument } from '../src/modules/negoce/types';
import { BREAKDOWN_KEYS, abcAnalysis, bySite, buildSalesData, computeKpis, dormantWines, marginBy, monthlySeries, periodPresets, rankWines, winePerformance, type PilotageInput } from '../src/modules/pilotage/kpis';
import { purchaseOrderRows, suggestReplenishment } from '../src/modules/pilotage/replenish';
import type { WinePerf } from '../src/modules/pilotage/types';

const wine = (id: string, p: Partial<Wine> = {}): Wine => ({
  id,
  producer: `Prod ${id}`,
  name: `Vin ${id}`,
  vintage: '2020',
  color: 'rouge',
  formatCl: 75,
  buyPriceHT: 10,
  sellPriceHT: 20,
  alertThreshold: 0,
  region: 'Bourgogne',
  canonicalKey: id,
  createdAt: 0,
  updatedAt: 0,
  ...p,
});

const mv = (p: Partial<Movement>): Movement => ({ id: Math.random().toString(), date: '2026-03-10', wineId: 'a', wineLabel: 'a', siteId: 's1', type: 'out', qty: 1, reason: 'vente', userId: 'u', userName: 'U', createdAt: 0, ...p });
const line = (p: Partial<DocLine>): DocLine => ({ id: Math.random().toString(), description: 'x', qty: 1, unitPriceHT: 10, discountPct: 0, vatRate: 20, ...p });
const doc = (lines: DocLine[], p: Partial<SaleDocument> = {}): SaleDocument =>
  withTotals({ ...newDocument('invoice', { siteId: 's1', vatRate: 20, userId: 'u', date: '2026-03-10' }), status: 'validated', partnerId: 'p', partnerName: 'C', lines, ...p });

const wines = [wine('a', { alertThreshold: 5 }), wine('b', { buyPriceHT: 50, sellPriceHT: 100, alertThreshold: 2, color: 'blanc', region: 'Loire' }), wine('c', { buyPriceHT: 20, menuPriceTTC: 36, color: 'bulles' })];
const stock: StockLevel[] = [
  { id: 'a__s1', wineId: 'a', siteId: 's1', qty: 4, updatedAt: 0 },
  { id: 'b__s1', wineId: 'b', siteId: 's1', qty: 10, updatedAt: 0 },
  { id: 'c__s2', wineId: 'c', siteId: 's2', qty: 8, updatedAt: 0 },
];
const docs = [
  doc([line({ wineId: 'a', qty: 10, unitPriceHT: 20 }), line({ wineId: 'b', qty: 2, unitPriceHT: 100 }), line({ isService: true, unitPriceHT: 15 }), line({ wineId: 'c', qty: 1, isGift: true })]),
  doc([line({ wineId: 'a', qty: 1, unitPriceHT: 20 })], { type: 'credit_note', date: '2026-03-11' }),
  doc([line({ wineId: 'a', qty: 99, unitPriceHT: 20 })], { status: 'draft' }),
];
const movements: Movement[] = [
  mv({ type: 'in', reason: 'achat', wineId: 'c', qty: 12, date: '2025-01-05', siteId: 's2' }),
  mv({ wineId: 'c', qty: 1, date: '2025-10-01', siteId: 's2' }),
  mv({ qty: 5, unitPriceHT: 18, date: '2026-03-12' }),
  mv({ qty: 3, documentId: 'x', date: '2026-03-12' }),
  mv({ wineId: 'b', reason: 'casse', qty: 1, date: '2026-03-15' }),
  mv({ wineId: 'c', reason: 'consommation', qty: 2, date: '2026-03-16', siteId: 's2' }),
  mv({ qty: 1, date: '2026-02-20', reason: 'degustation' }),
];
const base: PilotageInput = { wines, stock, movements, docs, period: { from: '2026-01-01', to: '2026-03-31' }, siteId: 'all', restaurantMode: false, vatRate: 20 };

describe('ventes et KPIs', () => {
  it('CA = documents validés (avoirs déduits) + ventes de stock hors documents ; offerts et brouillons exclus', () => {
    const d = buildSalesData(base);
    expect(d.sales.filter((s) => s.source === 'document')).toHaveLength(3);
    expect(d.sales.filter((s) => s.source === 'movement')).toHaveLength(1);
    expect(d.servicesHT).toBe(15);
    const k = computeKpis(base);
    expect(k.revenueHT).toBe(200 + 200 - 20 + 90);
    expect(k.cogs).toBe(100 + 100 - 10 + 50);
    expect(k.grossMargin).toBe(230);
    expect(k.markRate).toBe(48.9);
    expect(k.marginRate).toBe(95.8);
  });

  it('coûts de consommation, casse et dégustation séparés de la marge', () => {
    const k = computeKpis(base);
    expect(k.shrinkCost).toBe(50 + 40 + 10);
    expect(k.marginAfterShrink).toBe(k.grossMargin - k.shrinkCost);
  });

  it('valeur de stock, rotation et couverture', () => {
    const k = computeKpis(base);
    expect(k.stockBottles).toBe(22);
    expect(k.stockCost).toBe(4 * 10 + 10 * 50 + 8 * 20);
    expect(k.stockSell).toBe(4 * 20 + 10 * 100 + 8 * 20);
    expect(k.turnover).not.toBeNull();
    expect(k.coverageDays).toBeGreaterThan(0);
    expect(computeKpis({ ...base, docs: [], movements: [] }).markRate).toBeNull();
  });

  it('restaurant : marge théorique depuis le prix carte TTC', () => {
    const k = computeKpis({ ...base, docs: [], restaurantMode: true, siteId: 's2' });
    expect(k.revenueHT).toBe(60);
    expect(k.cogs).toBe(40);
    expect(k.grossMargin).toBe(20);
    expect(k.shrinkCost).toBe(0);
  });

  it('filtre par site', () => {
    expect(computeKpis({ ...base, siteId: 's2' }).stockBottles).toBe(8);
    const rows = bySite(base, ['s1', 's2']);
    expect(rows.find((r) => r.siteId === 's1')?.revenueHT).toBe(470);
    expect(rows.find((r) => r.siteId === 's2')?.stockBottles).toBe(8);
  });
});

describe('classements', () => {
  const perf = (id: string, margin: number, qty = 1, st = 0): WinePerf => ({ wineId: id, label: id, qty, revenueHT: margin * 2, margin, stock: st });

  it('top / flop', () => {
    const r = rankWines([perf('a', 50), perf('b', -5), perf('c', 10), perf('d', 0, 0, 3)], 2);
    expect(r.top.map((p) => p.wineId)).toEqual(['a', 'c']);
    expect(r.flop.map((p) => p.wineId)).toEqual(['b', 'd']);
  });

  it('ABC Pareto sur la marge', () => {
    const rows = abcAnalysis([perf('w1', 70), perf('w2', 15), perf('w3', 10), perf('w4', 5), perf('w5', -3)]);
    expect(rows.map((r) => r.cls)).toEqual(['A', 'A', 'B', 'C', 'C']);
    expect(rows[1].cumulPct).toBe(85);
    expect(abcAnalysis([])).toEqual([]);
  });

  it('performance par vin et répartitions', () => {
    const d = buildSalesData(base);
    const perfs = winePerformance(d.sales, wines, stock, 'all');
    expect(perfs.find((p) => p.wineId === 'a')?.margin).toBe(100 - 10 + 40);
    expect(perfs.find((p) => p.wineId === 'c')?.qty).toBe(0);
    const byRegion = marginBy(d.sales, wines, BREAKDOWN_KEYS.region);
    expect(byRegion[0]).toMatchObject({ key: 'Bourgogne', margin: 130 });
    expect(byRegion.find((r) => r.key === 'Loire')?.markRate).toBe(50);
  });
});

describe('dormants, évolution, périodes', () => {
  it('liste les vins en stock sans sortie depuis 90 jours', () => {
    const rows = dormantWines({ wines, stock, movements: movements.filter((m) => m.reason !== 'consommation'), siteId: 'all', asOf: '2026-03-31' });
    expect(rows.map((r) => r.wineId)).toEqual(['c']);
    expect(rows[0].daysSince).toBeGreaterThan(90);
    expect(rows[0].costValue).toBe(160);
  });

  it('un vin récemment entré sans sortie n’est pas dormant', () => {
    const recent = [mv({ type: 'in', reason: 'achat', wineId: 'c', qty: 8, date: '2026-03-01', siteId: 's2' })];
    expect(dormantWines({ wines: [wines[2]], stock, movements: recent, siteId: 'all', asOf: '2026-03-31' })).toEqual([]);
  });

  it('série mensuelle couvrant toute la période', () => {
    const s = monthlySeries(buildSalesData(base).sales, base.period);
    expect(s.map((p) => p.month)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(s[2].revenueHT).toBe(470);
    expect(s[0].revenueHT).toBe(0);
  });

  it('préréglages de période', () => {
    const p = periodPresets('2026-05-20');
    expect(p.month).toEqual({ from: '2026-05-01', to: '2026-05-20' });
    expect(p.quarter.from).toBe('2026-04-01');
    expect(p.last12.from).toBe('2025-05-21');
  });
});

describe('réassort', () => {
  const purchases: PurchaseInvoice[] = [
    { id: '1', supplierName: 'Ancien', number: '1', date: '2025-06-01', lines: [{ wineId: 'a', description: 'a', qty: 6, unitPriceHT: 9, vatRate: 20, received: true }], totalHT: 0, totalVAT: 0, totalTTC: 0, status: 'received', createdAt: 0, createdBy: 'u' },
    { id: '2', supplierName: 'Récent', number: '2', date: '2026-02-01', lines: [{ wineId: 'a', description: 'a', qty: 6, unitPriceHT: 11, vatRate: 20, received: true }], totalHT: 0, totalVAT: 0, totalTTC: 0, status: 'paid', createdAt: 0, createdBy: 'u' },
  ];

  it('suggère une quantité (vélocité 90 j, seuil, caisse de 6) chez le dernier fournisseur', () => {
    const items = suggestReplenishment({ wines, stock, movements, purchases, siteId: 'all', asOf: '2026-03-31' });
    expect(items.map((i) => i.wineId)).toEqual(['a']);
    expect(items[0]).toMatchObject({ supplier: 'Récent', unitPriceHT: 11, stock: 4, suggestedQty: 6 });
  });

  it('exporte le bon de commande groupé par fournisseur', () => {
    const items = suggestReplenishment({ wines, stock, movements, purchases, siteId: 'all', asOf: '2026-03-31' });
    const rows = purchaseOrderRows([...items, { ...items[0], wineId: 'z', label: 'Z', supplier: '', suggestedQty: 6 }], { supplier: 'S', wine: 'W', qty: 'Q', price: 'P', total: 'T', none: 'Sans', subtotal: 'Sous-total' });
    expect(rows[0]).toEqual(['S', 'W', 'Q', 'P', 'T']);
    expect(rows.filter((r) => r[1] === 'Sous-total')).toHaveLength(2);
    expect(rows.find((r) => r[0] === 'Récent' && r[1] !== 'Sous-total')?.[4]).toBe(66);
  });
});
