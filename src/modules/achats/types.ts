import type { WineColor } from '@/types';

export interface ParsedLine {
  description: string;
  producer: string;
  cuvee: string;
  vintage: string;
  formatCl: number;
  color: string;
  region: string;
  qty: number;
  unitPriceHT: number;
  vatRate: number;
}

export interface ParsedInvoice {
  supplierName: string;
  number: string;
  date: string;
  dueDate: string;
  shippingHT: number;
  lines: ParsedLine[];
  totalHT: number;
  totalVAT: number;
  totalTTC: number;
}

export type LineChoice = 'match' | 'create' | 'skip';

export interface ReviewLine {
  key: string;
  description: string;
  producer: string;
  name: string;
  vintage: string;
  formatCl: number;
  color: WineColor;
  region: string;
  qty: number;
  unitPriceHT: number;
  vatRate: number;
  wineId?: string;
  choice: LineChoice;
  score?: number;
}

export interface InvoiceDraft {
  id: string;
  supplierName: string;
  number: string;
  date: string;
  dueDate: string;
  shippingHT: number;
  siteId: string;
  fileName?: string;
  declaredHT: number;
  declaredVAT: number;
  declaredTTC: number;
  lines: ReviewLine[];
}

export interface Totals {
  ht: number;
  vat: number;
  ttc: number;
}

export interface TotalsCheck {
  declared: boolean;
  htDiff: number;
  vatDiff: number;
  ttcDiff: number;
  ok: boolean;
}

export interface PricePoint {
  date: string;
  price: number;
}
