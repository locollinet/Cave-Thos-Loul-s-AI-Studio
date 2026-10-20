import type { Movement, PurchaseInvoice, StockLevel, Wine } from '@/types';
import { stockByWine } from '@/data/stock';
import { round2 } from '@/lib/utils';
import { wineLabel } from '@/lib/wine';
import { daysBetween } from '../negoce/calc';
import type { ReplenishItem } from './types';

export interface ReplenishInput {
  wines: Wine[];
  stock: StockLevel[];
  movements: Movement[];
  purchases: PurchaseInvoice[];
  siteId: string;
  asOf: string;
  velocityDays?: number; // fenêtre de calcul de la vélocité
  targetDays?: number; // couverture visée
  caseSize?: number;
}

export interface LatestSupplier {
  supplier: string;
  unitPriceHT: number;
}

/** Fournisseur de la dernière facture d'achat contenant le vin. */
export function latestSuppliers(purchases: PurchaseInvoice[]): Map<string, LatestSupplier> {
  const out = new Map<string, LatestSupplier & { date: string }>();
  for (const p of purchases) {
    if (p.status === 'draft') continue;
    for (const l of p.lines) {
      if (!l.wineId) continue;
      const cur = out.get(l.wineId);
      if (!cur || p.date > cur.date) out.set(l.wineId, { supplier: p.supplierName, unitPriceHT: l.unitPriceHT, date: p.date });
    }
  }
  return out;
}

export function suggestReplenishment(i: ReplenishInput): ReplenishItem[] {
  const window = i.velocityDays ?? 90;
  const target = i.targetDays ?? 60;
  const caseSize = i.caseSize ?? 6;
  const q = stockByWine(i.stock, i.siteId);
  const out = new Map<string, number>();
  for (const m of i.movements) {
    if (m.type !== 'out' || (i.siteId !== 'all' && m.siteId !== i.siteId)) continue;
    if (m.date > i.asOf || daysBetween(m.date, i.asOf) >= window) continue;
    out.set(m.wineId, (out.get(m.wineId) ?? 0) + m.qty);
  }
  const suppliers = latestSuppliers(i.purchases);
  const items: ReplenishItem[] = [];
  for (const w of i.wines) {
    if (w.isArchived || w.isPreSale) continue;
    const stock = q.get(w.id) ?? 0;
    const velocity = (out.get(w.id) ?? 0) / window;
    const belowThreshold = w.alertThreshold > 0 && stock <= w.alertThreshold;
    if (!belowThreshold && !(stock <= 0 && velocity > 0)) continue;
    const need = Math.max(Math.ceil(velocity * target) - stock, w.alertThreshold - stock, 0);
    if (need <= 0) continue;
    const sup = suppliers.get(w.id);
    items.push({
      wineId: w.id,
      label: wineLabel(w),
      stock,
      threshold: w.alertThreshold,
      velocityPerDay: Math.round(velocity * 1000) / 1000,
      coverageDays: velocity > 0 ? Math.round(stock / velocity) : null,
      suggestedQty: caseSize > 1 ? Math.ceil(need / caseSize) * caseSize : need,
      supplier: sup?.supplier ?? '',
      unitPriceHT: sup?.unitPriceHT ?? w.buyPriceHT ?? 0,
    });
  }
  return items.sort((a, b) => (a.coverageDays ?? Infinity) - (b.coverageDays ?? Infinity) || a.label.localeCompare(b.label));
}

/** Bon de commande : lignes regroupées par fournisseur, avec sous-total. */
export function purchaseOrderRows(items: ReplenishItem[], labels: { supplier: string; wine: string; qty: string; price: string; total: string; none: string; subtotal: string }): (string | number)[][] {
  const groups = new Map<string, ReplenishItem[]>();
  for (const it of items) {
    const k = it.supplier || labels.none;
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  const rows: (string | number)[][] = [[labels.supplier, labels.wine, labels.qty, labels.price, labels.total]];
  for (const [supplier, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const it of list) rows.push([supplier, it.label, it.suggestedQty, it.unitPriceHT, round2(it.suggestedQty * it.unitPriceHT)]);
    rows.push([supplier, labels.subtotal, list.reduce((s, it) => s + it.suggestedQty, 0), '', round2(list.reduce((s, it) => s + it.suggestedQty * it.unitPriceHT, 0))]);
  }
  return rows;
}
