import type { Partner, StockLevel, Wine } from '@/types';
import { round2, uid } from '@/lib/utils';
import { qtyAt } from '@/data/stock';
import type { AgingRow, AgingSummary, Consignment, DocLine, DocTotals, DocType, Payment, SaleDocument, VatBreakdownRow } from './types';

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export { addDays };

export const daysBetween = (fromIso: string, toIso: string): number =>
  Math.round((new Date(`${toIso}T12:00:00Z`).getTime() - new Date(`${fromIso}T12:00:00Z`).getTime()) / 86400000);

/* ------------------------------------------------------------ totaux */

export const lineNetHT = (l: Pick<DocLine, 'qty' | 'unitPriceHT' | 'discountPct' | 'isGift'>): number =>
  l.isGift ? 0 : round2(l.qty * l.unitPriceHT * (1 - (l.discountPct || 0) / 100));

/** Arrondi par ligne (remise globale incluse), TVA calculée par taux sur la base cumulée. */
export function computeTotals(lines: DocLine[], shippingHT = 0, shippingVatRate = 0, globalDiscountPct = 0): DocTotals {
  const k = 1 - (globalDiscountPct || 0) / 100;
  const lineNets = lines.map((l) => round2(lineNetHT(l) * k));
  const bases = new Map<number, number>();
  lines.forEach((l, i) => bases.set(l.vatRate, (bases.get(l.vatRate) ?? 0) + lineNets[i]));
  if (shippingHT) bases.set(shippingVatRate, (bases.get(shippingVatRate) ?? 0) + round2(shippingHT));
  const breakdown: VatBreakdownRow[] = [...bases.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, base]) => ({ rate, baseHT: round2(base), vat: round2((base * rate) / 100) }));
  const totalHT = round2(breakdown.reduce((s, r) => s + r.baseHT, 0));
  const totalVAT = round2(breakdown.reduce((s, r) => s + r.vat, 0));
  return { lineNets, shippingHT: round2(shippingHT), breakdown, totalHT, totalVAT, totalTTC: round2(totalHT + totalVAT) };
}

export function withTotals<T extends Pick<SaleDocument, 'lines' | 'shippingHT' | 'shippingVatRate' | 'discountPct'>>(d: T): T & Pick<SaleDocument, 'totalHT' | 'totalVAT' | 'totalTTC'> {
  const t = computeTotals(d.lines, d.shippingHT, d.shippingVatRate, d.discountPct);
  return { ...d, totalHT: t.totalHT, totalVAT: t.totalVAT, totalTTC: t.totalTTC };
}

/* ------------------------------------------------------------ numérotation */

export const CREDIT_PREFIX = 'AV';

export const counterKey = (prefix: string, year: number | string): string => `${prefix}-${year}`;
export const formatNumber = (prefix: string, year: number | string, seq: number): string => `${prefix}-${year}-${String(seq).padStart(4, '0')}`;

export const prefixFor = (type: DocType, org: { invoicePrefix: string; quotePrefix: string }): string =>
  type === 'invoice' ? org.invoicePrefix : type === 'quote' ? org.quotePrefix : CREDIT_PREFIX;

/* ------------------------------------------------------------ création / conversions */

export const newLine = (vatRate: number): DocLine => ({ id: uid(), description: '', qty: 1, unitPriceHT: 0, discountPct: 0, vatRate });

export function newDocument(type: DocType, o: { siteId: string; vatRate: number; userId: string; date: string; validityDays?: number }): SaleDocument {
  return {
    id: uid(),
    type,
    number: '',
    status: 'draft',
    date: o.date,
    dueDate: o.date,
    validUntil: type === 'quote' ? addDays(o.date, o.validityDays ?? 30) : undefined,
    partnerId: '',
    partnerName: '',
    siteId: o.siteId,
    lines: [],
    shippingHT: 0,
    shippingVatRate: o.vatRate,
    discountPct: 0,
    totalHT: 0,
    totalVAT: 0,
    totalTTC: 0,
    notes: '',
    paymentTermsDays: 30,
    createdAt: Date.now(),
    createdBy: o.userId,
  };
}

export const partnerSnapshot = (p: Partner): Pick<SaleDocument, 'partnerId' | 'partnerName' | 'partnerAddress' | 'partnerVatNumber' | 'partnerType' | 'paymentTermsDays'> => ({
  partnerId: p.id,
  partnerName: p.name,
  partnerAddress: [p.address, [p.postalCode, p.city].filter(Boolean).join(' ')].filter(Boolean).join('\n') || undefined,
  partnerVatNumber: p.vatNumber,
  partnerType: p.customerType,
  paymentTermsDays: p.paymentTermsDays ?? 30,
});

export const dueDateFor = (date: string, termsDays: number): string => addDays(date, Math.max(0, termsDays));

