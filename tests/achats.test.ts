import { describe, expect, it } from 'vitest';
import type { Org, Partner, Producer, PurchaseInvoice, Wine } from '@/types';
import { canonicalKey } from '@/lib/wine';
import { checkTotals, computeTotals, emptyLine, findDuplicate, matchLine, parseTabular, priceHistory, toDraft } from '@/modules/achats/logic';
import { buildInvoiceOps, isReceivable } from '@/modules/achats/receive';
import type { InvoiceDraft, ParsedInvoice, ReviewLine } from '@/modules/achats/types';

const org: Pick<Org, 'defaultCoefficient' | 'defaultVatRate'> = { defaultCoefficient: 1.5, defaultVatRate: 20 };
const actor = { userId: 'u1', userName: 'Loul' };

const mkWine = (p: Partial<Wine> = {}): Wine => {
  const base = { producer: 'Domaine Dujac', name: 'Gevrey-Chambertin', vintage: '2018', color: 'rouge' as const, formatCl: 75, ...p };
  return { id: 'w1', alertThreshold: 3, createdAt: 0, updatedAt: 0, canonicalKey: canonicalKey(base), ...base };
};

const line = (p: Partial<ReviewLine> = {}): ReviewLine => ({ ...emptyLine(20), producer: 'Domaine Dujac', name: 'Gevrey-Chambertin', vintage: '2018', qty: 6, unitPriceHT: 50, ...p });

const draft = (lines: ReviewLine[], p: Partial<InvoiceDraft> = {}): InvoiceDraft => ({
  id: 'inv1',
  supplierName: 'Maison Test',
  number: 'F-001',
  date: '2026-10-01',
  dueDate: '',
  shippingHT: 0,
  siteId: 'site1',
  declaredHT: 0,
  declaredVAT: 0,
  declaredTTC: 0,
  lines,
  ...p,
});

describe('totaux', () => {
  it('calcule HT, TVA et TTC avec les frais de port', () => {
    const t = computeTotals([{ qty: 6, unitPriceHT: 50, vatRate: 20 }, { qty: 12, unitPriceHT: 10, vatRate: 5.5 }], 30, 20);
    expect(t).toEqual({ ht: 450, vat: 72.6, ttc: 522.6 });
  });
  it('tolère 0,05 € d’écart et alerte au-delà', () => {
    const c = { ht: 100, vat: 20, ttc: 120 };
    expect(checkTotals(c, { ht: 100.04, vat: 19.97 }).ok).toBe(true);
    expect(checkTotals(c, { ht: 100.2, vat: 20 })).toMatchObject({ ok: false, htDiff: -0.2 });
    expect(checkTotals(c, { ht: 100, vat: 20.1 }).ok).toBe(false);
    expect(checkTotals(c, { ht: 0, vat: 0 }).declared).toBe(false);
  });
});

describe('doublons et historique', () => {
  const inv = (p: Partial<PurchaseInvoice>): PurchaseInvoice => ({
    id: 'i1',
    supplierName: 'Maison Test',
    number: 'F-001',
    date: '2026-01-01',
    lines: [],
    totalHT: 0,
    totalVAT: 0,
    totalTTC: 0,
    status: 'received',
    createdAt: 0,
    createdBy: 'x',
    ...p,
  });
  it('détecte le même fournisseur + numéro, sans tenir compte de la casse/accents', () => {
    expect(findDuplicate([inv({})], 'maison TEST', 'f-001')?.id).toBe('i1');
    expect(findDuplicate([inv({})], 'Maison Test', 'F-002')).toBeUndefined();
    expect(findDuplicate([inv({})], 'Maison Test', 'F-001', 'i1')).toBeUndefined();
  });
  it('construit l’historique de prix hors brouillons, trié par date', () => {
    const l = { wineId: 'w1', description: '', qty: 1, vatRate: 20, received: true };
    const h = priceHistory('w1', [
      inv({ id: 'b', date: '2026-03-01', lines: [{ ...l, unitPriceHT: 55 }] }),
      inv({ id: 'a', date: '2026-01-01', lines: [{ ...l, unitPriceHT: 50 }] }),
      inv({ id: 'c', date: '2026-04-01', status: 'draft', lines: [{ ...l, unitPriceHT: 99 }] }),
    ]);
    expect(h.map((p) => p.price)).toEqual([50, 55]);
  });
});

