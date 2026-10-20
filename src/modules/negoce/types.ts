export type DocType = 'quote' | 'invoice' | 'credit_note';
export type DocStatus = 'draft' | 'sent' | 'accepted' | 'validated' | 'paid' | 'cancelled';

export interface DocLine {
  id: string;
  wineId?: string;
  description: string;
  qty: number;
  unitPriceHT: number;
  discountPct: number;
  vatRate: number;
  isGift?: boolean;
  isService?: boolean;
  fromConsignment?: string; // id du dépôt-vente soldé par cette ligne
}

export interface SaleDocument {
  id: string;
  type: DocType;
  number: string; // vide tant que le brouillon n'est pas validé
  status: DocStatus;
  date: string;
  dueDate: string;
  validUntil?: string;
  partnerId: string;
  partnerName: string;
  partnerAddress?: string;
  partnerVatNumber?: string;
  partnerType?: 'pro' | 'particulier';
  siteId: string;
  lines: DocLine[];
  shippingHT: number;
  shippingVatRate: number;
  discountPct: number;
  totalHT: number;
  totalVAT: number;
  totalTTC: number;
  notes: string;
  paymentTermsDays: number;
  relatedDocumentId?: string;
  offerId?: string; // offre commerciale d'origine
  lastReminderAt?: number; // dernière relance envoyée (ms)
  reminderCount?: number;
  createdAt: number;
  createdBy: string;
}

export type PaymentMethod = 'virement' | 'cheque' | 'carte' | 'especes' | 'prelevement' | 'autre';

export interface Payment {
  id: string;
  documentId: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
}

export interface Consignment {
  id: string;
  partnerId: string;
  wineId: string;
  qty: number; // quantité restant chez le client
  priceHT: number;
  siteId: string;
  createdAt: number;
}

export interface CounterDoc {
  id: string;
  value: number;
}

export interface LineAmounts {
  netHT: number;
  vatRate: number;
}

export interface VatBreakdownRow {
  rate: number;
  baseHT: number;
  vat: number;
}

export interface DocTotals {
  lineNets: number[];
  shippingHT: number;
  breakdown: VatBreakdownRow[];
  totalHT: number;
  totalVAT: number;
  totalTTC: number;
}

export interface AgingRow {
  doc: SaleDocument;
  balance: number;
  daysLate: number;
}

export interface AgingSummary {
  current: number;
  d0_30: number;
  d30_60: number;
  d60plus: number;
  total: number;
}
