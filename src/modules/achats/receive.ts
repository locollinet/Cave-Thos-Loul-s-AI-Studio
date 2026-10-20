import type { Org, Partner, Producer, PurchaseInvoice, PurchaseLine, Wine } from '@/types';
import type { Op } from '@/data/store';
import { buildMovementOps, type Actor } from '@/data/stock';
import { canonicalKey, norm } from '@/lib/wine';
import { round2, uid } from '@/lib/utils';
import { computeTotals } from './logic';
import type { InvoiceDraft, ReviewLine } from './types';

export interface ReceptionContext {
  orgId: string;
  org: Pick<Org, 'defaultCoefficient' | 'defaultVatRate'>;
  actor: Actor;
  wines: Wine[];
  producers: Producer[];
  partners: Partner[];
  now?: number;
}

export interface ReceptionResult {
  ops: Op[];
  invoice: PurchaseInvoice;
}

const clean = <T extends object>(o: T): Record<string, unknown> => JSON.parse(JSON.stringify(o)) as Record<string, unknown>;

/** Lignes réellement réceptionnées : celles qui ont un vin (existant ou à créer) et une quantité. */
export const isReceivable = (l: ReviewLine): boolean => l.choice !== 'skip' && l.qty > 0 && (l.choice === 'create' ? !!l.name.trim() && !!l.producer.trim() : !!l.wineId);

export function draftTotals(d: InvoiceDraft, vatRate: number) {
  return computeTotals(d.lines, d.shippingHT, vatRate);
}

/**
 * Écritures d'une facture d'achat. En brouillon : seule la facture est enregistrée.
 * En réception : fournisseur, producteurs et vins créés si besoin, mouvements d'entrée de stock,
 * dernier prix d'achat des vins et facture, le tout dans un seul commit.
 */
export function buildInvoiceOps(draft: InvoiceDraft, mode: 'draft' | 'receive', ctx: ReceptionContext, createdAt?: number): ReceptionResult {
  const now = ctx.now ?? Date.now();
  const base = `orgs/${ctx.orgId}`;
  const ops: Op[] = [];
  const receive = mode === 'receive';
  const totals = draftTotals(draft, ctx.org.defaultVatRate);

  let supplierId = ctx.partners.find((p) => p.kind === 'supplier' && norm(p.name) === norm(draft.supplierName))?.id;
  if (receive && !supplierId && draft.supplierName.trim()) {
    supplierId = uid();
    const partner: Partner = { id: supplierId, kind: 'supplier', name: draft.supplierName.trim(), createdAt: now };
    ops.push({ op: 'set', path: `${base}/partners/${supplierId}`, data: clean(partner) });
  }

  const producerIds = new Map<string, string>();
  const findProducer = (name: string, region: string): string => {
    const k = norm(name);
    const known = producerIds.get(k) ?? ctx.producers.find((p) => !p.isArchived && norm(p.name) === k)?.id;
    if (known) {
      producerIds.set(k, known);
      return known;
    }
    const id = uid();
    producerIds.set(k, id);
    const prod: Producer = { id, name: name.trim(), region: region || undefined, createdAt: now };
    ops.push({ op: 'set', path: `${base}/producers/${id}`, data: clean(prod) });
    return id;
  };

  const resolved = new Map<string, Wine>(); // clé canonique -> vin (créé pendant cette réception)
  const stockIns: { wine: Wine; line: ReviewLine }[] = [];
  const lines: PurchaseLine[] = [];

  for (const l of draft.lines) {
    if (l.qty <= 0 && !l.description && !l.name) continue;
    let wine: Wine | undefined = l.choice === 'match' ? ctx.wines.find((w) => w.id === l.wineId) : undefined;

    if (receive && !wine && l.choice === 'create' && isReceivable(l)) {
      const key = canonicalKey({ producer: l.producer, name: l.name, vintage: l.vintage, color: l.color, formatCl: l.formatCl });
      wine = resolved.get(key) ?? ctx.wines.find((w) => !w.isArchived && w.canonicalKey === key);
      if (!wine) {
        const producerId = findProducer(l.producer, l.region);
        const prod = ctx.producers.find((p) => p.id === producerId);
        const coef = prod?.coefficient ?? ctx.org.defaultCoefficient;
        wine = {
          id: uid(),
          producerId,
          producer: l.producer.trim(),
          name: l.name.trim(),
          vintage: l.vintage.trim() || 'NM',
          color: l.color,
          formatCl: l.formatCl,
          region: l.region || undefined,
          buyPriceHT: l.unitPriceHT,
          sellPriceHT: l.unitPriceHT > 0 ? round2(l.unitPriceHT * coef) : undefined,
          alertThreshold: 3,
          canonicalKey: key,
          createdAt: now,
          updatedAt: now,
        };
        resolved.set(key, wine);
        ops.push({ op: 'set', path: `${base}/wines/${wine.id}`, data: clean(wine) });
      }
    }

    const counted = receive && !!wine && l.choice !== 'skip' && l.qty > 0;
    lines.push({
      wineId: wine?.id,
      description: l.description || [l.producer, l.name].filter(Boolean).join(' '),
      producer: l.producer || undefined,
      vintage: l.vintage || undefined,
      formatCl: l.formatCl,
      qty: l.qty,
      unitPriceHT: l.unitPriceHT,
      vatRate: l.vatRate,
      received: counted,
    });
    if (counted && wine) stockIns.push({ wine, line: l });
  }

  if (receive) {
    ops.push(
      ...buildMovementOps(
        ctx.orgId,
        stockIns.map(({ wine, line }) => ({
          wine,
          siteId: draft.siteId,
          type: 'in' as const,
          qty: line.qty,
          reason: 'achat' as const,
          date: draft.date,
          unitCostHT: line.unitPriceHT,
          partnerId: supplierId,
          documentId: draft.id,
          note: draft.number || undefined,
        })),
        ctx.actor,
        now,
      ),
    );
    const priced = new Map<string, number>();
    for (const { wine, line } of stockIns) if (line.unitPriceHT > 0) priced.set(wine.id, line.unitPriceHT);
    const created = new Set([...resolved.values()].map((w) => w.id));
    for (const [id, price] of priced) {
      if (created.has(id)) continue;
      ops.push({ op: 'set', path: `${base}/wines/${id}`, data: { buyPriceHT: price, updatedAt: now }, merge: true });
    }
  }

  const invoice: PurchaseInvoice = {
    id: draft.id,
    supplierId,
    supplierName: draft.supplierName.trim(),
    number: draft.number.trim(),
    date: draft.date,
    dueDate: draft.dueDate || undefined,
    lines,
    shippingHT: draft.shippingHT || undefined,
    totalHT: draft.declaredHT > 0 ? draft.declaredHT : totals.ht,
    totalVAT: draft.declaredHT > 0 && draft.declaredVAT > 0 ? draft.declaredVAT : totals.vat,
    totalTTC: draft.declaredTTC > 0 ? draft.declaredTTC : totals.ttc,
    status: receive ? 'received' : 'draft',
    siteId: draft.siteId || undefined,
    fileName: draft.fileName,
    createdAt: createdAt ?? now,
    createdBy: ctx.actor.userName,
  };
  ops.push({ op: 'set', path: `${base}/purchaseInvoices/${invoice.id}`, data: clean(invoice) });
  return { ops, invoice };
}
