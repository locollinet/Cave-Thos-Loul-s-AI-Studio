import { describe, expect, it } from 'vitest';
import type { InventorySession, Movement, OrgProfile, PurchaseInvoice, StockLevel, Wine } from '../src/types';
import type { Op } from '../src/data/store';
import { buildDemo, buildDemoOps } from '../src/data/demo';
import { stockDeltas } from '../src/data/stock';
import { balanceDue, computeTotals, creditedAmount, statusAfterPayments, withTotals } from '../src/modules/negoce/calc';
import type { Consignment, Payment, SaleDocument } from '../src/modules/negoce/types';
import { computeTotals as purchaseTotals } from '../src/modules/achats/logic';
import { abcAnalysis, buildSalesData, computeKpis, monthlySeries, periodPresets, winePerformance } from '../src/modules/pilotage/kpis';
import { computeResult } from '../src/modules/compta/result';
import type { Asset, Expense } from '../src/modules/compta/types';
import type { PublicListDoc, WineList } from '../src/modules/carte/types';
import { PRESETS } from '../src/lib/brand';

/** Applique des écritures comme le magasin local (set / merge / inc / delete). */
function apply(ops: Op[]): Map<string, Map<string, Record<string, unknown>>> {
  const db = new Map<string, Map<string, Record<string, unknown>>>();
  for (const o of ops) {
    const i = o.path.lastIndexOf('/');
    const coll = o.path.slice(0, i);
    const id = o.path.slice(i + 1);
    if (!db.has(coll)) db.set(coll, new Map());
    const c = db.get(coll)!;
    if (o.op === 'delete') c.delete(id);
    else if (o.op === 'set') c.set(id, o.merge ? { ...(c.get(id) ?? {}), ...o.data } : { ...o.data });
    else {
      const cur = c.get(id) ?? {};
      c.set(id, { ...cur, ...(o.data ?? {}), [o.field]: ((cur[o.field] as number) ?? 0) + o.by });
    }
  }
  return db;
}

const ORG = 'org1';
const MAIN = 'main';
const PROFILES: OrgProfile[] = ['negoce', 'independant', 'restaurant', 'chaine'];
const NOW = Date.parse('2026-10-19T14:00:00Z');
const today = new Date(NOW).toISOString().slice(0, 10);
const yearAgo = new Date(NOW - 366 * 86_400_000).toISOString().slice(0, 10);

function load(profile: OrgProfile, now = NOW) {
  const ops = buildDemoOps(ORG, MAIN, profile, { orgName: 'Maison Démo', now });
  // Écritures préalables de createOrg (org + site principal), puis la démo.
  const db = apply([
    { op: 'set', path: `orgs/${ORG}`, data: { id: ORG, name: 'Maison Démo', profile } },
    { op: 'set', path: `orgs/${ORG}/sites/${MAIN}`, data: { id: MAIN, name: profile === 'restaurant' ? 'Cave du restaurant' : 'Cave principale', kind: 'cave', createdAt: now } },
    ...ops,
  ]);
  const rows = <T,>(c: string) => [...(db.get(`orgs/${ORG}/${c}`)?.values() ?? [])] as T[];
  return {
    ops,
    db,
    wines: rows<Wine>('wines'),
    stock: rows<StockLevel>('stock'),
    movements: rows<Movement>('movements'),
    docs: rows<SaleDocument>('documents'),
    payments: rows<Payment>('payments'),
    counters: rows<{ id: string; value: number }>('counters'),
    consignments: rows<Consignment>('consignments'),
    purchases: rows<PurchaseInvoice>('purchaseInvoices'),
    expenses: rows<Expense>('expenses'),
    assets: rows<Asset>('assets'),
    inventories: rows<InventorySession>('inventories'),
    lists: rows<WineList>('wineLists'),
    sites: rows<{ id: string; name: string }>('sites'),
    publicLists: [...(db.get('public_lists')?.values() ?? [])] as unknown as PublicListDoc[],
    org: db.get('orgs')?.get(ORG),
  };
}

