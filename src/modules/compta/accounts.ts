import type { AssetCategory, AccountMap, Expense, ExpenseCategory } from './types';

export const ACCOUNTS_DOC_ID = '_accounts';

export const DEFAULT_ACCOUNTS: AccountMap = {
  customers: '411000',
  suppliers: '401000',
  assetSuppliers: '404000',
  salesGoods: '707000',
  salesServices: '706000',
  salesShipping: '708500',
  vatCollected20: '445712',
  vatCollected10: '445713',
  vatCollected55: '445711',
  vatCollected21: '445714',
  vatCollectedOther: '445710',
  vatDeductible: '445660',
  vatDeductibleAssets: '445620',
  purchases: '607000',
  bank: '512000',
  cash: '530000',
  depreciationExpense: '681100',
  'asset.materiel': '215400',
  'asset.mobilier': '218400',
  'asset.informatique': '218300',
  'asset.vehicule': '218200',
  'asset.agencement': '213500',
  'asset.incorporel': '205000',
  'amort.materiel': '281540',
  'amort.mobilier': '281840',
  'amort.informatique': '281830',
  'amort.vehicule': '281820',
  'amort.agencement': '281350',
  'amort.incorporel': '280500',
};

export const ASSET_CATEGORIES: AssetCategory[] = ['materiel', 'mobilier', 'informatique', 'vehicule', 'agencement', 'incorporel'];

export const mergeAccounts = (custom?: Partial<AccountMap>): AccountMap => {
  const merged: AccountMap = { ...DEFAULT_ACCOUNTS };
  for (const [k, v] of Object.entries(custom ?? {})) if (v) merged[k] = v;
  return merged;
};

export const vatCollectedAccount = (accounts: AccountMap, rate: number): string => {
  if (rate === 20) return accounts.vatCollected20;
  if (rate === 10) return accounts.vatCollected10;
  if (rate === 5.5) return accounts.vatCollected55;
  if (rate === 2.1) return accounts.vatCollected21;
  return accounts.vatCollectedOther;
};

export const DEFAULT_CATEGORIES: { key: string; account: string }[] = [
  { key: 'rent', account: '613200' },
  { key: 'energy', account: '606100' },
  { key: 'insurance', account: '616000' },
  { key: 'fees', account: '622600' },
  { key: 'transport', account: '624100' },
  { key: 'advertising', account: '623000' },
  { key: 'travel', account: '625700' },
  { key: 'supplies', account: '606400' },
  { key: 'telecom', account: '626000' },
  { key: 'bank', account: '627000' },
  { key: 'maintenance', account: '615000' },
  { key: 'misc', account: '618000' },
];

export const categoryAccount = (cats: ExpenseCategory[], e: Pick<Expense, 'category'>): string => cats.find((c) => c.id === e.category)?.account ?? '618000';
