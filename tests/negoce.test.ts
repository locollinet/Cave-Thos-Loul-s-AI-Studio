import { describe, expect, it } from 'vitest';
import type { StockLevel, Wine } from '../src/types';
import {
  agingSummary,
  balanceDue,
  computeTotals,
  counterKey,
  creditNoteFromInvoice,
  formatNumber,
  groupConsignments,
  lineNetHT,
  newDocument,
  priceForPartner,
  quoteToInvoice,
  remindersToSend,
  salesKpis,
  statusAfterPayments,
  stockShortages,
  unpaidInvoices,
  withTotals,
} from '../src/modules/negoce/calc';
import { addPaymentOps, buildValidationOps, depositOps, returnOps } from '../src/modules/negoce/ops';
import type { DocLine, Payment, SaleDocument } from '../src/modules/negoce/types';
import { negoce as messages } from '../src/i18n/negoce';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, ASSET_CATEGORIES } from '../src/modules/compta/accounts';

const wine = (id: string, buy = 10): Wine => ({
  id,
  producer: 'Dom',
  name: `Vin ${id}`,
  vintage: '2020',
  color: 'rouge',
  formatCl: 75,
  buyPriceHT: buy,
  sellPriceHT: 20,
  alertThreshold: 2,
  canonicalKey: id,
  createdAt: 0,
  updatedAt: 0,
});

const line = (p: Partial<DocLine>): DocLine => ({ id: 'l' + Math.random(), description: 'x', qty: 1, unitPriceHT: 10, discountPct: 0, vatRate: 20, ...p });

const invoice = (lines: DocLine[], p: Partial<SaleDocument> = {}): SaleDocument =>
  withTotals({
    ...newDocument('invoice', { siteId: 's1', vatRate: 20, userId: 'u', date: '2026-03-10' }),
    partnerId: 'p1',
    partnerName: 'Client',
    lines,
    ...p,
  });

const actor = { userId: 'u', userName: 'U' };

describe('totaux', () => {
  it('arrondit par ligne puis ventile la TVA par taux', () => {
    const t = computeTotals([line({ qty: 3, unitPriceHT: 10.1 }), line({ unitPriceHT: 5.5, vatRate: 5.5 })], 10, 20);
    expect(t.lineNets).toEqual([30.3, 5.5]);
    expect(t.breakdown).toEqual([
      { rate: 5.5, baseHT: 5.5, vat: 0.3 },
      { rate: 20, baseHT: 40.3, vat: 8.06 },
    ]);
    expect(t.totalHT).toBe(45.8);
    expect(t.totalVAT).toBe(8.36);
    expect(t.totalTTC).toBe(54.16);
  });

  it('applique remise de ligne, remise globale et lignes offertes', () => {
    expect(lineNetHT({ qty: 2, unitPriceHT: 45.5, discountPct: 10 })).toBe(81.9);
    expect(lineNetHT({ qty: 2, unitPriceHT: 45.5, discountPct: 0, isGift: true })).toBe(0);
    const t = computeTotals([line({ qty: 2, unitPriceHT: 45.5, discountPct: 10 })], 0, 20, 10);
    expect(t.lineNets[0]).toBe(73.71);
    expect(t.totalTTC).toBe(88.45);
  });

  it('retourne des totaux nuls sans ligne', () => {
    const t = computeTotals([]);
    expect([t.totalHT, t.totalVAT, t.totalTTC]).toEqual([0, 0, 0]);
  });
});

describe('numérotation et conversions', () => {
  it('formate FAC-2026-0001', () => {
    expect(counterKey('FAC', 2026)).toBe('FAC-2026');
    expect(formatNumber('FAC', 2026, 1)).toBe('FAC-2026-0001');
    expect(formatNumber('AV', 2026, 12)).toBe('AV-2026-0012');
  });

  it('convertit un devis en facture brouillon et crée un avoir', () => {
    const q = { ...invoice([line({})]), type: 'quote' as const, number: 'DEV-2026-0001', status: 'sent' as const };
    const inv = quoteToInvoice(q, { date: '2026-04-01', userId: 'u' });
    expect(inv.type).toBe('invoice');
    expect(inv.status).toBe('draft');
    expect(inv.number).toBe('');
    expect(inv.relatedDocumentId).toBe(q.id);
    expect(inv.totalTTC).toBe(q.totalTTC);
    const cn = creditNoteFromInvoice(inv, { date: '2026-04-02', userId: 'u' });
    expect(cn.type).toBe('credit_note');
    expect(cn.relatedDocumentId).toBe(inv.id);
  });

  it('applique la remise client au prix du vin', () => {
    expect(priceForPartner(wine('a'), { discountPct: 5 })).toEqual({ unitPriceHT: 20, discountPct: 5 });
  });
});

