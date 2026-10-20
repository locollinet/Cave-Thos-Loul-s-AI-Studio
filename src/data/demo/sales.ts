import type { Partner, Wine } from '@/types';
import type { Op } from '../store';
import { round2, uid } from '@/lib/utils';
import { wineLabel } from '@/lib/wine';
import { addDays, computeTotals, counterKey, CREDIT_PREFIX, dueDateFor, formatNumber, partnerSnapshot, statusAfterPayments, withTotals } from '@/modules/negoce/calc';
import { clean } from '@/modules/negoce/ops';
import type { Consignment, DocLine, Payment, PaymentMethod, SaleDocument } from '@/modules/negoce/types';
import type { ClientKey, WineSeed } from './catalog';
import type { DemoWorld } from './world';

export const DEMO_PREFIXES = { invoice: 'FAC', quote: 'DEV', credit_note: CREDIT_PREFIX } as const;
const VAT = 20;

type InvState = 'paid' | 'partial' | 'overdue' | 'unpaid';

interface InvSpec {
  ago: number;
  client: ClientKey;
  state: InvState;
  lines?: number;
  fromQuote?: number;
  shipping?: number;
  gift?: boolean;
  credit?: 'return' | 'gesture';
  force?: string[];
  consignment?: string;
}

interface QuoteSpec {
  ago: number;
  client: ClientKey;
  lines: number;
  status: 'draft' | 'sent' | 'accepted' | 'cancelled';
  validity?: number;
}

const QUOTES: QuoteSpec[] = [
  { ago: 214, client: 'lumieres', lines: 4, status: 'accepted' },
  { ago: 110, client: 'club', lines: 3, status: 'accepted' },
  { ago: 160, client: 'verdier', lines: 3, status: 'cancelled' },
  { ago: 62, client: 'comptoir', lines: 3, status: 'sent' }, // expiré
  { ago: 23, client: 'abbaye', lines: 3, status: 'sent' },
  { ago: 13, client: 'lumieres', lines: 2, status: 'sent', validity: 45 },
  { ago: 5, client: 'dubois', lines: 2, status: 'sent' },
  { ago: 1, client: 'morel', lines: 2, status: 'draft' },
];

const INVOICES: InvSpec[] = [
  { ago: 358, client: 'abbaye', lines: 3, state: 'paid' },
  { ago: 349, client: 'comptoir', lines: 3, state: 'paid' },
  { ago: 333, client: 'lumieres', lines: 4, state: 'paid' },
  { ago: 318, client: 'verdier', lines: 4, state: 'paid', shipping: 35 },
  { ago: 312, client: 'club', lines: 3, state: 'paid', gift: true },
  { ago: 306, client: 'dubois', lines: 2, state: 'paid', force: ['krug-gc'] },
  { ago: 301, client: 'abbaye', lines: 3, state: 'paid', shipping: 25 },
  { ago: 268, client: 'comptoir', lines: 3, state: 'paid', credit: 'return' },
  { ago: 236, client: 'morel', lines: 2, state: 'paid', force: ['rousseau-chambertin'] },
  { ago: 205, client: 'lumieres', fromQuote: 0, state: 'paid' },
  { ago: 176, client: 'abbaye', lines: 3, state: 'paid', credit: 'gesture' },
  { ago: 152, client: 'verdier', lines: 3, state: 'paid', force: ['trevallon'] },
  { ago: 124, client: 'comptoir', lines: 3, state: 'paid', consignment: 'c1' },
  { ago: 103, client: 'club', fromQuote: 1, state: 'paid' },
  { ago: 84, client: 'lumieres', lines: 3, state: 'overdue', force: ['tempier-rose'] },
  { ago: 66, client: 'abbaye', lines: 2, state: 'partial' },
  { ago: 52, client: 'dubois', lines: 2, state: 'paid', force: ['trevallon'] },
  { ago: 41, client: 'verdier', lines: 3, state: 'partial', shipping: 35 },
  { ago: 36, client: 'comptoir', lines: 3, state: 'overdue' },
  { ago: 19, client: 'lumieres', lines: 4, state: 'unpaid' },
  { ago: 9, client: 'morel', lines: 2, state: 'paid' },
  { ago: 4, client: 'club', lines: 3, state: 'unpaid' },
];

interface ConsignmentSpec {
  key: string;
  client: ClientKey;
  wine: string;
  ago: number;
  qty: number;
  settled: number; // soldé par la facture marquée `consignment`
}

