import { describe, expect, it } from 'vitest';
import type { Movement, PurchaseInvoice, StockLevel, Wine } from '../src/types';
import { DEFAULT_ACCOUNTS } from '../src/modules/compta/accounts';
import { daysFirstYear, depreciationSchedule, netBookValue, totalDepreciationForYear } from '../src/modules/compta/assets';
import { buildDrm, drmCategoryOf, drmTotals, toHl } from '../src/modules/compta/drm';
import { FEC_HEADER, fecContent, fecFilename } from '../src/modules/compta/fec';
import { buildJournal, checkBalance } from '../src/modules/compta/journal';
import { computeResult } from '../src/modules/compta/result';
import type { Asset, Expense, ExpenseCategory } from '../src/modules/compta/types';
import { periodFor, vatReturn } from '../src/modules/compta/vat';
import { newDocument, withTotals } from '../src/modules/negoce/calc';
import type { DocLine, Payment, SaleDocument } from '../src/modules/negoce/types';

const line = (p: Partial<DocLine>): DocLine => ({ id: 'l' + Math.random(), description: 'x', qty: 1, unitPriceHT: 100, discountPct: 0, vatRate: 20, ...p });
const doc = (type: SaleDocument['type'], lines: DocLine[], date = '2026-03-10', status: SaleDocument['status'] = 'validated'): SaleDocument =>
  withTotals({ ...newDocument(type, { siteId: 's', vatRate: 20, userId: 'u', date }), number: `${type}-${date}-${lines.length}`, partnerId: 'partner123456', partnerName: 'Client', status, lines });

const purchase = (p: Partial<PurchaseInvoice> = {}): PurchaseInvoice => ({
  id: 'pi1',
  supplierName: 'Fournisseur',
  number: 'F-1',
  date: '2026-03-05',
  lines: [],
  totalHT: 500,
  totalVAT: 100,
  totalTTC: 600,
  status: 'received',
  createdAt: 0,
  createdBy: 'u',
  ...p,
});

const expense = (p: Partial<Expense> = {}): Expense => ({
  id: 'e1',
  date: '2026-03-15',
  provider: 'EDF',
  category: 'energy',
  description: 'Électricité',
  amountHT: 50,
  amountTVA: 10,
  amountTTC: 60,
  paymentMethod: 'virement',
  createdAt: 0,
  ...p,
});

const asset = (p: Partial<Asset> = {}): Asset => ({
  id: 'a1',
  name: 'Tireuse',
  category: 'materiel',
  purchaseDate: '2026-07-01',
  amountHT: 1200,
  vatAmount: 240,
  durationYears: 5,
  startDepreciationDate: '2026-07-01',
  createdAt: 0,
  ...p,
});

const categories: ExpenseCategory[] = [{ id: 'energy', name: 'Énergie', account: '606100' }];

describe('TVA', () => {
  const docs = [doc('invoice', [line({}), line({ vatRate: 5.5 })]), doc('credit_note', [line({ unitPriceHT: 50 })]), doc('invoice', [line({})], '2026-05-02'), doc('invoice', [line({})], '2026-03-20', 'draft')];

  it('collectée par taux, avoirs déduits, brouillons exclus, période respectée', () => {
    const v = vatReturn({ docs, purchases: [], expenses: [], assets: [], period: periodFor('month', 2026, 3) });
    expect(v.collected).toEqual([
      { rate: 5.5, baseHT: 100, vat: 5.5 },
      { rate: 20, baseHT: 50, vat: 10 },
    ]);
    expect(v.totalCollected).toBe(15.5);
  });

  it('déductible = achats reçus + charges + immobilisations (sans double compte), solde à payer ou crédit', () => {
    const input = {
      docs,
      purchases: [purchase(), purchase({ id: 'pi2', status: 'draft', totalVAT: 999 })],
      expenses: [expense(), expense({ id: 'e2', assetId: 'a2', amountTVA: 7 })],
      assets: [asset({ purchaseDate: '2026-03-02' }), asset({ id: 'a2', purchaseDate: '2026-03-03', vatAmount: 7 })],
      period: periodFor('quarter', 2026, 1),
    };
    const v = vatReturn(input);
    expect(v.deductible).toEqual({ purchases: 100, expenses: 17, assets: 240, total: 357 });
    expect(v.totalCollected).toBe(15.5);
    expect(v.balance).toBe(-341.5);
  });

  it('calcule les bornes de période', () => {
    expect(periodFor('quarter', 2026, 2)).toEqual({ from: '2026-04-01', to: '2026-06-30' });
    expect(periodFor('month', 2028, 2).to).toBe('2028-02-29');
  });
});

