import { describe, expect, it } from 'vitest';
import type { PurchaseInvoice, Wine } from '../src/types';
import { computeTotals, docMargin, lineMargin, newDocument, saveBlockers, withTotals } from '../src/modules/negoce/calc';
import { customer360, supplier360 } from '../src/modules/negoce/customer360';
import { mailtoHref, overdueInvoices, pendingQuotes, reminderEmail, reminderOps } from '../src/modules/negoce/reminders';
import type { DocLine, Payment, SaleDocument } from '../src/modules/negoce/types';
import { negoce as messages } from '../src/i18n/negoce';

const line = (p: Partial<DocLine>): DocLine => ({ id: Math.random().toString(36), description: 'x', qty: 1, unitPriceHT: 10, discountPct: 0, vatRate: 20, ...p });
const wine = (id: string, buy?: number): Pick<Wine, 'id' | 'buyPriceHT' | 'producer' | 'name' | 'vintage' | 'formatCl'> => ({ id, buyPriceHT: buy, producer: 'Dom', name: `Vin ${id}`, vintage: '2020', formatCl: 75 });

const doc = (p: Partial<SaleDocument>): SaleDocument =>
  withTotals({ ...newDocument('invoice', { siteId: 's', vatRate: 20, userId: 'u', date: '2026-09-01' }), partnerId: 'p1', partnerName: 'Client', status: 'validated', ...p });

describe('marges', () => {
  it('marge de ligne : net HT moins coût, taux de marque et coefficient', () => {
    expect(lineMargin({ qty: 6, wineId: 'a' }, 120, 10)).toEqual({ revenueHT: 120, costHT: 60, marginHT: 60, marginRate: 50, coef: 2 });
    expect(lineMargin({ qty: 1, wineId: 'a' }, 0, 10)).toMatchObject({ marginHT: -10, marginRate: null });
    expect(lineMargin({ qty: 1, wineId: 'a' }, 10, undefined)).toBeNull();
    expect(lineMargin({ qty: 1, isService: true, wineId: 'a' }, 10, 1)).toBeNull();
  });

  it('marge du document : remise globale incluse, transport/services exclus, prix inconnus signalés', () => {
    const lines = [
      line({ wineId: 'a', qty: 6, unitPriceHT: 20 }), // 120
      line({ wineId: 'b', qty: 2, unitPriceHT: 30, isGift: true }), // offert : coût sans recette
      line({ wineId: 'c', qty: 1, unitPriceHT: 50 }), // prix d'achat inconnu
      line({ description: 'Transport', isService: true, unitPriceHT: 15 }),
    ];
    const nets = computeTotals(lines, 0, 20, 10).lineNets; // remise globale 10 %
    const m = docMargin(lines, nets, [wine('a', 8), wine('b', 12), wine('c')]);
    expect(m).toEqual({ revenueHT: 108, costHT: 72, marginHT: 36, marginRate: 33.33, coef: 1.5, missing: 1 });
  });

  it('explique pourquoi on ne peut pas enregistrer / valider', () => {
    expect(saveBlockers({ partnerId: '', lines: [] }, false)).toEqual(['negoce.block.client']);
    expect(saveBlockers({ partnerId: '', lines: [] }, true)).toEqual(['negoce.block.client', 'negoce.block.lines']);
    expect(saveBlockers({ partnerId: 'p', lines: [line({ description: ' ' })] }, true)).toEqual(['negoce.block.description']);
    expect(saveBlockers({ partnerId: 'p', lines: [line({})] }, true)).toEqual([]);
  });
});