const CONSIGNMENTS: ConsignmentSpec[] = [
  { key: 'c1', client: 'comptoir', wine: 'lapierre-morgon', ago: 150, qty: 24, settled: 12 },
  { key: 'c3', client: 'abbaye', wine: 'huet-haut-lieu', ago: 100, qty: 18, settled: 0 },
  { key: 'c2', client: 'lumieres', wine: 'ruinart-bdb', ago: 40, qty: 12, settled: 0 },
];

/** Hors catalogue de vente courant : bouteilles rares conservées, références épuisées vendues uniquement via `force`. */
const NOT_RANDOM = new Set(['drc-tache', 'rousseau-chambertin', 'trevallon']);

function qtyFor(s: WineSeed, pro: boolean, w: DemoWorld): number {
  const { rng } = w;
  let q = pro
    ? s.buy < 60 ? rng.pick([12, 18, 24, 24, 36]) : s.buy < 150 ? rng.pick([6, 12, 12, 18]) : rng.pick([3, 6, 6])
    : s.buy < 60 ? rng.pick([3, 6, 6, 12]) : s.buy < 150 ? rng.pick([1, 2, 3, 6]) : rng.pick([1, 1, 2]);
  if ((s.format ?? 75) >= 150) q = Math.max(1, Math.ceil(q / 3));
  return q;
}

const line = (wine: Wine, qty: number, client: Partner, extra: Partial<DocLine> = {}): DocLine => ({
  id: uid(),
  wineId: wine.id,
  description: wineLabel(wine),
  qty,
  unitPriceHT: wine.sellPriceHT ?? 0,
  discountPct: client.discountPct ?? 0,
  vatRate: VAT,
  ...extra,
});

function pickLines(w: DemoWorld, client: Partner, n: number, force: string[] = []): DocLine[] {
  const pro = client.customerType !== 'particulier';
  const chosen: Wine[] = force.map((k) => w.wineByKey.get(k)).filter((x): x is Wine => !!x);
  const pool = w.wines
    .map((wine) => ({ wine, s: w.seedById.get(wine.id)! }))
    .filter(({ s }) => !NOT_RANDOM.has(s.key) && (!pro || s.buy <= 250))
    .map(({ wine, s }) => ({ wine, s, weight: pro ? (s.buy < 60 ? 5 : s.buy < 150 ? 3 : 1) : s.buy < 60 ? 3 : s.buy < 250 ? 3 : 1 }));
  let guard = 0;
  const wanted = Math.max(pro ? n + 1 : n, force.length);
  while (chosen.length < wanted && guard++ < 200) {
    const total = pool.reduce((t, p) => t + p.weight, 0);
    let r = w.rng.next() * total;
    const hit = pool.find((p) => (r -= p.weight) < 0) ?? pool[pool.length - 1];
    if (!chosen.includes(hit.wine)) chosen.push(hit.wine);
  }
  return chosen.map((wine) => line(wine, qtyFor(w.seedById.get(wine.id)!, pro, w), client));
}

function makeDoc(w: DemoWorld, type: SaleDocument['type'], ago: number, client: Partner, lines: DocLine[], extra: Partial<SaleDocument> = {}): SaleDocument {
  const date = w.clock.iso(ago);
  const snap = partnerSnapshot(client);
  return withTotals({
    id: uid(),
    type,
    number: '',
    status: 'draft',
    date,
    dueDate: type === 'invoice' ? dueDateFor(date, snap.paymentTermsDays) : date,
    validUntil: type === 'quote' ? addDays(date, 30) : undefined,
    ...snap,
    siteId: w.mainSiteId,
    lines,
    shippingHT: 0,
    shippingVatRate: VAT,
    discountPct: 0,
    notes: '',
    createdAt: w.clock.ts(date, 2 * 3_600_000),
    createdBy: w.actor.userId,
    ...extra,
  });
}

const isNumbered = (d: SaleDocument) => d.type === 'quote' || d.status !== 'draft';

export interface SalesResult {
  ops: Op[];
  docs: SaleDocument[];
  payments: Payment[];
  consignments: Consignment[];
  counters: Map<string, number>;
}