export function quoteToInvoice(quote: SaleDocument, o: { date: string; userId: string }): SaleDocument {
  return withTotals({
    ...quote,
    id: uid(),
    type: 'invoice' as const,
    number: '',
    status: 'draft' as const,
    date: o.date,
    dueDate: dueDateFor(o.date, quote.paymentTermsDays),
    validUntil: undefined,
    lines: quote.lines.map((l) => ({ ...l, id: uid() })),
    relatedDocumentId: quote.id,
    createdAt: Date.now(),
    createdBy: o.userId,
  });
}

export function creditNoteFromInvoice(inv: SaleDocument, o: { date: string; userId: string }): SaleDocument {
  return withTotals({
    ...inv,
    id: uid(),
    type: 'credit_note' as const,
    number: '',
    status: 'draft' as const,
    date: o.date,
    dueDate: o.date,
    validUntil: undefined,
    lines: inv.lines.map((l) => ({ ...l, id: uid() })),
    relatedDocumentId: inv.id,
    createdAt: Date.now(),
    createdBy: o.userId,
  });
}

/* ------------------------------------------------------------ prix & stock */

export function priceForPartner(wine: Pick<Wine, 'sellPriceHT'>, partner?: Pick<Partner, 'discountPct'>): { unitPriceHT: number; discountPct: number } {
  return { unitPriceHT: wine.sellPriceHT ?? 0, discountPct: partner?.discountPct ?? 0 };
}

export interface Shortage {
  wineId: string;
  requested: number;
  available: number;
}

/** Besoins en stock (hors services et dépôts-ventes) comparés au stock du site de prélèvement. */
export function stockShortages(lines: DocLine[], stock: StockLevel[], siteId: string): Shortage[] {
  const need = new Map<string, number>();
  for (const l of lines) if (l.wineId && !l.isService && !l.fromConsignment) need.set(l.wineId, (need.get(l.wineId) ?? 0) + l.qty);
  const out: Shortage[] = [];
  for (const [wineId, requested] of need) {
    const available = qtyAt(stock, wineId, siteId);
    if (requested > available) out.push({ wineId, requested, available });
  }
  return out;
}

/* ------------------------------------------------------------ règlements */

export const paidAmount = (docId: string, payments: Payment[]): number => round2(payments.filter((p) => p.documentId === docId).reduce((s, p) => s + p.amount, 0));

/** Avoirs validés rattachés à une facture. */
export const creditedAmount = (invoiceId: string, docs: SaleDocument[]): number =>
  round2(docs.filter((d) => d.type === 'credit_note' && d.relatedDocumentId === invoiceId && (d.status === 'validated' || d.status === 'paid')).reduce((s, d) => s + d.totalTTC, 0));

export const balanceDue = (inv: SaleDocument, payments: Payment[], docs: SaleDocument[]): number =>
  inv.type !== 'invoice' || inv.status === 'draft' || inv.status === 'cancelled' ? 0 : Math.max(0, round2(inv.totalTTC - paidAmount(inv.id, payments) - creditedAmount(inv.id, docs)));

export const statusAfterPayments = (inv: SaleDocument, payments: Payment[], docs: SaleDocument[]): SaleDocument['status'] =>
  inv.status === 'cancelled' || inv.status === 'draft' ? inv.status : balanceDue({ ...inv, status: 'validated' }, payments, docs) <= 0.004 ? 'paid' : 'validated';

export function unpaidInvoices(docs: SaleDocument[], payments: Payment[], asOf: string): AgingRow[] {
  return docs
    .filter((d) => d.type === 'invoice' && d.status === 'validated')
    .map((doc) => ({ doc, balance: balanceDue(doc, payments, docs), daysLate: daysBetween(doc.dueDate, asOf) }))
    .filter((r) => r.balance > 0.004)
    .sort((a, b) => b.daysLate - a.daysLate);
}

export function agingSummary(rows: AgingRow[]): AgingSummary {
  const s: AgingSummary = { current: 0, d0_30: 0, d30_60: 0, d60plus: 0, total: 0 };
  for (const r of rows) {
    if (r.daysLate <= 0) s.current += r.balance;
    else if (r.daysLate <= 30) s.d0_30 += r.balance;
    else if (r.daysLate <= 60) s.d30_60 += r.balance;
    else s.d60plus += r.balance;
    s.total += r.balance;
  }
  return { current: round2(s.current), d0_30: round2(s.d0_30), d30_60: round2(s.d30_60), d60plus: round2(s.d60plus), total: round2(s.total) };
}

export const remindersToSend = (rows: AgingRow[]): AgingRow[] => rows.filter((r) => r.daysLate > 0);

/* ------------------------------------------------------------ mentions légales */

export const LATE_PENALTY_MULTIPLIER = 3;
export const RECOVERY_FEE = 40;