describe('rapprochement', () => {
  it('sélectionne automatiquement un vin identique', () => {
    expect(matchLine({ producer: 'Dujac', name: 'Gevrey Chambertin', vintage: '2018', color: 'rouge', formatCl: 75 }, [mkWine()])).toMatchObject({ wineId: 'w1', choice: 'match' });
  });
  it('propose la création si aucun vin ne correspond', () => {
    expect(matchLine({ producer: 'Autre', name: 'Inconnu', vintage: '2018', color: 'rouge', formatCl: 75 }, [mkWine()])).toMatchObject({ wineId: undefined, choice: 'create' });
  });
  it('convertit une réponse IA en brouillon rapproché', () => {
    const parsed: ParsedInvoice = {
      supplierName: 'Maison Test',
      number: 'F-9',
      date: '',
      dueDate: '',
      shippingHT: 0,
      totalHT: 300,
      totalVAT: 60,
      totalTTC: 360,
      lines: [{ description: 'Dujac Gevrey-Chambertin 2018', producer: 'Domaine Dujac', cuvee: 'Gevrey-Chambertin', vintage: '2018', formatCl: 75, color: 'rouge', region: '', qty: 6, unitPriceHT: 50, vatRate: 20 }],
    };
    const d = toDraft(parsed, [mkWine()], { siteId: 's', today: '2026-10-19', vatRate: 20 });
    expect(d.date).toBe('2026-10-19');
    expect(d.lines[0]).toMatchObject({ wineId: 'w1', choice: 'match' });
  });
});

describe('import tableur', () => {
  it('détecte les colonnes et lit les lignes', () => {
    const rows = [
      ['Facture pro-forma', '', '', ''],
      ['Domaine', 'Cuvée', 'Millésime', 'Format', 'Qté', 'Prix unitaire HT', 'TVA', 'Total HT'],
      ['Domaine Dujac', 'Gevrey-Chambertin', '2018', '0,75', '6', '50,5', '20', '303'],
      ['Domaine Leflaive', 'Puligny', '2020', 'Magnum', '2', '120', '', '240'],
      ['', '', '', '', '', '', '', ''],
    ];
    const p = parseTabular(rows, 'tarif.xlsx');
    expect(p?.lines).toHaveLength(2);
    expect(p?.lines[0]).toMatchObject({ producer: 'Domaine Dujac', qty: 6, unitPriceHT: 50.5, formatCl: 75, vatRate: 20 });
    expect(p?.lines[1]).toMatchObject({ formatCl: 150, vatRate: 20 });
  });
  it('renvoie null si les colonnes essentielles manquent', () => {
    expect(parseTabular([['a', 'b'], ['1', '2']])).toBeNull();
  });
});

