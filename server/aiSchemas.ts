import { Type, type Schema } from '@google/genai';

const S = { type: Type.STRING } as const;
const N = { type: Type.NUMBER } as const;

export interface SommelierItemIn {
  producer: string;
  name: string;
  vintage: string;
  formatCl: number;
  color: string;
  region: string;
  grapes: string;
  priceTTC: number | null;
  note: string;
}

export const sommelierSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    text: S,
    picks: {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, properties: { index: { type: Type.INTEGER }, reason: S }, required: ['index', 'reason'] },
    },
  },
  required: ['text', 'picks'],
};

export const TECH_FIELDS = [
  'aop',
  'lieuDit',
  'sol',
  'cepage',
  'ageVignes',
  'vinification',
  'elevage',
  'oeil',
  'nez',
  'bouche',
  'temperatureService',
  'garde',
  'accords',
] as const;
export type TechField = (typeof TECH_FIELDS)[number];

export const techSheetSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    ...Object.fromEntries(TECH_FIELDS.map((k) => [k, S])),
    sources: S,
    confidence: { type: Type.STRING, enum: ['high', 'medium', 'estimated', 'partial'] },
    missingInfo: S,
  },
  required: [...TECH_FIELDS, 'sources', 'confidence', 'missingInfo'],
};

export const invoiceSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    supplierName: S,
    number: S,
    date: S,
    dueDate: S,
    shippingHT: N,
    totalHT: N,
    totalVAT: N,
    totalTTC: N,
    lines: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: S,
          producer: S,
          cuvee: S,
          vintage: S,
          formatCl: N,
          color: S,
          region: S,
          qty: N,
          unitPriceHT: N,
          vatRate: N,
        },
        required: ['description', 'qty', 'unitPriceHT', 'vatRate'],
      },
    },
  },
  required: ['supplierName', 'number', 'date', 'lines', 'totalHT', 'totalTTC'],
};