/** Mentions de pénalités applicables : indemnité forfaitaire de 40 € uniquement entre professionnels. */
export const showRecoveryFee = (partnerType: SaleDocument['partnerType']): boolean => partnerType !== 'particulier';

/* ------------------------------------------------------------ dashboard */

export interface SalesKpis {
  monthRevenueHT: number;
  openQuotes: number;
  openQuotesTotalHT: number;
  unpaidTotal: number;
  overdueTotal: number;
}

export function salesKpis(docs: SaleDocument[], payments: Payment[], asOf: string): SalesKpis {
  const month = asOf.slice(0, 7);
  const sign = (d: SaleDocument) => (d.type === 'credit_note' ? -1 : 1);
  const billed = docs.filter((d) => d.type !== 'quote' && (d.status === 'validated' || d.status === 'paid') && d.date.startsWith(month));
  const quotes = docs.filter((d) => d.type === 'quote' && (d.status === 'draft' || d.status === 'sent'));
  const unpaid = unpaidInvoices(docs, payments, asOf);
  return {
    monthRevenueHT: round2(billed.reduce((s, d) => s + sign(d) * d.totalHT, 0)),
    openQuotes: quotes.length,
    openQuotesTotalHT: round2(quotes.reduce((s, d) => s + d.totalHT, 0)),
    unpaidTotal: agingSummary(unpaid).total,
    overdueTotal: round2(unpaid.filter((r) => r.daysLate > 0).reduce((s, r) => s + r.balance, 0)),
  };
}

/* ------------------------------------------------------------ dépôt-vente */

export interface ConsignmentGroup {
  partnerId: string;
  items: Consignment[];
  bottles: number;
  valueHT: number;
}

export function groupConsignments(list: Consignment[]): ConsignmentGroup[] {
  const m = new Map<string, ConsignmentGroup>();
  for (const c of list) {
    if (c.qty <= 0) continue;
    const g = m.get(c.partnerId) ?? { partnerId: c.partnerId, items: [], bottles: 0, valueHT: 0 };
    g.items.push(c);
    g.bottles += c.qty;
    g.valueHT = round2(g.valueHT + c.qty * c.priceHT);
    m.set(c.partnerId, g);
  }
  return [...m.values()];
}

/* ------------------------------------------------------------ marges */

export interface Margin {
  revenueHT: number;
  costHT: number;
  marginHT: number;
  /** Taux de marque : marge / prix de vente HT. */
  marginRate: number | null;
  /** Coefficient : prix de vente HT / coût d'achat HT. */
  coef: number | null;
}

const marginOf = (revenueHT: number, costHT: number): Margin => ({
  revenueHT: round2(revenueHT),
  costHT: round2(costHT),
  marginHT: round2(revenueHT - costHT),
  marginRate: revenueHT > 0 ? round2(((revenueHT - costHT) / revenueHT) * 100) : null,
  coef: costHT > 0 ? round2(revenueHT / costHT) : null,
});

/** Marge d'une ligne (net HT après remises) ; `null` si le prix d'achat est inconnu ou la ligne n'est pas un vin. */
export function lineMargin(line: Pick<DocLine, 'qty' | 'wineId' | 'isService'>, netHT: number, buyPriceHT: number | undefined): Margin | null {
  if (!line.wineId || line.isService || buyPriceHT === undefined || buyPriceHT === null) return null;
  return marginOf(netHT, line.qty * buyPriceHT);
}

export interface DocMargin extends Margin {
  /** Lignes de vin dont le prix d'achat est inconnu (exclues du calcul). */
  missing: number;
}

/** Marge globale des lignes de vin (hors transport et services), sur les nets HT remise globale incluse. */
export function docMargin(lines: DocLine[], nets: number[], wines: Pick<Wine, 'id' | 'buyPriceHT'>[]): DocMargin {
  const buy = new Map(wines.map((w) => [w.id, w.buyPriceHT]));
  let revenue = 0;
  let cost = 0;
  let missing = 0;
  lines.forEach((l, i) => {
    if (!l.wineId || l.isService) return;
    const m = lineMargin(l, nets[i] ?? 0, buy.get(l.wineId));
    if (!m) {
      missing++;
      return;
    }
    revenue += m.revenueHT;
    cost += m.costHT;
  });
  return { ...marginOf(revenue, cost), missing };
}

/** Raisons pour lesquelles un document ne peut pas encore être enregistré / validé (clés i18n). */
export function saveBlockers(doc: Pick<SaleDocument, 'partnerId' | 'lines'>, forValidation: boolean): string[] {
  const out: string[] = [];
  if (!doc.partnerId) out.push('negoce.block.client');
  if (forValidation && !doc.lines.length) out.push('negoce.block.lines');
  if (forValidation && doc.lines.some((l) => !l.description.trim())) out.push('negoce.block.description');
  return out;
}