describe('DRM', () => {
  const wine = (id: string, color: Wine['color'], formatCl = 75): Wine => ({ id, producer: 'P', name: id, vintage: '2020', color, formatCl, alertThreshold: 0, canonicalKey: id, createdAt: 0, updatedAt: 0 });
  const mv = (p: Partial<Movement>): Movement => ({ id: Math.random().toString(), date: '2026-03-10', wineId: 'a', wineLabel: 'a', siteId: 's1', type: 'out', qty: 1, reason: 'vente', userId: 'u', userName: 'U', createdAt: 0, ...p });
  const wines = [wine('a', 'rouge'), wine('b', 'bulles', 150)];
  const stock: StockLevel[] = [
    { id: 'a__s1', wineId: 'a', siteId: 's1', qty: 10, updatedAt: 0 },
    { id: 'b__s1', wineId: 'b', siteId: 's1', qty: 5, updatedAt: 0 },
  ];
  const movements = [
    mv({ type: 'in', reason: 'achat', qty: 6, date: '2026-03-05' }),
    mv({ qty: 2 }),
    mv({ reason: 'casse', qty: 1, date: '2026-03-12' }),
    mv({ qty: 1, date: '2026-04-05' }),
    mv({ type: 'transfer', toSiteId: 's2', qty: 3, date: '2026-03-20' }),
    mv({ wineId: 'b', reason: 'degustation', qty: 1, date: '2026-03-18' }),
  ];

  it('classe les catégories et convertit en hl', () => {
    expect(drmCategoryOf('bulles')).toBe('mousseux');
    expect(drmCategoryOf('rose')).toBe('tranquilles');
    expect(drmCategoryOf('spiritueux')).toBe('spiritueux');
    expect(toHl(12, 75)).toBe(0.09);
  });

  it('stock ouverture + entrées − sorties = clôture, en bouteilles et en hl', () => {
    const rows = buildDrm({ wines, stock, movements, month: '2026-03' });
    const tr = rows.find((r) => r.category === 'tranquilles')!;
    expect(tr.closing.bottles).toBe(11);
    expect(tr.opening.bottles).toBe(8);
    expect(tr.entries.achats.bottles).toBe(6);
    expect(tr.exits.ventes.bottles).toBe(2);
    expect(tr.exits.casse.bottles).toBe(1);
    expect(tr.opening.bottles + tr.entries.total.bottles - tr.exits.total.bottles).toBe(tr.closing.bottles);
    expect(tr.closing.hl).toBe(0.0825);
    const mo = rows.find((r) => r.category === 'mousseux')!;
    expect(mo.exits.degustation).toEqual({ bottles: 1, hl: 0.015 });
    expect(mo.opening.bottles).toBe(6);
    const t = drmTotals(rows);
    expect(t.opening.bottles + t.entries.bottles - t.exits.bottles).toBe(t.closing.bottles);
  });

  it('un site isole les transferts en entrées/sorties', () => {
    const rows = buildDrm({ wines, stock, movements, month: '2026-03', siteId: 's1' });
    const tr = rows.find((r) => r.category === 'tranquilles')!;
    expect(tr.exits.autres.bottles).toBe(3);
  });
});

describe('immobilisations', () => {
  it('prorata temporis jours/360 la première année', () => {
    expect(daysFirstYear('2026-01-01')).toBe(360);
    expect(daysFirstYear('2026-07-01')).toBe(180);
    const rows = depreciationSchedule(asset());
    expect(rows.map((r) => r.dotation)).toEqual([120, 240, 240, 240, 240, 120]);
    expect(rows[rows.length - 1]).toMatchObject({ cumul: 1200, vnc: 0, year: 2031 });
  });

  it('année pleine : durée exacte et VNC', () => {
    const a = asset({ startDepreciationDate: '2026-01-01', amountHT: 1000, durationYears: 4 });
    expect(depreciationSchedule(a)).toHaveLength(4);
    expect(netBookValue(a, 2027)).toBe(500);
    expect(netBookValue(a, 2025)).toBe(1000);
    expect(netBookValue(a, 2040)).toBe(0);
    expect(totalDepreciationForYear([a, asset()], 2026)).toBe(370);
  });

  it('solde exactement la base malgré les arrondis', () => {
    const rows = depreciationSchedule(asset({ amountHT: 1000, durationYears: 3, startDepreciationDate: '2026-05-17' }));
    expect(rows[rows.length - 1].cumul).toBe(1000);
  });
});