describe('validation = numéro + verrouillage + stock', () => {
  const wines = [wine('a', 12), wine('b', 8)];

  it('génère sorties de stock, compteur et document verrouillé dans un seul lot', () => {
    const inv = invoice([
      line({ wineId: 'a', qty: 6, unitPriceHT: 20, discountPct: 10 }),
      line({ wineId: 'b', qty: 1, isGift: true }),
      line({ description: 'Transport', isService: true, unitPriceHT: 15 }),
      line({ wineId: 'a', qty: 3, fromConsignment: 'c1' }),
    ]);
    const { doc, ops } = buildValidationOps({ orgId: 'o', doc: inv, prefix: 'FAC', seq: 7, wines, actor });
    expect(doc.number).toBe('FAC-2026-0007');
    expect(doc.status).toBe('validated');
    const movements = ops.filter((o) => o.op === 'set' && o.path.includes('/movements/'));
    expect(movements).toHaveLength(2);
    const [m1, m2] = movements.map((o) => (o.op === 'set' ? o.data : {}));
    expect(m1).toMatchObject({ type: 'out', reason: 'vente', qty: 6, unitPriceHT: 18, unitCostHT: 12, documentId: inv.id, partnerId: 'p1' });
    expect(m2).toMatchObject({ reason: 'offert', unitPriceHT: 0 });
    expect(ops.find((o) => o.op === 'inc' && o.path === 'orgs/o/counters/FAC-2026')).toMatchObject({ by: 1, field: 'value' });
    expect(ops.find((o) => o.op === 'inc' && o.path === 'orgs/o/consignments/c1')).toMatchObject({ by: -3 });
    const stockIncs = ops.filter((o) => o.op === 'inc' && o.path.includes('/stock/'));
    expect(stockIncs.map((o) => (o.op === 'inc' ? o.by : 0))).toEqual([-6, -1]);
    const saved = ops.find((o) => o.op === 'set' && o.path === `orgs/o/documents/${inv.id}`);
    expect(saved && saved.op === 'set' && saved.data.status).toBe('validated');
  });

  it("l'avoir validé réintègre le stock (retour) et annule la facture si intégral", () => {
    const inv = { ...invoice([line({ wineId: 'a', qty: 2, unitPriceHT: 20 })]), number: 'FAC-2026-0001', status: 'validated' as const };
    const cn = creditNoteFromInvoice(inv, { date: '2026-03-12', userId: 'u' });
    const { ops } = buildValidationOps({ orgId: 'o', doc: cn, prefix: 'AV', seq: 1, wines, actor, related: inv, docs: [inv], payments: [] });
    const mv = ops.find((o) => o.op === 'set' && o.path.includes('/movements/'));
    expect(mv && mv.op === 'set' && mv.data).toMatchObject({ type: 'in', reason: 'retour', qty: 2 });
    expect(ops.find((o) => o.op === 'set' && o.path === `orgs/o/documents/${inv.id}`)).toMatchObject({ data: { status: 'cancelled' } });
  });
});

describe('règlements et impayés', () => {
  const inv = { ...invoice([line({ unitPriceHT: 100 })], { dueDate: '2026-03-20' }), number: 'FAC-2026-0001', status: 'validated' as const };
  const pay = (amount: number): Payment => ({ id: 'p' + amount, documentId: inv.id, date: '2026-03-15', amount, method: 'virement', reference: '' });

  it('calcule solde et statut payé automatique', () => {
    expect(inv.totalTTC).toBe(120);
    expect(balanceDue(inv, [pay(50)], [inv])).toBe(70);
    expect(statusAfterPayments(inv, [pay(50)], [inv])).toBe('validated');
    expect(statusAfterPayments(inv, [pay(50), pay(70)], [inv])).toBe('paid');
    const ops = addPaymentOps('o', pay(120), inv, [], [inv]);
    expect(ops).toHaveLength(2);
  });

  it('ventile la balance âgée et liste les relances', () => {
    const asOf = '2026-05-30';
    const rows = unpaidInvoices([inv], [], asOf);
    expect(rows[0].daysLate).toBe(71);
    expect(agingSummary(rows).d60plus).toBe(120);
    expect(remindersToSend(rows)).toHaveLength(1);
    expect(agingSummary(unpaidInvoices([inv], [], '2026-03-18')).current).toBe(120);
    expect(agingSummary(unpaidInvoices([inv], [], '2026-04-01')).d0_30).toBe(120);
    expect(agingSummary(unpaidInvoices([inv], [], '2026-05-01')).d30_60).toBe(120);
  });

  it('calcule les KPI du mois (avoirs déduits)', () => {
    const cn = { ...creditNoteFromInvoice(inv, { date: '2026-03-18', userId: 'u' }), status: 'validated' as const, lines: [line({ unitPriceHT: 10 })] };
    const k = salesKpis([inv, withTotals(cn)], [], '2026-03-25');
    expect(k.monthRevenueHT).toBe(90);
    expect(k.unpaidTotal).toBe(120 - 12);
  });
});

