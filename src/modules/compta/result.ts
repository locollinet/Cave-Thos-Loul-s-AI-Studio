import type { Movement, PurchaseInvoice } from '@/types';
import { round2 } from '@/lib/utils';
import { computeTotals } from '../negoce/calc';
import type { Payment, SaleDocument } from '../negoce/types';
import { totalDepreciationForYear } from './assets';
import { assetsWithoutExpense } from './vat';
import type { Asset, Expense, ResultSummary } from './types';

export interface ResultInput {
  year: number;
  docs: SaleDocument[];
  payments: Payment[];
  purchases: PurchaseInvoice[];
  expenses: Expense[];
  assets: Asset[];
  /**
   * Sorties « vente » sans facture (ventes en salle encaissées en caisse) : comptées en produits et encaissements
   * uniquement pour les établissements sans module négoce, pour ne pas doubler les ventes facturées.
   */
  counterSales?: Movement[];
  /** Taux de TVA des ventes en salle (pour l'encaissement TTC). */
  counterVatRate?: number;
}

/** Chiffre d'affaires HT des ventes en salle (sorties « vente » non liées à une facture) de l'année. */
export function counterSalesHT(movements: Movement[], year: number): number {
  const y = String(year);
  return round2(movements.filter((m) => m.type === 'out' && m.reason === 'vente' && !m.documentId && m.date.startsWith(y)).reduce((s, m) => s + m.qty * (m.unitPriceHT ?? 0), 0));
}

/** Résultat simplifié (produits − charges − dotations) et trésorerie estimée de l'exercice. */
export function computeResult({ year, docs, payments, purchases, expenses, assets, counterSales, counterVatRate = 20 }: ResultInput): ResultSummary {
  const y = String(year);
  const billed = docs.filter((d) => (d.type === 'invoice' || d.type === 'credit_note') && (d.status === 'validated' || d.status === 'paid') && d.date.startsWith(y));
  const counter = counterSales ? counterSalesHT(counterSales, year) : 0;
  const revenueHT = round2(billed.reduce((s, d) => s + (d.type === 'credit_note' ? -1 : 1) * computeTotals(d.lines, d.shippingHT, d.shippingVatRate, d.discountPct).totalHT, 0) + counter);
  const purchasesHT = round2(purchases.filter((p) => p.status !== 'draft' && p.date.startsWith(y)).reduce((s, p) => s + p.totalHT, 0));
  const expensesHT = round2(expenses.filter((e) => e.date.startsWith(y) && !e.assetId).reduce((s, e) => s + e.amountHT, 0));
  const depreciation = totalDepreciationForYear(assets, year);

  const invoiceIds = new Set(docs.filter((d) => d.type === 'invoice').map((d) => d.id));
  const cashIn = round2(payments.filter((p) => p.date.startsWith(y) && invoiceIds.has(p.documentId)).reduce((s, p) => s + p.amount, 0) + counter * (1 + counterVatRate / 100));
  const paidPurchases = purchases.filter((p) => p.status === 'paid' && (p.paymentDate ?? p.date).startsWith(y)).reduce((s, p) => s + p.totalTTC, 0);
  const paidExpenses = expenses.filter((e) => e.date.startsWith(y) && e.paymentMethod !== 'a_payer').reduce((s, e) => s + e.amountHT + e.amountTVA, 0);
  const paidAssets = assetsWithoutExpense(assets, expenses).filter((a) => a.purchaseDate.startsWith(y)).reduce((s, a) => s + a.amountHT + a.vatAmount, 0);
  const cashOut = round2(paidPurchases + paidExpenses + paidAssets);

  const paidByDoc = new Map<string, number>();
  for (const p of payments) paidByDoc.set(p.documentId, (paidByDoc.get(p.documentId) ?? 0) + p.amount);
  const receivables = round2(docs.filter((d) => d.type === 'invoice' && d.status === 'validated').reduce((s, d) => s + Math.max(0, d.totalTTC - (paidByDoc.get(d.id) ?? 0)), 0));
  const payables = round2(purchases.filter((p) => p.status === 'received').reduce((s, p) => s + p.totalTTC, 0));

  return {
    revenueHT,
    purchasesHT,
    expensesHT,
    depreciation,
    result: round2(revenueHT - purchasesHT - expensesHT - depreciation),
    cashIn,
    cashOut,
    cash: round2(cashIn - cashOut),
    receivables,
    payables,
  };
}