describe('réception', () => {
  const ctx = (extra: Partial<Parameters<typeof buildInvoiceOps>[2]> = {}) => ({ orgId: 'o1', org, actor, wines: [mkWine()], producers: [] as Producer[], partners: [] as Partner[], now: 1000, ...extra });

  it('crée fournisseur, entrées de stock, prix d’achat et facture en un seul lot', () => {
    const { ops, invoice } = buildInvoiceOps(draft([line({ choice: 'match', wineId: 'w1', unitPriceHT: 55 })]), 'receive', ctx());
    const paths = ops.map((o) => o.path);
    expect(paths.some((p) => p.startsWith('orgs/o1/partners/'))).toBe(true);
    expect(paths.some((p) => p.startsWith('orgs/o1/movements/'))).toBe(true);
    expect(ops.find((o) => o.op === 'inc')).toMatchObject({ path: 'orgs/o1/stock/w1__site1', by: 6, field: 'qty' });
    expect(ops.find((o) => o.path === 'orgs/o1/wines/w1')).toMatchObject({ data: { buyPriceHT: 55 }, merge: true });
    expect(ops[ops.length - 1].path).toBe('orgs/o1/purchaseInvoices/inv1');
    const mv = ops.find((o) => o.path.startsWith('orgs/o1/movements/'));
    expect(mv).toMatchObject({ data: { type: 'in', reason: 'achat', unitCostHT: 55, documentId: 'inv1', siteId: 'site1' } });
    expect(invoice).toMatchObject({ status: 'received', totalHT: 330, supplierName: 'Maison Test' });
    expect(invoice.lines[0]).toMatchObject({ wineId: 'w1', received: true });
  });

  it('crée le vin et le producteur avec le coefficient de l’organisation', () => {
    const l = line({ choice: 'create', producer: 'Nouveau Domaine', name: 'Cuvée X', unitPriceHT: 20, region: 'Loire' });
    const { ops } = buildInvoiceOps(draft([l]), 'receive', ctx({ wines: [] }));
    const w = ops.find((o) => o.path.startsWith('orgs/o1/wines/'));
    expect(w).toMatchObject({ data: { producer: 'Nouveau Domaine', buyPriceHT: 20, sellPriceHT: 30, canonicalKey: expect.stringContaining('cuveex') } });
    expect(ops.some((o) => o.path.startsWith('orgs/o1/producers/'))).toBe(true);
  });

  it('ne duplique pas un vin ou un producteur répété dans la même facture', () => {
    const l = line({ choice: 'create', producer: 'Nouveau Domaine', name: 'Cuvée X' });
    const { ops } = buildInvoiceOps(draft([l, { ...l, key: 'k2' }]), 'receive', ctx({ wines: [] }));
    expect(ops.filter((o) => o.path.startsWith('orgs/o1/wines/'))).toHaveLength(1);
    expect(ops.filter((o) => o.path.startsWith('orgs/o1/producers/'))).toHaveLength(1);
    // Deux mouvements, une seule écriture de stock qui les cite tous les deux.
    const movements = ops.filter((o) => o.path.startsWith('orgs/o1/movements/'));
    const stock = ops.filter((o) => o.op === 'inc');
    expect(movements).toHaveLength(2);
    expect(stock).toHaveLength(1);
    expect(stock[0]).toMatchObject({ by: l.qty * 2, data: { mv: movements.map((m) => m.path.split('/').pop()) } });
  });

  it('réutilise le fournisseur existant', () => {
    const partner: Partner = { id: 'p1', kind: 'supplier', name: 'maison test', createdAt: 0 };
    const { ops, invoice } = buildInvoiceOps(draft([line({ choice: 'match', wineId: 'w1' })]), 'receive', ctx({ partners: [partner] }));
    expect(ops.some((o) => o.path.startsWith('orgs/o1/partners/'))).toBe(false);
    expect(invoice.supplierId).toBe('p1');
  });

  it('le brouillon n’écrit que la facture, sans stock', () => {
    const { ops, invoice } = buildInvoiceOps(draft([line({ choice: 'create' })]), 'draft', ctx());
    expect(ops).toHaveLength(1);
    expect(invoice.status).toBe('draft');
    expect(invoice.lines[0].received).toBe(false);
  });

  it('ignore les lignes « sans stock »', () => {
    const { ops, invoice } = buildInvoiceOps(draft([line({ choice: 'skip' })]), 'receive', ctx());
    expect(ops.some((o) => o.op === 'inc')).toBe(false);
    expect(invoice.lines[0].received).toBe(false);
  });

  it('isReceivable exige un vin résolu', () => {
    expect(isReceivable(line({ choice: 'match', wineId: undefined }))).toBe(false);
    expect(isReceivable(line({ choice: 'match', wineId: 'w1' }))).toBe(true);
    expect(isReceivable(line({ choice: 'create', name: '' }))).toBe(false);
  });

  it('ne contient aucune valeur undefined (Firestore)', () => {
    const { ops } = buildInvoiceOps(draft([line({ choice: 'create' })]), 'receive', ctx({ wines: [] }));
    expect(JSON.stringify(ops)).not.toContain('undefined');
    for (const o of ops) if (o.op === 'set') expect(Object.values(o.data).every((v) => v !== undefined)).toBe(true);
  });
});
