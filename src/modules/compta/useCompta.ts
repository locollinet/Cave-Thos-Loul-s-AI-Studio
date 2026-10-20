import { useMemo } from 'react';
import type { Movement, PurchaseInvoice } from '@/types';
import { useCollection } from '@/app/org';
import type { Payment, SaleDocument } from '../negoce/types';
import { ACCOUNTS_DOC_ID, mergeAccounts } from './accounts';
import type { AccountMap, Asset, DrmReport, Expense, ExpenseCategory } from './types';

interface AccountsDoc {
  id: string;
  map?: Partial<AccountMap>;
}

export function useCompta() {
  const docs = useCollection<SaleDocument>('documents');
  const payments = useCollection<Payment>('payments');
  const purchases = useCollection<PurchaseInvoice>('purchaseInvoices');
  const expenses = useCollection<Expense>('expenses');
  const cats = useCollection<ExpenseCategory & AccountsDoc>('expenseCategories');
  const assets = useCollection<Asset>('assets');
  const drm = useCollection<DrmReport>('drmReports');
  const movements = useCollection<Movement>('movements');

  const categories = useMemo(() => cats.rows.filter((c) => c.id !== ACCOUNTS_DOC_ID).sort((a, b) => a.name.localeCompare(b.name)), [cats.rows]);
  const accounts = useMemo(() => mergeAccounts(cats.rows.find((c) => c.id === ACCOUNTS_DOC_ID)?.map), [cats.rows]);
  const loading = docs.loading || payments.loading || purchases.loading || expenses.loading || cats.loading || assets.loading || drm.loading || movements.loading;

  return {
    docs: docs.rows,
    payments: payments.rows,
    purchases: purchases.rows,
    expenses: expenses.rows,
    categories,
    accounts,
    assets: assets.rows,
    drmReports: drm.rows,
    movements: movements.rows,
    loading,
  };
}

export const currentYear = (): number => new Date().getFullYear();

export const yearOptions = (): number[] => {
  const y = currentYear();
  return [y + 1, y, y - 1, y - 2, y - 3];
};
