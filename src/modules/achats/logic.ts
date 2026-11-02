import type { Wine, WineColor, PurchaseInvoice } from '@/types';
import { findMatches, norm, parseColor, parseFormatCl } from '@/lib/wine';
import { round2, toNumber, uid } from '@/lib/utils';
import type { InvoiceDraft, ParsedInvoice, ParsedLine, PricePoint, ReviewLine, Totals, TotalsCheck } from './types';

export const TOLERANCE = 0.05;
const AUTO_MATCH_SCORE = 0.85;

export const emptyLine = (vatRate = 20): ReviewLine => ({
  key: uid(),
  description: '',
  producer: '',
  name: '',
  vintage: 'NM',
  formatCl: 75,
  color: 'rouge',
  region: '',
  qty: 1,
  unitPriceHT: 0,
  vatRate,
  choice: 'create',
});

export const emptyDraft = (siteId: string, today: string, vatRate: number): InvoiceDraft => ({
  id: uid(),
  supplierName: '',
  number: '',
  date: today,
  dueDate: '',
  shippingHT: 0,
  siteId,
  declaredHT: 0,
  declaredVAT: 0,
  declaredTTC: 0,
  lines: [emptyLine(vatRate)],
});

export function computeTotals(lines: Pick<ReviewLine, 'qty' | 'unitPriceHT' | 'vatRate'>[], shippingHT: number, shippingVatRate: number): Totals {
  let ht = shippingHT;
  let vat = (shippingHT * shippingVatRate) / 100;
  for (const l of lines) {
    const net = l.qty * l.unitPriceHT;
    ht += net;
    vat += (net * l.vatRate) / 100;
  }
  return { ht: round2(ht), vat: round2(vat), ttc: round2(ht + vat) };
}

/** Compare les totaux calculés aux totaux lus sur la facture ; l'écart toléré est de 0,05 €. */
export function checkTotals(computed: Totals, declared: { ht: number; vat: number; ttc?: number }): TotalsCheck {
  const has = declared.ht > 0;
  const htDiff = has ? round2(computed.ht - declared.ht) : 0;
  const vatDiff = has && declared.vat > 0 ? round2(computed.vat - declared.vat) : 0;
  const ttcDiff = has && (declared.ttc ?? 0) > 0 ? round2(computed.ttc - (declared.ttc ?? 0)) : 0;
  return { declared: has, htDiff, vatDiff, ttcDiff, ok: [htDiff, vatDiff, ttcDiff].every((d) => Math.abs(d) <= TOLERANCE) };
}

export function findDuplicate(invoices: PurchaseInvoice[], supplierName: string, number: string, excludeId?: string): PurchaseInvoice | undefined {
  const s = norm(supplierName);
  const n = norm(number);
  if (!s || !n) return undefined;
  return invoices.find((i) => i.id !== excludeId && norm(i.supplierName) === s && norm(i.number) === n);
}

export function priceHistory(wineId: string, invoices: PurchaseInvoice[]): PricePoint[] {
  const pts: PricePoint[] = [];
  for (const inv of invoices) {
    if (inv.status === 'draft') continue;
    for (const l of inv.lines) if (l.wineId === wineId && l.unitPriceHT > 0) pts.push({ date: inv.date, price: l.unitPriceHT });
  }
  return pts.sort((a, b) => a.date.localeCompare(b.date));
}

/** Rapprochement d'une ligne avec le référentiel : sélection automatique si la correspondance est fiable. */
export function matchLine(l: Pick<ReviewLine, 'producer' | 'name' | 'vintage' | 'color' | 'formatCl'>, wines: Wine[]): Pick<ReviewLine, 'wineId' | 'choice' | 'score'> {
  const best = findMatches(l, wines, 1)[0];
  if (best && (best.exact || best.score >= AUTO_MATCH_SCORE)) return { wineId: best.wine.id, choice: 'match', score: best.score };
  return { wineId: undefined, choice: 'create', score: best?.score };
}

const toReviewLine = (p: ParsedLine, wines: Wine[], defaultVat: number): ReviewLine => {
  const base = {
    key: uid(),
    description: p.description,
    producer: p.producer,
    name: p.cuvee || p.description,
    vintage: (p.vintage || 'NM').trim(),
    formatCl: p.formatCl || parseFormatCl(p.description),
    color: parseColor(p.color || `${p.description} ${p.cuvee}`) as WineColor,
    region: p.region,
    qty: p.qty,
    unitPriceHT: p.unitPriceHT,
    vatRate: p.vatRate || defaultVat,
  };
  return { ...base, ...matchLine(base, wines) };
};

export function toDraft(p: ParsedInvoice, wines: Wine[], opts: { siteId: string; today: string; vatRate: number; fileName?: string }): InvoiceDraft {
  return {
    id: uid(),
    supplierName: p.supplierName,
    number: p.number,
    date: p.date || opts.today,
    dueDate: p.dueDate,
    shippingHT: p.shippingHT,
    siteId: opts.siteId,
    fileName: opts.fileName,
    declaredHT: p.totalHT,
    declaredVAT: p.totalVAT,
    declaredTTC: p.totalTTC,
    lines: p.lines.map((l) => toReviewLine(l, wines, opts.vatRate)),
  };
}

