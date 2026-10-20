export type PaymentMethodExp = 'a_payer' | 'virement' | 'cheque' | 'carte' | 'especes' | 'prelevement';

export interface ExpenseCategory {
  id: string;
  name: string;
  account: string;
}

export interface Expense {
  id: string;
  date: string;
  provider: string;
  category: string; // id de catégorie
  description: string;
  amountHT: number;
  amountTVA: number;
  amountTTC: number;
  paymentMethod: PaymentMethodExp;
  assetId?: string;
  createdAt: number;
}

export type AssetCategory = 'materiel' | 'mobilier' | 'informatique' | 'vehicule' | 'agencement' | 'incorporel';

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  purchaseDate: string;
  amountHT: number;
  vatAmount: number;
  durationYears: number;
  startDepreciationDate: string;
  createdAt: number;
}

export type DrmCategory = 'tranquilles' | 'mousseux' | 'spiritueux' | 'autres';

export interface Qty {
  bottles: number;
  hl: number;
}

export interface DrmRow {
  category: DrmCategory;
  opening: Qty;
  entries: { achats: Qty; retours: Qty; autres: Qty; total: Qty };
  exits: { ventes: Qty; consommation: Qty; casse: Qty; degustation: Qty; offerts: Qty; autres: Qty; total: Qty };
  closing: Qty;
}

export interface DrmReport {
  id: string; // = mois yyyy-mm
  month: string;
  rows: DrmRow[];
  savedAt: number;
  savedBy: string;
}

export interface Period {
  from: string;
  to: string;
}

export interface VatRateRow {
  rate: number;
  baseHT: number;
  vat: number;
}

export interface VatReturn {
  collected: VatRateRow[];
  totalCollected: number;
  deductible: { purchases: number; expenses: number; assets: number; total: number };
  balance: number; // > 0 : à payer ; < 0 : crédit de TVA
}

export interface JournalLine {
  journal: string;
  journalLib: string;
  num: number;
  date: string; // yyyy-mm-dd
  account: string;
  accountLib: string;
  auxAccount: string;
  auxLib: string;
  pieceRef: string;
  pieceDate: string;
  label: string;
  debit: number;
  credit: number;
}

export type AccountMap = Record<string, string>;

export interface BalanceCheck {
  balanced: boolean;
  totalDebit: number;
  totalCredit: number;
  unbalancedPieces: { journal: string; pieceRef: string; gap: number }[];
}

export interface ResultSummary {
  revenueHT: number;
  purchasesHT: number;
  expensesHT: number;
  depreciation: number;
  result: number;
  cashIn: number;
  cashOut: number;
  cash: number;
  receivables: number;
  payables: number;
}
