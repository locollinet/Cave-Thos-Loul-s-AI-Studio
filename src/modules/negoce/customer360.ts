import type { PurchaseInvoice, Wine } from '@/types';
import { round2 } from '@/lib/utils';
import { norm, wineLabel } from '@/lib/wine';
import { addDays, balanceDue, computeTotals, daysBetween } from './calc';
import type { Consignment, Payment, SaleDocument } from './types';

export interface TopWine {
  wineId: string;
  label: string;
  qty: number;
  revenueHT: number;
}

export interface Customer360 {
  revenue12mHT: number;
  invoiceCount: number;
  avgBasketHT: number;
  outstanding: number;
  overdue: number;
  lastDocs: SaleDocument[];
  topWines: TopWine[];
  consignedBottles: number;
}

const billed = (d: SaleDocument) => d.status === 'validated' || d.status === 'paid';

/** Vue client à 360° : chiffre d'affaires glissant 12 mois (avoirs déduits), encours et vins favoris. */
export function customer360(
  partnerId: string,
  docs: SaleDocument[],
  payments: Payment[],
  asOf: string,
  o: { wines?: Pick<Wine, 'id' | 'producer' | 'name' | 'vintage' | 'formatCl'>[]; consignments?: Consignment[]; limit?: number } = {},
): Customer360 {
  const mine = docs.filter((d) => d.partnerId === partnerId);
  const from = addDays(asOf, -365);
  const inYear = mine.filter((d) => billed(d) && d.type !== 'quote' && d.date > from && d.date <= asOf);
  const invoices = inYear.filter((d) => d.type === 'invoice');
  const credits = inYear.filter((d) => d.type === 'credit_note');
  const invoicedHT = invoices.reduce((s, d) => s + d.totalHT, 0);
  const revenue = invoicedHT - credits.reduce((s, d) => s + d.totalHT, 0);

  let outstanding = 0;
  let overdue = 0;
  for (const d of mine) {
    if (d.type !== 'invoice' || d.status !== 'validated') continue;
    const bal = balanceDue(d, payments, docs);
    outstanding += bal;
    if (bal > 0 && daysBetween(d.dueDate, asOf) > 0) overdue += bal;
  }

  const labels = new Map((o.wines ?? []).map((w) => [w.id, wineLabel(w)]));
  const top = new Map<string, TopWine>();
  for (const d of mine) {
    if (d.type !== 'invoice' || !billed(d)) continue;
    const nets = computeTotals(d.lines, d.shippingHT, d.shippingVatRate, d.discountPct).lineNets;
    d.lines.forEach((l, i) => {
      if (!l.wineId || l.isService) return;
      const cur = top.get(l.wineId) ?? { wineId: l.wineId, label: labels.get(l.wineId) ?? l.description, qty: 0, revenueHT: 0 };
      cur.qty += l.qty;
      cur.revenueHT = round2(cur.revenueHT + (nets[i] ?? 0));
      top.set(l.wineId, cur);
    });
  }

  const limit = o.limit ?? 5;
  return {
    revenue12mHT: round2(revenue),
    invoiceCount: invoices.length,
    avgBasketHT: invoices.length ? round2(invoicedHT / invoices.length) : 0,
    outstanding: round2(outstanding),
    overdue: round2(overdue),
    lastDocs: [...mine].sort((a, b) => (b.date === a.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date))).slice(0, limit),
    topWines: [...top.values()].sort((a, b) => b.qty - a.qty || b.revenueHT - a.revenueHT).slice(0, limit),
    consignedBottles: (o.consignments ?? []).filter((c) => c.partnerId === partnerId && c.qty > 0).reduce((s, c) => s + c.qty, 0),
  };
}

export interface SuppliedWine {
  wineId?: string;
  label: string;
  qty: number;
  lastPriceHT: number;
  lastDate: string;
}

export interface Supplier360 {
  purchases12mHT: number;
  invoiceCount: number;
  unpaidTTC: number;
  lastPurchases: PurchaseInvoice[];
  wines: SuppliedWine[];
}

/** Factures d'achat d'un fournisseur (rapprochées par identifiant, sinon par nom) et vins fournis. */
export function supplier360(
  supplier: { id: string; name: string },
  purchases: PurchaseInvoice[],
  asOf: string,
  o: { wines?: Pick<Wine, 'id' | 'producer' | 'name' | 'vintage' | 'formatCl'>[]; limit?: number } = {},
): Supplier360 {
  const key = norm(supplier.name);
  const mine = purchases
    .filter((p) => (p.supplierId ? p.supplierId === supplier.id : norm(p.supplierName) === key))
    .sort((a, b) => b.date.localeCompare(a.date));
  const from = addDays(asOf, -365);
  const year = mine.filter((p) => p.date > from && p.date <= asOf);
  const labels = new Map((o.wines ?? []).map((w) => [w.id, wineLabel(w)]));
  const wines = new Map<string, SuppliedWine>();
  for (const p of [...mine].reverse()) {
    for (const l of p.lines) {
      const k = l.wineId ?? norm(l.description);
      const cur = wines.get(k) ?? { wineId: l.wineId, label: (l.wineId && labels.get(l.wineId)) || l.description, qty: 0, lastPriceHT: 0, lastDate: '' };
      cur.qty += l.qty;
      cur.lastPriceHT = l.unitPriceHT;
      cur.lastDate = p.date;
      wines.set(k, cur);
    }
  }
  const limit = o.limit ?? 5;
  return {
    purchases12mHT: round2(year.reduce((s, p) => s + p.totalHT, 0)),
    invoiceCount: year.length,
    unpaidTTC: round2(mine.filter((p) => p.status === 'received').reduce((s, p) => s + p.totalTTC, 0)),
    lastPurchases: mine.slice(0, limit),
    wines: [...wines.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate) || b.qty - a.qty).slice(0, 10),
  };
}