export function invoiceToDraft(inv: PurchaseInvoice, wines: Wine[], defaultSiteId: string, vatRate: number): InvoiceDraft {
  return {
    id: inv.id,
    supplierName: inv.supplierName,
    number: inv.number,
    date: inv.date,
    dueDate: inv.dueDate ?? '',
    shippingHT: inv.shippingHT ?? 0,
    siteId: inv.siteId ?? defaultSiteId,
    fileName: inv.fileName,
    declaredHT: inv.totalHT,
    declaredVAT: inv.totalVAT,
    declaredTTC: inv.totalTTC,
    lines: inv.lines.map((l) => {
      const base = {
        key: uid(),
        description: l.description,
        producer: l.producer ?? '',
        name: l.description,
        vintage: l.vintage ?? 'NM',
        formatCl: l.formatCl ?? 75,
        color: 'rouge' as WineColor,
        region: '',
        qty: l.qty,
        unitPriceHT: l.unitPriceHT,
        vatRate: l.vatRate ?? vatRate,
      };
      const wine = l.wineId ? wines.find((w) => w.id === l.wineId) : undefined;
      if (wine) return { ...base, name: wine.name, color: wine.color, wineId: wine.id, choice: 'match' as const };
      return { ...base, ...matchLine(base, wines) };
    }),
  };
}

/* ------------------------------------------------------------------ CSV / Excel */

type Field = 'vintage' | 'formatCl' | 'qty' | 'vatRate' | 'color' | 'region' | 'unitPriceHT' | 'producer' | 'name';

const COLUMN_RULES: [Field, RegExp][] = [
  ['vintage', /millesime|vintage|annee|year/],
  ['formatCl', /format|contenance|volume|taille|size/],
  ['qty', /^(qte|qty|quantite|quantity|nb|nombre|bouteilles|btl|colis)\b|\b(qte|quantite|quantity|qty)\b/],
  ['vatRate', /tva|vat|taxe/],
  ['color', /couleur|colou?r|type/],
  ['region', /region/],
  ['unitPriceHT', /prix|\bpu\b|p u|unit|tarif|price/],
  ['producer', /producteur|domaine|producer|vigneron|chateau|maison/],
  ['name', /cuvee|designation|libelle|description|appellation|vin\b|wine|produit|product|nom|name|article/],
];

type ColumnMap = Partial<Record<Field, number>>;

function mapColumns(header: string[]): ColumnMap {
  const map: ColumnMap = {};
  header.forEach((raw, i) => {
    const h = norm(raw);
    if (!h || /total|montant|amount|ttc/.test(h)) return;
    for (const [field, re] of COLUMN_RULES) {
      if (map[field] === undefined && re.test(h)) {
        map[field] = i;
        break;
      }
    }
  });
  return map;
}

/** Lit un tableau (CSV / Excel) dont la ligne d'en-tête est détectée automatiquement. */
export function parseTabular(rows: string[][], fileName = ''): ParsedInvoice | null {
  const idx = rows.slice(0, 15).findIndex((r) => {
    const m = mapColumns(r);
    return m.qty !== undefined && m.unitPriceHT !== undefined && (m.name !== undefined || m.producer !== undefined);
  });
  if (idx < 0) return null;
  const map = mapColumns(rows[idx]);
  const cell = (r: string[], f: Field): string => (map[f] === undefined ? '' : String(r[map[f] as number] ?? '').trim());
  const lines: ParsedLine[] = [];
  for (const r of rows.slice(idx + 1)) {
    const qty = toNumber(cell(r, 'qty')) ?? 0;
    const unit = toNumber(cell(r, 'unitPriceHT')) ?? 0;
    const name = cell(r, 'name');
    const producer = cell(r, 'producer');
    if (qty <= 0 || (!name && !producer)) continue;
    const fmt = cell(r, 'formatCl');
    const fmtNum = toNumber(fmt);
    lines.push({
      description: [producer, name].filter(Boolean).join(' '),
      producer,
      cuvee: name,
      vintage: cell(r, 'vintage') || 'NM',
      formatCl: fmtNum ? (fmtNum <= 5 ? fmtNum * 100 : fmtNum) : parseFormatCl(fmt, name),
      color: cell(r, 'color'),
      region: cell(r, 'region'),
      qty,
      unitPriceHT: unit,
      vatRate: toNumber(cell(r, 'vatRate')) ?? 20,
    });
  }
  if (!lines.length) return null;
  return { supplierName: '', number: fileName.replace(/\.[^.]+$/, ''), date: '', dueDate: '', shippingHT: 0, lines, totalHT: 0, totalVAT: 0, totalTTC: 0 };
}
