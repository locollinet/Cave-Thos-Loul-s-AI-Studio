import type { Wine } from '@/types';
import type { Op } from '@/data/store';
import { buildMovementOps, type Actor, type MovementInput } from '@/data/stock';
import { round2, uid } from '@/lib/utils';
import { computeTotals, counterKey, creditedAmount, formatNumber, statusAfterPayments, withTotals } from './calc';
import type { Consignment, CounterDoc, Payment, SaleDocument } from './types';

/** Firestore refuse `undefined` : on retire les clés vides, récursivement. */
export function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clean) as T;
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).map(([k, x]) => [k, clean(x)])) as T;
  }
  return v;
}

export const docPath = (orgId: string, id: string) => `orgs/${orgId}/documents/${id}`;

export const saveDocumentOps = (orgId: string, doc: SaleDocument): Op[] => [{ op: 'set', path: docPath(orgId, doc.id), data: clean(withTotals(doc)) as never }];

export async function nextSeq(getDoc: (path: string) => Promise<CounterDoc | null>, orgId: string, key: string): Promise<number> {
  const c = await getDoc(`orgs/${orgId}/counters/${key}`);
  return (c?.value ?? 0) + 1;
}

const counterOp = (orgId: string, key: string): Op => ({ op: 'inc', path: `orgs/${orgId}/counters/${key}`, field: 'value', by: 1, data: { id: key } });

export interface ValidationInput {
  orgId: string;
  doc: SaleDocument;
  prefix: string;
  seq: number;
  wines: Wine[];
  actor: Actor;
  related?: SaleDocument; // facture d'origine d'un avoir
  docs?: SaleDocument[];
  payments?: Payment[];
  skipCounterOp?: boolean;
}

/** Numérote, verrouille et génère les mouvements de stock dans un seul lot d'écritures. */
export function buildValidationOps(i: ValidationInput): { doc: SaleDocument; ops: Op[] } {
  const year = i.doc.date.slice(0, 4);
  const key = counterKey(i.prefix, year);
  const validated: SaleDocument = withTotals({ ...i.doc, number: formatNumber(i.prefix, year, i.seq), status: 'validated' });
  const totals = computeTotals(validated.lines, validated.shippingHT, validated.shippingVatRate, validated.discountPct);
  const wineById = new Map(i.wines.map((w) => [w.id, w]));
  const isCredit = validated.type === 'credit_note';

  const inputs: MovementInput[] = [];
  const ops: Op[] = i.skipCounterOp ? [] : [counterOp(i.orgId, key)];
  validated.lines.forEach((l, idx) => {
    if (l.isService || !l.wineId || !l.qty) return;
    if (l.fromConsignment) {
      ops.push({ op: 'inc', path: `orgs/${i.orgId}/consignments/${l.fromConsignment}`, field: 'qty', by: isCredit ? l.qty : -l.qty });
      return;
    }
    const wine = wineById.get(l.wineId);
    if (!wine) return;
    inputs.push({
      wine,
      siteId: validated.siteId,
      type: isCredit ? 'in' : 'out',
      qty: l.qty,
      reason: isCredit ? 'retour' : l.isGift ? 'offert' : 'vente',
      date: validated.date,
      partnerId: validated.partnerId || undefined,
      documentId: validated.id,
      unitPriceHT: l.isGift ? 0 : round2(totals.lineNets[idx] / l.qty),
      unitCostHT: wine.buyPriceHT,
      note: validated.number,
    });
  });
  ops.push(...buildMovementOps(i.orgId, inputs, i.actor));
  ops.push({ op: 'set', path: docPath(i.orgId, validated.id), data: clean(validated) as never });

  if (isCredit && i.related && i.related.status !== 'cancelled') {
    const docs = [...(i.docs ?? []).filter((d) => d.id !== validated.id), validated];
    const fullyCredited = creditedAmount(i.related.id, docs) >= i.related.totalTTC - 0.004;
    const status = fullyCredited && !(i.payments ?? []).some((p) => p.documentId === i.related!.id) ? 'cancelled' : statusAfterPayments(i.related, i.payments ?? [], docs);
    if (status !== i.related.status) ops.push({ op: 'set', path: docPath(i.orgId, i.related.id), data: { status }, merge: true });
  }
  return { doc: validated, ops };
}

export function convertQuoteOps(orgId: string, quote: SaleDocument, invoice: SaleDocument): Op[] {
  return [
    ...saveDocumentOps(orgId, invoice),
    { op: 'set', path: docPath(orgId, quote.id), data: { status: 'accepted' }, merge: true },
  ];
}

/* ------------------------------------------------------------ règlements */

export function addPaymentOps(orgId: string, payment: Payment, invoice: SaleDocument, payments: Payment[], docs: SaleDocument[]): Op[] {
  const status = statusAfterPayments(invoice, [...payments, payment], docs);
  const ops: Op[] = [{ op: 'set', path: `orgs/${orgId}/payments/${payment.id}`, data: clean(payment) as never }];
  if (status !== invoice.status) ops.push({ op: 'set', path: docPath(orgId, invoice.id), data: { status }, merge: true });
  return ops;
}

export function deletePaymentOps(orgId: string, payment: Payment, invoice: SaleDocument | undefined, payments: Payment[], docs: SaleDocument[]): Op[] {
  const ops: Op[] = [{ op: 'delete', path: `orgs/${orgId}/payments/${payment.id}` }];
  if (invoice) {
    const status = statusAfterPayments(invoice, payments.filter((p) => p.id !== payment.id), docs);
    if (status !== invoice.status) ops.push({ op: 'set', path: docPath(orgId, invoice.id), data: { status }, merge: true });
  }
  return ops;
}

export const newPayment = (documentId: string, date: string, amount: number): Payment => ({ id: uid(), documentId, date, amount, method: 'virement', reference: '' });

/* ------------------------------------------------------------ dépôt-vente */

export function depositOps(orgId: string, c: Consignment, wine: Wine, actor: Actor, date: string): Op[] {
  return [
    { op: 'set', path: `orgs/${orgId}/consignments/${c.id}`, data: clean(c) as never },
    ...buildMovementOps(
      orgId,
      [{ wine, siteId: c.siteId, type: 'out', qty: c.qty, reason: 'depot_vente', partnerId: c.partnerId, date, unitCostHT: wine.buyPriceHT, unitPriceHT: c.priceHT }],
      actor,
    ),
  ];
}

export function returnOps(orgId: string, c: Consignment, wine: Wine, qty: number, actor: Actor, date: string): Op[] {
  const n = Math.min(qty, c.qty);
  if (n <= 0) return [];
  return [
    { op: 'inc', path: `orgs/${orgId}/consignments/${c.id}`, field: 'qty', by: -n },
    ...buildMovementOps(orgId, [{ wine, siteId: c.siteId, type: 'in', qty: n, reason: 'retour', partnerId: c.partnerId, date, unitCostHT: wine.buyPriceHT }], actor),
  ];
}