describe('journal et FEC', () => {
  const sale = doc('invoice', [line({ unitPriceHT: 100, qty: 2 }), line({ isService: true, unitPriceHT: 15 })]);
  const cn = doc('credit_note', [line({ unitPriceHT: 40 })], '2026-03-20');
  const payments: Payment[] = [
    { id: 'p1', documentId: sale.id, date: '2026-03-25', amount: 100, method: 'virement', reference: 'VIR1' },
    { id: 'p2', documentId: sale.id, date: '2026-03-26', amount: 20, method: 'especes', reference: '' },
  ];
  const input = {
    year: 2026,
    docs: [sale, cn],
    payments,
    purchases: [purchase({ status: 'paid', paymentDate: '2026-04-01', paymentMethod: 'virement' })],
    expenses: [expense(), expense({ id: 'e2', paymentMethod: 'a_payer', provider: 'Loueur' }), expense({ id: 'e3', assetId: 'a1', amountHT: 1200, amountTVA: 240, amountTTC: 1440 })],
    categories,
    assets: [asset(), asset({ id: 'a9', name: 'Étagères', purchaseDate: '2026-02-01', startDepreciationDate: '2026-02-01', amountHT: 600, vatAmount: 120, category: 'mobilier' })],
    accounts: DEFAULT_ACCOUNTS,
  };

  it('produit des écritures équilibrées (par pièce et au global)', () => {
    const lines = buildJournal(input);
    const check = checkBalance(lines);
    expect(check.balanced).toBe(true);
    expect(check.totalDebit).toBe(check.totalCredit);
    const ve = lines.filter((l) => l.journal === 'VE' && l.pieceRef === sale.number);
    expect(ve.find((l) => l.account === '411000')?.debit).toBe(258);
    expect(ve.find((l) => l.account === '707000')?.credit).toBe(200);
    expect(ve.find((l) => l.account === '706000')?.credit).toBe(15);
    expect(ve.find((l) => l.account === '445712')?.credit).toBe(43);
    const avoir = lines.filter((l) => l.pieceRef === cn.number);
    expect(avoir.find((l) => l.account === '411000')?.credit).toBe(48);
    expect(lines.some((l) => l.journal === 'CA')).toBe(true);
    expect(lines.filter((l) => l.account === '681100')).toHaveLength(2);
  });

  it('numérote sans trou par journal', () => {
    const lines = buildJournal(input);
    for (const j of ['VE', 'AC', 'BQ']) {
      const nums = [...new Set(lines.filter((l) => l.journal === j).map((l) => l.num))];
      expect(nums).toEqual(nums.map((_, i) => i + 1));
    }
  });

  it('détecte un déséquilibre et désigne la pièce fautive', () => {
    const bad = buildJournal({ ...input, purchases: [purchase({ totalTTC: 650 })] });
    const check = checkBalance(bad);
    expect(check.balanced).toBe(false);
    expect(check.unbalancedPieces[0]).toMatchObject({ journal: 'AC', pieceRef: 'F-1', gap: -50 });
  });

  it('exporte un FEC conforme : 18 colonnes, tabulations, AAAAMMJJ, virgule décimale', () => {
    const txt = fecContent(buildJournal(input));
    const rows = txt.split('\r\n').slice(0, -1);
    expect(rows[0].split('\t')).toEqual([...FEC_HEADER]);
    expect(FEC_HEADER).toHaveLength(18);
    for (const r of rows) expect(r.split('\t')).toHaveLength(18);
    const c = rows[1].split('\t');
    expect(c[3]).toMatch(/^\d{8}$/);
    expect(c[11]).toMatch(/^\d+,\d{2}$/);
    expect(fecFilename('123 456 789 00012', 2026)).toBe('123456789FEC20261231.txt');
  });
});

describe('résultat et trésorerie', () => {
  it('produits − charges − dotations, encaissements − décaissements', () => {
    const sale = doc('invoice', [line({ qty: 10 })]);
    const r = computeResult({
      year: 2026,
      docs: [sale],
      payments: [{ id: 'p', documentId: sale.id, date: '2026-04-01', amount: 600, method: 'virement', reference: '' }],
      purchases: [purchase({ status: 'paid', paymentDate: '2026-04-02' })],
      expenses: [expense()],
      assets: [asset()],
    });
    expect(r.revenueHT).toBe(1000);
    expect(r.purchasesHT).toBe(500);
    expect(r.expensesHT).toBe(50);
    expect(r.depreciation).toBe(120);
    expect(r.result).toBe(330);
    expect(r.cashIn).toBe(600);
    expect(r.cashOut).toBe(600 + 60 + 1440);
    expect(r.receivables).toBe(600);
  });
});