describe.each(PROFILES)('démo %s', (profile) => {
  const d = load(profile);

  it('reste d’une taille raisonnable', () => {
    expect(d.ops.length).toBeLessThan(1500);
  });

  it('catalogue enrichi : appellation, sous-région, fiches techniques, clés uniques', () => {
    expect(d.wines.length).toBeGreaterThanOrEqual(35);
    for (const w of d.wines) {
      expect(w.appellation, w.name).toBeTruthy();
      expect(w.subRegion, w.name).toBeTruthy();
    }
    const sheets = d.wines.filter((w) => w.technicalSheet);
    expect(sheets.length).toBeGreaterThanOrEqual(12);
    for (const w of sheets) expect(w.technicalSheet!.generatedByAI).toBe(false);
    expect(new Set(d.wines.map((w) => w.canonicalKey)).size).toBe(d.wines.length);
    expect(d.wines.some((w) => w.formatCl === 150)).toBe(true);
    expect(d.wines.some((w) => w.country !== 'France')).toBe(true);
    const puligny = d.wines.find((w) => w.name === 'Puligny-Montrachet')!;
    expect([puligny.region, puligny.subRegion, puligny.appellation]).toEqual(['Bourgogne', 'Côte de Beaune', 'Puligny-Montrachet']);
    const glass = d.wines.filter((w) => w.byGlass?.enabled);
    if (profile === 'restaurant' || profile === 'chaine') {
      expect(glass.length).toBeGreaterThanOrEqual(3);
      for (const w of glass) expect(w.byGlass).toMatchObject({ glassCl: 12.5 });
    } else expect(glass).toHaveLength(0);
  });

  it('stock = Σ mouvements, jamais négatif, sur 12 mois', () => {
    const sum = new Map<string, number>();
    const sorted = [...d.movements].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
    for (const m of sorted) {
      expect(m.date <= today && m.date >= yearAgo, m.date).toBe(true);
      expect(m.createdAt).toBeLessThanOrEqual(NOW);
      for (const x of stockDeltas(m)) {
        const k = `${m.wineId}__${x.siteId}`;
        const v = (sum.get(k) ?? 0) + x.delta;
        sum.set(k, v);
        expect(v, `${m.wineLabel} @ ${m.date}`).toBeGreaterThanOrEqual(0);
      }
    }
    for (const [k, v] of sum) expect(d.db.get(`orgs/${ORG}/stock`)?.get(k)?.qty, k).toBe(v);
    for (const s of d.stock) expect(s.qty).toBe(sum.get(s.id) ?? 0);
    expect(d.stock.some((s) => s.qty === 0 && s.siteId === MAIN)).toBe(true); // références épuisées
    const months = new Set(d.movements.filter((m) => m.type === 'out').map((m) => m.date.slice(0, 7)));
    expect(months.size).toBeGreaterThanOrEqual(12);
  });

  it('achats : totaux, statuts et entrées de stock cohérents', () => {
    expect(d.purchases.length).toBeGreaterThanOrEqual(8);
    for (const p of d.purchases) {
      const t = purchaseTotals(p.lines, p.shippingHT ?? 0, 20);
      expect([p.totalHT, p.totalVAT, p.totalTTC]).toEqual([t.ht, t.vat, t.ttc]);
      expect(['received', 'paid']).toContain(p.status);
      if (p.status === 'paid') expect(p.paymentDate! >= p.date && p.paymentDate! <= today).toBe(true);
      const ins = d.movements.filter((m) => m.documentId === p.id);
      expect(ins.every((m) => m.type === 'in' && m.reason === 'achat' && m.partnerId === p.supplierId)).toBe(true);
      expect(ins.reduce((n, m) => n + m.qty, 0)).toBe(p.lines.reduce((n, l) => n + l.qty, 0));
    }
    expect(d.purchases.some((p) => p.status === 'received')).toBe(true);
  });

  it('pilotage : chiffre d’affaires, marge et ABC non plats', () => {
    const period = periodPresets(today).last12;
    const input = { wines: d.wines, stock: d.stock, movements: d.movements, docs: d.docs, period, siteId: 'all', restaurantMode: profile === 'restaurant', vatRate: 20 };
    const data = buildSalesData(input);
    const k = computeKpis(input, data);
    expect(k.revenueHT).toBeGreaterThan(10000);
    expect(k.grossMargin).toBeGreaterThan(0);
    expect(k.turnover).toBeGreaterThan(0);
    const months = monthlySeries(data.sales, period).filter((p) => p.revenueHT > 0);
    expect(months.length).toBeGreaterThanOrEqual(11);
    const abc = abcAnalysis(winePerformance(data.sales, d.wines, d.stock, 'all'));
    expect(new Set(abc.map((r) => r.cls))).toEqual(new Set(['A', 'B', 'C']));
  });

  it('inventaire clôturé avec écarts appliqués', () => {
    expect(d.inventories).toHaveLength(1);
    const inv = d.inventories[0];
    expect(inv.status).toBe('closed');
    const adj = d.movements.filter((m) => m.type === 'adjust');
    expect(adj.length).toBe(2);
    expect(adj.every((m) => m.reason === 'inventaire' && m.note === inv.name && m.siteId === inv.siteId)).toBe(true);
    expect(Object.keys(inv.counts).length).toBeGreaterThan(20);
  });

  if (profile === 'negoce' || profile === 'independant') {
    it('ventes : totaux, numérotation, compteurs, règlements et sorties de stock', () => {
      const quotes = d.docs.filter((x) => x.type === 'quote');
      const invoices = d.docs.filter((x) => x.type === 'invoice' && x.status !== 'draft');
      const credits = d.docs.filter((x) => x.type === 'credit_note');
      expect(quotes.length).toBeGreaterThanOrEqual(8);
      expect(invoices.length).toBeGreaterThanOrEqual(20);
      expect(credits.length).toBeGreaterThanOrEqual(1);
      expect(credits.length).toBeLessThanOrEqual(2);

      for (const doc of d.docs) {
        const t = withTotals(doc);
        expect([doc.totalHT, doc.totalVAT, doc.totalTTC]).toEqual([t.totalHT, t.totalVAT, t.totalTTC]);
        expect(doc.date <= today).toBe(true);
      }
      const numbers = d.docs.map((x) => x.number).filter(Boolean);
      expect(new Set(numbers).size).toBe(numbers.length);
      const counters = new Map(d.counters.map((c) => [c.id, c.value]));
      for (const n of numbers) {
        const m = /^([A-Z]+)-(\d{4})-(\d{4})$/.exec(n)!;
        expect(m, n).toBeTruthy();
        expect(counters.get(`${m[1]}-${m[2]}`) ?? 0).toBeGreaterThanOrEqual(Number(m[3]));
      }
      expect(d.docs.filter((x) => x.type !== 'quote' && x.status === 'draft').every((x) => x.number === '')).toBe(true);

      for (const inv of invoices) {
        const paid = d.payments.filter((p) => p.documentId === inv.id).reduce((s, p) => s + p.amount, 0);
        expect(paid).toBeLessThanOrEqual(inv.totalTTC - creditedAmount(inv.id, d.docs) + 0.005);
        expect(inv.status).toBe(statusAfterPayments({ ...inv, status: 'validated' }, d.payments, d.docs));
        for (const p of d.payments.filter((x) => x.documentId === inv.id)) expect(p.date >= inv.date && p.date <= today).toBe(true);
      }
      expect(d.payments.every((p) => invoices.some((i) => i.id === p.documentId))).toBe(true);

      for (const doc of [...invoices, ...credits]) {
        const expected = doc.lines.filter((l) => l.wineId && !l.isService && !l.fromConsignment).reduce((n, l) => n + l.qty, 0);
        const mvs = d.movements.filter((m) => m.documentId === doc.id);
        expect(mvs.reduce((n, m) => n + m.qty, 0)).toBe(expected);
        expect(mvs.every((m) => m.type === (doc.type === 'credit_note' ? 'in' : 'out') && m.note === doc.number)).toBe(true);
        const t = computeTotals(doc.lines, doc.shippingHT, doc.shippingVatRate, doc.discountPct);
        for (const m of mvs.filter((x) => x.reason === 'vente')) {
          const idx = doc.lines.findIndex((l) => l.wineId === m.wineId && !l.isGift);
          expect(Math.abs(m.unitPriceHT! - t.lineNets[idx] / doc.lines[idx].qty)).toBeLessThanOrEqual(0.0051);
        }
      }

      const statuses = new Set(invoices.map((i) => i.status));
      expect(statuses).toEqual(new Set(['paid', 'validated']));
      const open = invoices.filter((i) => balanceDue(i, d.payments, d.docs) > 0);
      expect(open.some((i) => i.dueDate < today)).toBe(true); // en retard
      expect(open.some((i) => i.dueDate >= today)).toBe(true); // à échoir
      expect(open.some((i) => d.payments.some((p) => p.documentId === i.id))).toBe(true); // partiellement réglée
      expect(quotes.some((q) => q.status === 'accepted' && invoices.some((i) => i.relatedDocumentId === q.id))).toBe(true);
      expect(quotes.some((q) => q.status === 'sent' && (q.validUntil ?? '') < today)).toBe(true); // expiré
      expect(quotes.some((q) => q.status === 'sent' && q.date < new Date(NOW - 7 * 86_400_000).toISOString().slice(0, 10) && (q.validUntil ?? '') >= today)).toBe(true);
    });

    it('comptabilité : résultat non nul et cohérent', () => {
      expect(d.expenses.length).toBeGreaterThanOrEqual(12);
      expect(d.assets).toHaveLength(2);
      const r = computeResult({ year: 2026, docs: d.docs, payments: d.payments, purchases: d.purchases, expenses: d.expenses, assets: d.assets });
      expect(r.revenueHT).toBeGreaterThan(0);
      expect(r.purchasesHT).toBeGreaterThan(0);
      expect(r.expensesHT).toBeGreaterThan(0);
      expect(r.depreciation).toBeGreaterThan(0);
      expect(r.receivables).toBeGreaterThan(0);
      for (const e of d.expenses) expect(e.amountTTC).toBeCloseTo(e.amountHT + e.amountTVA, 2);
    });
  }

  if (profile === 'independant') {
    it('dépôts-ventes cohérents avec les sorties « depot_vente »', () => {
      expect(d.consignments.length).toBeGreaterThanOrEqual(2);
      for (const c of d.consignments) {
        const out = d.movements.filter((m) => m.reason === 'depot_vente' && m.wineId === c.wineId && m.partnerId === c.partnerId).reduce((n, m) => n + m.qty, 0);
        const settled = d.docs.flatMap((x) => x.lines).filter((l) => l.fromConsignment === c.id).reduce((n, l) => n + l.qty, 0);
        expect(c.qty).toBe(out - settled);
        expect(c.qty).toBeGreaterThan(0);
      }
    });
  }

  if (profile === 'restaurant' || profile === 'chaine') {
    it('charte palace et carte publiée sans prix d’achat ni stock', () => {
      expect(d.org?.brand).toMatchObject({ headingFont: PRESETS.palace.headingFont, background: PRESETS.palace.background });
      expect((d.org?.brand as { tagline: string }).tagline).toBeTruthy();
      expect(d.lists).toHaveLength(1);
      const list = d.lists[0];
      expect(list).toMatchObject({ name: 'Carte des vins', useBrand: true, published: true });
      expect(list.pinnedWineIds.length).toBeGreaterThanOrEqual(2);
      const pub = d.publicLists.find((p) => p.publicId === list.publicId)!;
      expect(pub).toBeTruthy();
      expect(pub.orgId).toBe(ORG);
      expect(pub.orgName).toBe('Maison Démo');
      expect(pub.sections.length).toBeGreaterThan(3);
      const raw = JSON.stringify(pub);
      for (const k of ['buyPriceHT', 'sellPriceHT', 'unitCostHT', '"qty"', 'stock']) expect(raw).not.toContain(k);
      expect(pub.sections.flatMap((s) => s.items).every((i) => (i.priceTTC ?? 0) > 0)).toBe(true);
      expect(d.docs).toHaveLength(0);
    });

    it('plusieurs sites alimentés par transferts', () => {
      expect(d.sites.length).toBe(profile === 'chaine' ? 3 : 2);
      const transfers = d.movements.filter((m) => m.type === 'transfer');
      expect(transfers.length).toBeGreaterThan(5);
      for (const s of d.sites.filter((x) => x.id !== MAIN)) expect(d.stock.some((l) => l.siteId === s.id && l.qty > 0)).toBe(true);
    });
  }

  if (profile === 'chaine') {
    it('comptabilité du groupe', () => {
      expect(d.expenses.length).toBeGreaterThanOrEqual(12);
      expect(d.assets).toHaveLength(2);
      expect(d.sites.find((s) => s.id === MAIN)?.name).toBe('Le Grand Palais — Paris');
    });
  }
});