describe('relances', () => {
  const inv = doc({ id: 'i1', number: 'FA-2026-0001', dueDate: '2026-10-01', lines: [line({ qty: 10, unitPriceHT: 10 })] }); // 120 TTC
  const paidInv = doc({ id: 'i2', number: 'FA-2026-0002', dueDate: '2026-10-01', lines: [line({})] });
  const notDue = doc({ id: 'i3', number: 'FA-2026-0003', dueDate: '2026-10-30', lines: [line({})] });
  const payments: Payment[] = [
    { id: 'p1', documentId: 'i1', date: '2026-10-05', amount: 20, method: 'virement', reference: '' },
    { id: 'p2', documentId: 'i2', date: '2026-10-05', amount: 12, method: 'virement', reference: '' },
  ];

  it('factures échues non soldées, avec retard et reste dû', () => {
    const rows = overdueInvoices([inv, paidInv, notDue], payments, '2026-10-19');
    expect(rows.map((r) => [r.doc.id, r.daysLate, r.balance])).toEqual([['i1', 18, 100]]);
  });

  it('devis envoyés depuis plus de 7 jours', () => {
    const q = (id: string, date: string, status: SaleDocument['status'] = 'sent') => ({ ...doc({ id, date, status }), type: 'quote' as const });
    const rows = pendingQuotes([q('q1', '2026-10-01'), q('q2', '2026-10-15'), q('q3', '2026-09-01', 'accepted'), q('q4', '2026-10-12')], '2026-10-19');
    expect(rows.map((r) => [r.doc.id, r.daysPending])).toEqual([['q1', 18]]);
  });

  it('modèle FR : numéro, reste dû, échéance, IBAN', () => {
    const m = reminderEmail({ kind: 'invoice', lang: 'fr', number: 'FA-2026-0001', amount: 100, date: '2026-09-01', dueDate: '2026-10-01', daysLate: 18, orgName: 'Maison', iban: 'FR76 3000', bic: 'AGRIFRPP', contactName: 'Mme Durand' });
    expect(m.subject).toBe('Rappel de paiement — facture FA-2026-0001 — Maison');
    expect(m.body).toContain('Bonjour Mme Durand,');
    expect(m.body).toContain('FA-2026-0001');
    expect(m.body).toMatch(/100,00\s€/);
    expect(m.body).toContain('01 oct. 2026');
    expect(m.body).toContain('IBAN : FR76 3000');
    expect(m.body).toContain('BIC : AGRIFRPP');
    expect(m.body).toContain('18 jours de retard');
  });

  it('modèle EN, deuxième relance, sans IBAN', () => {
    const m = reminderEmail({ kind: 'invoice', lang: 'en', number: 'INV-1', amount: 1234.5, date: '2026-09-01', dueDate: '2026-10-01', daysLate: 3, orgName: 'House', reminderCount: 1 });
    expect(m.subject).toBe('Second reminder — invoice INV-1 — House');
    expect(m.body).toContain('€1,234.50');
    expect(m.body).toContain('01 Oct 2026');
    expect(m.body).not.toContain('IBAN');
  });

  it('modèle de relance de devis', () => {
    const m = reminderEmail({ kind: 'quote', lang: 'fr', number: 'DE-2026-0004', amount: 480, date: '2026-10-01', validUntil: '2026-10-31', orgName: 'Maison' });
    expect(m.subject).toBe('Votre devis DE-2026-0004 — Maison');
    expect(m.body).toContain('valable jusqu’au 31 oct. 2026');
  });

  it('mailto encodé et trace de relance', () => {
    expect(mailtoHref('a@b.fr', 'Sujet & co', 'L1\nL2')).toBe('mailto:a@b.fr?subject=Sujet%20%26%20co&body=L1%0AL2');
    expect(mailtoHref(undefined, 's', 'b')).toBe('mailto:?subject=s&body=b');
    expect(reminderOps('o', 'i1', 42)).toEqual([{ op: 'inc', path: 'orgs/o/documents/i1', field: 'reminderCount', by: 1, data: { lastReminderAt: 42 } }]);
  });
});

