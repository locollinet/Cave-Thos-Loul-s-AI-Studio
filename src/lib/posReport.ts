import type { Wine } from '@/types';
import { parseCsv } from './utils';
import { norm } from './wine';

export interface PosReportLine {
  id: string;
  rawLabel: string;
  posCode?: string;
  qty: number;
}

const LABEL_COLS = ['article', 'libelle', 'designation', 'produit', 'nom', 'item', 'description'];
const QTY_COLS = ['quantite', 'qte', 'qty', 'quantity', 'nb', 'vendus'];
const CODE_COLS = ['code', 'plu', 'sku', 'ean', 'ref', 'reference'];

/** Lit un rapport de ventes de caisse (CSV / TXT) : colonnes reconnues par leur en-tête, sinon article ; quantité ; code. */
export function parsePosReport(text: string): PosReportLine[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => norm(h));
  const find = (names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(`${n} `)));
  const hasHeader = find(LABEL_COLS) >= 0 || find(QTY_COLS) >= 0;
  const label = hasHeader ? Math.max(0, find(LABEL_COLS)) : 0;
  const qty = hasHeader ? find(QTY_COLS) : 1;
  const code = hasHeader ? find(CODE_COLS) : 2;
  return rows
    .slice(hasHeader ? 1 : 0)
    .map((r, i) => ({
      id: `line_${i}`,
      rawLabel: (r[label] ?? '').trim(),
      qty: Math.round(Number(String(r[qty] ?? '').replace(',', '.'))),
      posCode: code >= 0 ? (r[code] ?? '').trim() || undefined : undefined,
    }))
    .filter((l) => l.rawLabel && Number.isFinite(l.qty) && l.qty > 0 && l.qty <= 1000);
}

/** Rapprochement : code caisse exact, sinon au moins deux mots significatifs en commun avec la fiche. */
export function matchPosWine(wines: Wine[], rawLabel: string, posCode?: string): string | undefined {
  if (posCode) {
    const byCode = wines.find((w) => w.posCode && w.posCode === posCode);
    if (byCode) return byCode.id;
  }
  const words = norm(rawLabel).split(' ').filter((x) => x.length > 2);
  let best: Wine | undefined;
  let bestScore = 1;
  for (const w of wines) {
    if (w.isArchived) continue;
    const target = norm(`${w.producer} ${w.name} ${w.vintage}`);
    const score = words.filter((word) => target.includes(word)).length;
    if (score > bestScore) {
      bestScore = score;
      best = w;
    }
  }
  return best?.id;
}