describe('démo : robustesse et extension', () => {
  it.each(PROFILES)('reste cohérente en début d’année (%s)', (profile) => {
    const now = Date.parse('2026-01-08T09:00:00Z');
    const d = load(profile, now);
    const sum = new Map<string, number>();
    for (const m of [...d.movements].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt))
      for (const x of stockDeltas(m)) {
        const k = `${m.wineId}__${x.siteId}`;
        sum.set(k, (sum.get(k) ?? 0) + x.delta);
        expect(sum.get(k)!).toBeGreaterThanOrEqual(0);
      }
    for (const s of d.stock) expect(s.qty).toBe(sum.get(s.id) ?? 0);
    const counters = new Map(d.counters.map((c) => [c.id, c.value]));
    for (const n of d.docs.map((x) => x.number).filter(Boolean)) {
      const [p, y, seq] = n.split('-');
      expect(counters.get(`${p}-${y}`)!).toBeGreaterThanOrEqual(Number(seq));
    }
  });

  it('expose un contexte et un point d’extension', () => {
    let seen = 0;
    const { ops, ctx } = buildDemo(ORG, MAIN, 'restaurant', {
      now: NOW,
      extras: (c) => {
        seen = c.wines.length;
        const w = c.wines.find((x) => x.byGlass?.enabled && c.stockQty(x.id, c.serviceSiteId) > 0)!;
        return [{ op: 'set', path: `orgs/${ORG}/openBottles/x`, data: { wineId: w.id } }];
      },
    });
    expect(seen).toBe(ctx.wines.length);
    expect(ops[ops.length - 1].path).toBe(`orgs/${ORG}/openBottles/x`);
    expect(ctx.serviceSiteId).not.toBe(MAIN);
    expect(ctx.clients.length).toBeGreaterThan(3);
    expect(ctx.wineList?.published).toBe(true);
  });
});