describe('client 360', () => {
  it('CA 12 mois (avoirs déduits), panier moyen, encours et échu, vins préférés', () => {
    const docs = [
      doc({ id: 'a', date: '2026-09-01', dueDate: '2026-10-01', lines: [line({ wineId: 'w1', qty: 6, unitPriceHT: 20 })] }), // 120 HT / 144 TTC
      doc({ id: 'b', date: '2026-05-01', dueDate: '2026-12-01', status: 'paid', lines: [line({ wineId: 'w2', qty: 2, unitPriceHT: 40 })] }), // 80 HT
      doc({ id: 'c', date: '2025-01-01', status: 'paid', lines: [line({ wineId: 'w2', qty: 50, unitPriceHT: 1 })] }), // > 12 mois
      { ...doc({ id: 'd', date: '2026-09-10', lines: [line({ wineId: 'w1', qty: 1, unitPriceHT: 20 })], relatedDocumentId: 'a' }), type: 'credit_note' as const },
      doc({ id: 'e', partnerId: 'other', lines: [line({ qty: 100 })] }),
      { ...doc({ id: 'f', status: 'sent' }), type: 'quote' as const },
    ];
    const k = customer360('p1', docs, [], '2026-10-19', { wines: [wine('w1'), wine('w2')], consignments: [{ id: 'k', partnerId: 'p1', wineId: 'w1', qty: 3, priceHT: 1, siteId: 's', createdAt: 0 }] });
    expect(k.revenue12mHT).toBe(180);
    expect(k.invoiceCount).toBe(2);
    expect(k.avgBasketHT).toBe(100);
    expect(k.outstanding).toBe(120); // 144 - avoir 24
    expect(k.overdue).toBe(120);
    expect(k.topWines.map((w) => [w.wineId, w.qty])).toEqual([
      ['w2', 52],
      ['w1', 6],
    ]);
    expect(k.lastDocs).toHaveLength(5);
    expect(k.consignedBottles).toBe(3);
  });

  it('fournisseur : achats 12 mois et vins fournis', () => {
    const pi = (p: Partial<PurchaseInvoice>): PurchaseInvoice => ({ id: 'x', supplierName: 'Dom X', number: 'F1', date: '2026-06-01', lines: [], totalHT: 100, totalVAT: 20, totalTTC: 120, status: 'paid', createdAt: 0, createdBy: 'u', ...p });
    const k = supplier360({ id: 's1', name: 'Dom X' }, [
      pi({ id: '1', supplierId: 's1', lines: [{ wineId: 'w1', description: 'W1', qty: 12, unitPriceHT: 9, vatRate: 20, received: true }] }),
      pi({ id: '2', supplierName: 'DOM x', date: '2026-09-01', status: 'received', lines: [{ wineId: 'w1', description: 'W1', qty: 6, unitPriceHT: 10, vatRate: 20, received: true }] }),
      pi({ id: '3', supplierId: 'other', supplierName: 'Dom X' }),
      pi({ id: '4', supplierId: 's1', date: '2024-01-01' }),
    ], '2026-10-19', { wines: [wine('w1')] });
    expect(k.purchases12mHT).toBe(200);
    expect(k.invoiceCount).toBe(2);
    expect(k.unpaidTTC).toBe(120);
    expect(k.lastPurchases.map((p) => p.id)).toEqual(['2', '1', '4']);
    expect(k.wines).toEqual([{ wineId: 'w1', label: 'Dom · Vin w1 · 2020', qty: 18, lastPriceHT: 10, lastDate: '2026-09-01' }]);
  });
});

describe('i18n négoce', () => {
  it('familles de clés dynamiques des offres et du 360', () => {
    const keys = [
      ...['draft', 'sent', 'accepted', 'declined', 'expired'].map((k) => `offer.status.${k}`),
      ...['rouge', 'blanc', 'rose', 'bulles', 'orange', 'doux', 'spiritueux', 'autre'].map((k) => `offer.color.${k}`),
      ...['draft', 'received', 'paid'].map((k) => `c360.purchase.${k}`),
      ...['client', 'lines', 'description'].map((k) => `negoce.block.${k}`),
    ];
    expect(keys.filter((k) => !messages.fr[k] || !messages.en[k])).toEqual([]);
    expect(Object.keys(messages.fr).sort()).toEqual(Object.keys(messages.en).sort());
  });
});