/** Devis, factures, avoirs, règlements et dépôts-ventes cohérents avec le module Ventes. */
export function buildSales(w: DemoWorld, withConsignments: boolean): SalesResult {
  const client = (k: ClientKey) => w.clients.get(k)!;
  const docs: SaleDocument[] = [];

  // Devis
  const quotes = QUOTES.map((q) => {
    const c = client(q.client);
    const d = makeDoc(w, 'quote', q.ago, c, pickLines(w, c, q.lines), {
      notes: 'Proposition valable dans la limite des stocks disponibles. Tarifs nets hors taxes.',
    });
    if (q.validity) d.validUntil = addDays(d.date, q.validity);
    d.status = q.status;
    docs.push(d);
    return d;
  });

  // Dépôts-ventes (indépendant)
  const consignments: Consignment[] = [];
  const consignmentByKey = new Map<string, { c: Consignment; spec: ConsignmentSpec }>();
  if (withConsignments) {
    for (const spec of CONSIGNMENTS) {
      const wine = w.wineByKey.get(spec.wine);
      if (!wine) continue;
      const cl = client(spec.client);
      const c: Consignment = {
        id: uid(),
        partnerId: cl.id,
        wineId: wine.id,
        qty: spec.qty - spec.settled,
        priceHT: round2((wine.sellPriceHT ?? 0) * (1 - (cl.discountPct ?? 0) / 100)),
        siteId: w.mainSiteId,
        createdAt: w.clock.ts(w.clock.iso(spec.ago), 3 * 3_600_000),
      };
      consignments.push(c);
      consignmentByKey.set(spec.key, { c, spec });
      w.ledger.add({ wineId: wine.id, siteId: w.mainSiteId, type: 'out', qty: spec.qty, reason: 'depot_vente', date: w.clock.iso(spec.ago), partnerId: cl.id, unitPriceHT: c.priceHT, note: 'Mise en dépôt-vente' });
    }
  }

  // Factures
  const invoices = INVOICES.map((spec) => {
    const c = client(spec.client);
    let lines: DocLine[];
    let related: string | undefined;
    if (spec.fromQuote !== undefined) {
      const q = quotes[spec.fromQuote];
      lines = q.lines.map((l) => ({ ...l, id: uid() }));
      related = q.id;
    } else lines = pickLines(w, c, spec.lines ?? 3, spec.force);
    if (spec.gift) {
      const g = w.wineByKey.get('lapierre-morgon');
      if (g) lines.push(line(g, 1, c, { isGift: true, discountPct: 0 }));
    }
    const cons = spec.consignment ? consignmentByKey.get(spec.consignment) : undefined;
    if (cons && cons.spec.settled > 0) {
      const wine = w.wines.find((x) => x.id === cons.c.wineId)!;
      lines.push(line(wine, cons.spec.settled, c, { unitPriceHT: cons.c.priceHT, discountPct: 0, fromConsignment: cons.c.id }));
    }
    const d = makeDoc(w, 'invoice', spec.ago, c, lines, { shippingHT: spec.shipping ?? 0, relatedDocumentId: related });
    d.status = 'validated';
    docs.push(d);
    return { d, spec };
  });

  // Avoirs
  const credits = new Map<string, SaleDocument>();
  for (const { d: inv, spec } of invoices) {
    if (!spec.credit) continue;
    const c = client(spec.client);
    const ago = spec.ago - (spec.credit === 'return' ? 12 : 20);
    const lines: DocLine[] =
      spec.credit === 'return'
        ? [{ ...inv.lines.find((l) => l.wineId && !l.isGift && !l.fromConsignment)!, id: uid(), qty: 1 }]
        : [{ id: uid(), description: 'Geste commercial — retard de livraison', qty: 1, unitPriceHT: 40, discountPct: 0, vatRate: VAT, isService: true }];
    const cn = makeDoc(w, 'credit_note', ago, c, lines, {
      relatedDocumentId: inv.id,
      notes: spec.credit === 'return' ? 'Reprise d’une bouteille défectueuse (bouchon).' : 'Geste commercial accordé suite au retard de livraison.',
    });
    cn.status = 'validated';
    credits.set(inv.id, cn);
    docs.push(cn);
  }

  // Brouillon de facture en cours
  const draftClient = client('verdier');
  docs.push(makeDoc(w, 'invoice', 1, draftClient, pickLines(w, draftClient, 2)));

  // Numérotation chronologique par type et par année
  const counters = new Map<string, number>();
  [...docs]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .forEach((d) => {
      if (!isNumbered(d)) return;
      const prefix = DEMO_PREFIXES[d.type];
      const year = d.date.slice(0, 4);
      const k = counterKey(prefix, year);
      const seq = (counters.get(k) ?? 0) + 1;
      counters.set(k, seq);
      d.number = formatNumber(prefix, year, seq);
    });

  // Mouvements de stock : exactement ceux que produirait la validation (buildValidationOps)
  for (const d of docs) {
    if (d.type === 'quote' || d.status === 'draft') continue;
    const isCredit = d.type === 'credit_note';
    const totals = computeTotals(d.lines, d.shippingHT, d.shippingVatRate, d.discountPct);
    d.lines.forEach((l, idx) => {
      if (l.isService || !l.wineId || !l.qty || l.fromConsignment) return;
      w.ledger.add({
        wineId: l.wineId,
        siteId: d.siteId,
        type: isCredit ? 'in' : 'out',
        qty: l.qty,
        reason: isCredit ? 'retour' : l.isGift ? 'offert' : 'vente',
        date: d.date,
        partnerId: d.partnerId,
        documentId: d.id,
        unitPriceHT: l.isGift ? 0 : round2(totals.lineNets[idx] / l.qty),
        unitCostHT: isCredit ? w.wines.find((x) => x.id === l.wineId)?.buyPriceHT : undefined,
        note: d.number,
      });
    });
  }

  // Règlements
  const payments: Payment[] = [];
  const pay = (inv: SaleDocument, ago: number, amount: number, method: PaymentMethod) => {
    const date = w.clock.iso(Math.max(1, ago));
    payments.push({
      id: uid(),
      documentId: inv.id,
      date: date < inv.date ? inv.date : date,
      amount: round2(amount),
      method,
      reference: method === 'virement' ? `VIR ${inv.number}` : method === 'cheque' ? `Chèque n° ${w.rng.int(1000000, 9999999)}` : '',
    });
  };
  for (const { d: inv, spec } of invoices) {
    const pro = inv.partnerType !== 'particulier';
    const method: PaymentMethod = pro ? (w.rng.chance(0.8) ? 'virement' : 'cheque') : w.rng.chance(0.6) ? 'carte' : 'virement';
    const credit = credits.get(inv.id);
    const balance = round2(inv.totalTTC - (credit?.totalTTC ?? 0));
    const terms = inv.paymentTermsDays;
    let payAgo = terms === 0 ? spec.ago : spec.ago - terms + w.rng.int(-6, 4);
    if (credit) payAgo = Math.min(payAgo, spec.ago - (spec.credit === 'return' ? 14 : 22)); // réglé après l'avoir
    payAgo = Math.max(1, Math.min(payAgo, spec.ago));
    if (spec.state === 'paid') {
      if (pro && balance > 3000 && spec.ago > 90) {
        const deposit = Math.round(balance / 2 / 10) * 10;
        pay(inv, spec.ago - 7, deposit, method);
        pay(inv, payAgo, balance - deposit, method);
      } else pay(inv, payAgo, balance, method);
    } else if (spec.state === 'partial') {
      pay(inv, Math.max(1, spec.ago - Math.ceil(terms / 2)), Math.round((balance * 0.5) / 10) * 10, method);
    }
  }
  for (const { d: inv } of invoices) inv.status = statusAfterPayments({ ...inv, status: 'validated' }, payments, docs);

  // Pertes et dégustations hors documents
  const shrink: [string, number, number, 'degustation' | 'casse', string][] = [
    ['ruinart-bdb', 2, 300, 'degustation', 'Dégustation clients de fin d’année'],
    ['zind-windsbuhl', 2, 300, 'degustation', 'Dégustation clients de fin d’année'],
    ['fevre-montmains', 1, 210, 'casse', 'Bouteille cassée lors d’une livraison'],
    ['lapierre-morgon', 3, 120, 'degustation', 'Salon professionnel'],
    ['jamet-cote-rotie', 2, 120, 'degustation', 'Salon professionnel'],
  ];
  for (const [k, qty, ago, reason, note] of shrink) {
    const wine = w.wineByKey.get(k);
    if (wine) w.ledger.add({ wineId: wine.id, siteId: w.mainSiteId, type: 'out', qty, reason, date: w.clock.iso(ago), note });
  }

  const base = `orgs/${w.orgId}`;
  const ops: Op[] = [
    ...docs.map((d): Op => ({ op: 'set', path: `${base}/documents/${d.id}`, data: clean(d) as never })),
    ...payments.map((p): Op => ({ op: 'set', path: `${base}/payments/${p.id}`, data: clean(p) as never })),
    ...[...counters].map(([id, value]): Op => ({ op: 'set', path: `${base}/counters/${id}`, data: { id, value } })),
    ...consignments.map((c): Op => ({ op: 'set', path: `${base}/consignments/${c.id}`, data: clean(c) as never })),
  ];
  return { ops, docs, payments, consignments, counters };
}
