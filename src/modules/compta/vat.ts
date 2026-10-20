import type { PurchaseInvoice } from '@/types';
import { round2 } from '@/lib/utils';
import { computeTotals } from '../negoce/calc';
import type { SaleDocument } from '../negoce/types';
import type { Asset, Expense, Period, VatRateRow, VatReturn } from './types';

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export function periodFor(kind: 'month' | 'quarter' | 'year', year: number, index: number): Period {
  if (kind === 'year') return { from: `${year}-01-01`, to: `${year}-12-31` };
  if (kind === 'month') return { from: `${year}-${pad(index)}-01`, to: `${year}-${pad(index)}-${pad(lastDay(year, index))}` };
  const m1 = (index - 1) * 3 + 1;
  const m3 = m1 + 2;
  return { from: `${year}-${pad(m1)}-01`, to: `${year}-${pad(m3)}-${pad(lastDay(year, m3))}` };
}

export const inPeriod = (date: string | undefined, p: Period): boolean => !!date && date >= p.from && date <= p.to;

const isBilled = (d: SaleDocument) => (d.type === 'invoice' || d.type === 'credit_note') && (d.status === 'validated' || d.status === 'paid');
const isReceived = (p: PurchaseInvoice) => p.status === 'received' || p.status === 'paid';

/** Les immobilisations rattachées à une charge sont comptées via la charge (pas de double déduction). */
export const assetsWithoutExpense = (assets: Asset[], expenses: Expense[]): Asset[] => {
  const linked = new Set(expenses.map((e) => e.assetId).filter(Boolean));
  return assets.filter((a) => !linked.has(a.id));
};

export interface VatInput {
  docs: SaleDocument[];
  purchases: PurchaseInvoice[];
  expenses: Expense[];
  assets: Asset[];
  period: Period;
}

export function vatReturn({ docs, purchases, expenses, assets, period }: VatInput): VatReturn {
  const byRate = new Map<number, VatRateRow>();
  for (const d of docs.filter((x) => isBilled(x) && inPeriod(x.date, period))) {
    const sign = d.type === 'credit_note' ? -1 : 1;
    for (const r of computeTotals(d.lines, d.shippingHT, d.shippingVatRate, d.discountPct).breakdown) {
      const cur = byRate.get(r.rate) ?? { rate: r.rate, baseHT: 0, vat: 0 };
      cur.baseHT = round2(cur.baseHT + sign * r.baseHT);
      cur.vat = round2(cur.vat + sign * r.vat);
      byRate.set(r.rate, cur);
    }
  }
  const collected = [...byRate.values()].sort((a, b) => a.rate - b.rate);
  const totalCollected = round2(collected.reduce((s, r) => s + r.vat, 0));
  const purchasesVat = round2(purchases.filter((p) => isReceived(p) && inPeriod(p.date, period)).reduce((s, p) => s + p.totalVAT, 0));
  const expensesVat = round2(expenses.filter((e) => inPeriod(e.date, period)).reduce((s, e) => s + e.amountTVA, 0));
  const assetsVat = round2(assetsWithoutExpense(assets, expenses).filter((a) => inPeriod(a.purchaseDate, period)).reduce((s, a) => s + a.vatAmount, 0));
  const total = round2(purchasesVat + expensesVat + assetsVat);
  return {
    collected,
    totalCollected,
    deductible: { purchases: purchasesVat, expenses: expensesVat, assets: assetsVat, total },
    balance: round2(totalCollected - total),
  };
}

export function vatCsvRows(v: VatReturn, period: Period, labels: Record<'rate' | 'base' | 'vat' | 'collected' | 'purchases' | 'expenses' | 'assets' | 'deductible' | 'balance' | 'period', string>): (string | number)[][] {
  return [
    [labels.period, `${period.from} → ${period.to}`],
    [],
    [labels.collected, labels.rate, labels.base, labels.vat],
    ...v.collected.map((r) => ['', r.rate, r.baseHT, r.vat]),
    ['', '', '', v.totalCollected],
    [],
    [labels.purchases, '', '', v.deductible.purchases],
    [labels.expenses, '', '', v.deductible.expenses],
    [labels.assets, '', '', v.deductible.assets],
    [labels.deductible, '', '', v.deductible.total],
    [],
    [labels.balance, '', '', v.balance],
  ];
}
