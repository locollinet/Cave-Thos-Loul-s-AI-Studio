import type { SommelierItemIn } from './aiSchemas';

export class InputError extends Error {}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');

export const nbr = (v: unknown, min = -1e9, max = 1e9): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0;
};

export const lang = (v: unknown): 'fr' | 'en' => (v === 'en' ? 'en' : 'fr');

export interface SommelierInput {
  items: SommelierItemIn[];
  question: string;
  language: 'fr' | 'en';
  context: 'guest' | 'pro';
}

export function parseSommelier(body: unknown): SommelierInput {
  const b = rec(body);
  const question = str(b.question, 600);
  if (!question) throw new InputError('question requise');
  if (!Array.isArray(b.items) || b.items.length === 0) throw new InputError('carte vide');
  const items = b.items.slice(0, 150).map((raw): SommelierItemIn => {
    const i = rec(raw);
    return {
      producer: str(i.producer, 80),
      name: str(i.name, 120),
      vintage: str(i.vintage, 10),
      formatCl: nbr(i.formatCl, 0, 1000),
      color: str(i.color, 20),
      region: str(i.region, 60),
      grapes: str(i.grapes, 80),
      priceTTC: i.priceTTC === null || i.priceTTC === undefined ? null : nbr(i.priceTTC, 0, 100000),
      note: str(i.note, 200),
    };
  });
  return { items, question, language: lang(b.language), context: b.context === 'pro' ? 'pro' : 'guest' };
}

export interface TechSheetInput {
  producer: string;
  name: string;
  appellation: string;
  cuvee: string;
  vintage: string;
  color: string;
  region: string;
  country: string;
  grapes: string;
  formatCl: number;
  language: 'fr' | 'en';
}

export function parseTechSheet(body: unknown): TechSheetInput {
  const b = rec(body);
  const out: TechSheetInput = {
    producer: str(b.producer, 100),
    name: str(b.name, 150),
    appellation: str(b.appellation, 100),
    cuvee: str(b.cuvee, 100),
    vintage: str(b.vintage, 10),
    color: str(b.color, 20),
    region: str(b.region, 80),
    country: str(b.country, 60),
    grapes: str(b.grapes, 120),
    formatCl: nbr(b.formatCl, 0, 1000),
    language: lang(b.language),
  };
  if (!out.name && !out.producer) throw new InputError('vin requis');
  return out;
}

export const INVOICE_MIMES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'];
const MAX_BASE64 = 27 * 1024 * 1024;

export interface InvoiceInput {
  base64: string;
  mimeType: string;
}

export function parseInvoiceInput(body: unknown): InvoiceInput {
  const b = rec(body);
  const mimeType = str(b.mimeType, 60).toLowerCase();
  if (!INVOICE_MIMES.includes(mimeType)) throw new InputError('type de fichier non supporté');
  const raw = typeof b.base64 === 'string' ? b.base64 : '';
  const base64 = raw.slice(raw.indexOf(',') + 1);
  if (!base64 || base64.length > MAX_BASE64 || !/^[A-Za-z0-9+/=\s]+$/.test(base64.slice(0, 2000))) throw new InputError('fichier invalide ou trop volumineux');
  return { base64, mimeType };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isoDate = (v: unknown): string => {
  const s = str(v, 10);
  return ISO.test(s) ? s : '';
};
