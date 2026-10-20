import type { Wine } from '@/types';
import { canonicalKey, norm, parseColor, parseFormatCl } from './wine';
import { toNumber } from './utils';

export type ImportField = 'producer' | 'name' | 'vintage' | 'color' | 'format' | 'region' | 'country' | 'grapes' | 'buyPriceHT' | 'sellPriceHT' | 'qty' | 'ean';

export const IMPORT_FIELDS: ImportField[] = ['producer', 'name', 'vintage', 'color', 'format', 'region', 'country', 'grapes', 'buyPriceHT', 'sellPriceHT', 'qty', 'ean'];

const SYNONYMS: Record<ImportField, string[]> = {
  producer: ['domaine', 'producteur', 'producer', 'maison', 'chateau', 'vigneron', 'winery'],
  name: ['cuvee', 'appellation', 'nom', 'vin', 'designation', 'libelle', 'wine', 'name', 'produit', 'description'],
  vintage: ['millesime', 'annee', 'vintage', 'year'],
  color: ['couleur', 'color', 'colour', 'type'],
  format: ['format', 'contenance', 'volume', 'taille'],
  region: ['region', 'zone'],
  country: ['pays', 'country'],
  grapes: ['cepage', 'cepages', 'grapes', 'varietal'],
  buyPriceHT: ['prix achat', 'achat ht', 'pa ht', 'cout', 'cost', 'buy', 'prix achat ht'],
  sellPriceHT: ['prix vente', 'vente ht', 'pv ht', 'tarif', 'price', 'prix', 'prix vente ht'],
  qty: ['stock', 'quantite', 'qte', 'qty', 'quantity', 'bouteilles', 'nb'],
  ean: ['ean', 'code barre', 'gtin', 'barcode', 'code'],
};

/** Devine la colonne correspondant à chaque champ à partir des en-têtes. */
export function detectMapping(headers: string[]): Partial<Record<ImportField, number>> {
  const h = headers.map((x) => norm(x));
  const out: Partial<Record<ImportField, number>> = {};
  const used = new Set<number>();
  for (const f of IMPORT_FIELDS) {
    let idx = -1;
    for (const syn of SYNONYMS[f]) {
      idx = h.findIndex((x, i) => !used.has(i) && x === syn);
      if (idx >= 0) break;
    }
    if (idx < 0)
      for (const syn of SYNONYMS[f]) {
        idx = h.findIndex((x, i) => !used.has(i) && x.includes(syn));
        if (idx >= 0) break;
      }
    if (idx >= 0) {
      out[f] = idx;
      used.add(idx);
    }
  }
  return out;
}

export interface ImportedWine {
  producer: string;
  name: string;
  vintage: string;
  color: Wine['color'];
  formatCl: number;
  region?: string;
  country?: string;
  grapes?: string;
  buyPriceHT?: number;
  sellPriceHT?: number;
  qty?: number;
  ean?: string;
  canonicalKey: string;
}

export function mapRows(rows: unknown[][], mapping: Partial<Record<ImportField, number>>): ImportedWine[] {
  const get = (r: unknown[], f: ImportField) => (mapping[f] === undefined ? undefined : r[mapping[f]!]);
  const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
  const out: ImportedWine[] = [];
  for (const r of rows) {
    const name = str(get(r, 'name'));
    const producer = str(get(r, 'producer'));
    if (!name && !producer) continue;
    const vintageRaw = str(get(r, 'vintage'));
    const vintage = /^\d{4}/.test(vintageRaw) ? vintageRaw.slice(0, 4) : vintageRaw ? 'NM' : 'NM';
    const formatRaw = str(get(r, 'format'));
    const formatNum = toNumber(formatRaw);
    const formatCl = formatNum && formatNum > 0 ? (formatNum < 10 ? formatNum * 100 : formatNum) : parseFormatCl(formatRaw, name);
    const w: ImportedWine = {
      producer: producer || '—',
      name: name || producer,
      vintage,
      color: parseColor(str(get(r, 'color'))),
      formatCl,
      region: str(get(r, 'region')) || undefined,
      country: str(get(r, 'country')) || undefined,
      grapes: str(get(r, 'grapes')) || undefined,
      buyPriceHT: toNumber(get(r, 'buyPriceHT')),
      sellPriceHT: toNumber(get(r, 'sellPriceHT')),
      qty: toNumber(get(r, 'qty')),
      ean: str(get(r, 'ean')) || undefined,
      canonicalKey: '',
    };
    w.canonicalKey = canonicalKey(w);
    out.push(w);
  }
  return out;
}
