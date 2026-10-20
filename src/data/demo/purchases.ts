import type { PurchaseInvoice, PurchaseLine } from '@/types';
import type { Op } from '../store';
import { round2, uid } from '@/lib/utils';
import { wineLabel } from '@/lib/wine';
import { addDays } from '@/modules/negoce/calc';
import { computeTotals } from '@/modules/achats/logic';
import type { DemoWorld } from './world';

/** Calendrier des réassorts : [il y a n jours, fournisseur]. */
const SLOTS: [number, string][] = [
  [338, 'bertrand'],
  [318, 'champdist'],
  [296, 'gcb'],
  [240, 'bertrand'],
  [205, 'champdist'],
  [176, 'gcb'],
  [128, 'bertrand'],
  [96, 'champdist'],
  [63, 'gcb'],
  [27, 'bertrand'],
  [14, 'champdist'],
];

const SHIPPING: Record<string, number> = { bertrand: 45, gcb: 0, champdist: 30 };
const MAX_LINES = 8;
const VAT = 20;

/** Hausse tarifaire des bourgognes à partir de la campagne de printemps. */
const PRICE_RISE_AGO = 130;

const roundUp = (n: number, step: number) => Math.ceil(n / step) * step;

/**
 * Factures d'achat réceptionnées (et réglées quand l'échéance est passée) couvrant la demande à venir,
 * avec les entrées de stock correspondantes (forme `buildInvoiceOps` en mode réception).
 * À appeler après la génération des sorties.
 */
export function buildPurchases(w: DemoWorld): { ops: Op[]; invoices: PurchaseInvoice[] } {
  const invoices: PurchaseInvoice[] = [];
  let n = 0;
  for (const { partner, seed } of w.suppliers) {
    const slots = SLOTS.filter(([, k]) => k === seed.key).map(([ago]) => ago).sort((a, b) => b - a);
    slots.forEach((ago, i) => {
      const date = w.clock.iso(ago);
      const until = i + 1 < slots.length ? w.clock.iso(slots[i + 1]) : w.clock.today;
      const candidates = w.wines.filter((wine) => {
        const s = w.seedById.get(wine.id)!;
        return seed.regions.includes(s.region) && s.qty > 0 && s.buy <= 300;
      });
      const lines: PurchaseLine[] = candidates
        .map((wine) => {
          const s = w.seedById.get(wine.id)!;
          const demand = w.ledger.outflow(wine.id, w.mainSiteId, date, until);
          const step = s.buy > 150 ? 1 : (s.format ?? 75) >= 150 ? 3 : 6;
          const rise = seed.key === 'bertrand' && s.region === 'Bourgogne' && ago <= PRICE_RISE_AGO ? 1.05 : 1;
          return {
            wineId: wine.id,
            description: wineLabel(wine),
            producer: wine.producer,
            vintage: wine.vintage,
            formatCl: wine.formatCl,
            qty: demand > 0 ? roundUp(demand, step) : 0,
            unitPriceHT: round2((wine.buyPriceHT ?? 0) * rise),
            vatRate: VAT,
            received: true,
          };
        })
        .filter((l) => l.qty > 0)
        .sort((a, b) => b.qty * b.unitPriceHT - a.qty * a.unitPriceHT)
        .slice(0, MAX_LINES);
      if (!lines.length) return;
      n++;
      const shippingHT = SHIPPING[seed.key] ?? 0;
      const totals = computeTotals(lines, shippingHT, VAT);
      const dueDate = addDays(date, partner.paymentTermsDays ?? 30);
      const paid = dueDate < w.clock.iso(3);
      const payAgo = Math.min(ago, Math.max(4, Math.round((Date.parse(w.clock.today) - Date.parse(dueDate)) / 86_400_000) + w.rng.int(0, 4)));
      const number = `${seed.numberPrefix}${date.slice(2, 4)}${String(200 + n * 37).padStart(4, '0')}`;
      const inv: PurchaseInvoice = {
        id: uid(),
        supplierId: partner.id,
        supplierName: partner.name,
        number,
        date,
        dueDate,
        lines,
        ...(shippingHT ? { shippingHT } : {}),
        totalHT: totals.ht,
        totalVAT: totals.vat,
        totalTTC: totals.ttc,
        status: paid ? 'paid' : 'received',
        ...(paid ? { paymentDate: w.clock.iso(payAgo), paymentMethod: 'virement' } : {}),
        siteId: w.mainSiteId,
        createdAt: w.clock.ts(date, 3_600_000),
        createdBy: w.actor.userName,
      };
      invoices.push(inv);
      for (const l of lines)
        w.ledger.add({ wineId: l.wineId!, siteId: w.mainSiteId, type: 'in', qty: l.qty, reason: 'achat', date, unitCostHT: l.unitPriceHT, partnerId: partner.id, documentId: inv.id, note: number });
    });
  }
  return {
    invoices,
    ops: invoices.map((i): Op => ({ op: 'set', path: `orgs/${w.orgId}/purchaseInvoices/${i.id}`, data: JSON.parse(JSON.stringify(i)) })),
  };
}