describe('stock et dépôt-vente', () => {
  const stock: StockLevel[] = [{ id: 'a__s1', wineId: 'a', siteId: 's1', qty: 4, updatedAt: 0 }];

  it('détecte les ruptures hors services et dépôts', () => {
    const s = stockShortages([line({ wineId: 'a', qty: 3 }), line({ wineId: 'a', qty: 2 }), line({ isService: true }), line({ wineId: 'a', qty: 9, fromConsignment: 'c' })], stock, 's1');
    expect(s).toEqual([{ wineId: 'a', requested: 5, available: 4 }]);
  });

  it('dépôt = sortie depot_vente ; retour = entrée retour', () => {
    const c = { id: 'c1', partnerId: 'p1', wineId: 'a', qty: 5, priceHT: 20, siteId: 's1', createdAt: 0 };
    const dep = depositOps('o', c, wine('a'), actor, '2026-03-01');
    const mv = dep.find((o) => o.op === 'set' && o.path.includes('/movements/'));
    expect(mv && mv.op === 'set' && mv.data).toMatchObject({ type: 'out', reason: 'depot_vente', partnerId: 'p1' });
    const ret = returnOps('o', c, wine('a'), 9, actor, '2026-03-02');
    expect(ret.find((o) => o.op === 'inc' && o.path.includes('/consignments/'))).toMatchObject({ by: -5 });
    expect(returnOps('o', c, wine('a'), 0, actor, '2026-03-02')).toEqual([]);
  });

  it('regroupe le stock chez le client', () => {
    const g = groupConsignments([
      { id: '1', partnerId: 'p1', wineId: 'a', qty: 2, priceHT: 10, siteId: 's', createdAt: 0 },
      { id: '2', partnerId: 'p1', wineId: 'b', qty: 3, priceHT: 5, siteId: 's', createdAt: 0 },
      { id: '3', partnerId: 'p2', wineId: 'b', qty: 0, priceHT: 5, siteId: 's', createdAt: 0 },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ bottles: 5, valueHT: 35 });
  });
});

describe('i18n', () => {
  it('FR et EN ont les mêmes clés', () => {
    expect(Object.keys(messages.fr).sort()).toEqual(Object.keys(messages.en).sort());
  });

  it('couvre les familles de clés dynamiques', () => {
    const keys = [
      ...['quote', 'invoice', 'credit_note'].map((k) => `negoce.doc.${k}`),
      ...['draft', 'sent', 'accepted', 'validated', 'paid', 'cancelled'].map((k) => `negoce.status.${k}`),
      ...['virement', 'cheque', 'carte', 'especes', 'prelevement', 'autre'].map((k) => `negoce.method.${k}`),
      ...Object.keys(DEFAULT_ACCOUNTS).map((k) => `compta.acc.${k}`),
      ...DEFAULT_CATEGORIES.map((c) => `compta.cat.${c.key}`),
      ...ASSET_CATEGORIES.map((c) => `compta.assetCat.${c}`),
      ...['a_payer', 'virement', 'cheque', 'carte', 'especes', 'prelevement'].map((k) => `compta.pay.${k}`),
      ...['rouge', 'blanc', 'rose', 'bulles', 'orange', 'doux', 'spiritueux', 'autre'].map((k) => `pilotage.color.${k}`),
    ];
    expect(keys.filter((k) => !messages.fr[k])).toEqual([]);
  });
});
