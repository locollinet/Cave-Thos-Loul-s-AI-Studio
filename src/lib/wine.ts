import type { Wine, WineColor } from '@/types';

export const stripAccents = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .replace(/ß/g, 'ss');

export const norm = (s: string | undefined | null): string =>
  stripAccents(String(s ?? ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const FORMAT_WORDS =
  /\b(demi(e)?s?|fillettes?|magnums?|mag|jeroboams?|jero|bouteilles?|bt|btl|bte|clavelin|37[.,]5\s*cl|75\s*cl|150\s*cl|300\s*cl|1[.,]5\s*l|3\s*l|0[.,]75\s*l|cl|ml)\b/gi;

/** Retire le format et la ponctuation d'un libellé pour le comparer. */
export function cleanName(raw: string | undefined | null): string {
  return norm(String(raw ?? '').replace(FORMAT_WORDS, ' ').replace(/\((mag|demi|jero|bte)\)/gi, ' '));
}

/** Détecte le format en cl depuis un texte libre (« Magnum », « 150cl », « 1,5 L »…). */
export function parseFormatCl(...texts: (string | undefined | null)[]): number {
  const t = norm(texts.filter(Boolean).join(' '));
  if (!t) return 75;
  if (/\b(jeroboam|jero|300 ?cl|3 ?l)\b/.test(t)) return 300;
  if (/\b(magnum|mag|150 ?cl|1 5 ?l)\b/.test(t)) return 150;
  if (/\b(demi|demie|fillette|37 5 ?cl|375 ?ml|37 5)\b/.test(t)) return 37.5;
  if (/\b(clavelin|62 ?cl)\b/.test(t)) return 62;
  if (/\b(70 ?cl|0 7 ?l)\b/.test(t)) return 70;
  if (/\b(100 ?cl|1 ?l)\b/.test(t)) return 100;
  return 75;
}

export const formatLabel = (cl: number): string => {
  if (cl === 75) return '75 cl';
  if (cl === 150) return 'Magnum';
  if (cl === 37.5) return 'Demi';
  if (cl === 300) return 'Jéroboam';
  return `${cl} cl`;
};

export function parseColor(raw: string | undefined | null): WineColor {
  const t = norm(raw);
  if (!t) return 'autre';
  if (/(rouge|red|noir)/.test(t)) return 'rouge';
  if (/(blanc|white)/.test(t)) return 'blanc';
  if (/(rose|pink)/.test(t)) return 'rose';
  if (/(bulle|effervescent|champagne|cremant|sparkling|petillant|mousseux)/.test(t)) return 'bulles';
  if (/(orange)/.test(t)) return 'orange';
  if (/(doux|liquoreux|moelleux|sweet|muscat)/.test(t)) return 'doux';
  if (/(spirit|cognac|whisky|rhum|armagnac|calvados|gin|vodka|eau de vie|digestif)/.test(t)) return 'spiritueux';
  return 'autre';
}

/** Clé canonique : identifie « le même vin » quel que soit le fournisseur ou l'orthographe. */
export function canonicalKey(w: {
  producer?: string;
  name?: string;
  appellation?: string;
  cuvee?: string;
  vintage?: string;
  color?: string;
  formatCl?: number;
}): string {
  const label = w.appellation || w.cuvee ? `${cleanName(w.appellation)} ${cleanName(w.cuvee)}` : cleanName(w.name);
  const parts = [
    norm(w.producer).replace(/^(domaine|chateau|maison|clos|cave)\s+/, '').replace(/\s+/g, ''),
    label.replace(/\s+/g, ''),
    String(w.vintage ?? '').trim().toLowerCase() || 'nm',
    w.color ?? '',
    String(w.formatCl ?? 75),
  ];
  return parts.join('__');
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = s.replace(/\s+/g, ' ');
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Coefficient de Dice sur bigrammes, 0..1. */
export function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const A = bigrams(x);
  const B = bigrams(y);
  let inter = 0;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) ?? 0);
  return (2 * inter) / (Math.max(x.length - 1, 1) + Math.max(y.length - 1, 1));
}

export interface WineMatch {
  wine: Wine;
  score: number;
  exact: boolean;
}

/**
 * Rapproche un vin candidat (issu d'une facture, d'un import, d'un ticket…) du référentiel.
 * Millésime et format doivent concorder ; le score pondère producteur et libellé.
 */
export function findMatches(
  candidate: { producer?: string; name?: string; vintage?: string; color?: string; formatCl?: number },
  wines: Wine[],
  limit = 5,
): WineMatch[] {
  const cKey = canonicalKey({ ...candidate, color: candidate.color as WineColor });
  const v = String(candidate.vintage ?? '').trim().toLowerCase() || 'nm';
  const f = candidate.formatCl ?? 75;
  const out: WineMatch[] = [];
  for (const w of wines) {
    if (w.isArchived) continue;
    if (w.canonicalKey === cKey) {
      out.push({ wine: w, score: 1, exact: true });
      continue;
    }
    if ((w.vintage || 'nm').toLowerCase() !== v || w.formatCl !== f) continue;
    const sp = similarity(candidate.producer ?? '', w.producer);
    const sn = similarity(cleanName(candidate.name), cleanName(w.name));
    const score = (candidate.producer ? 0.35 : 0) * sp + (candidate.producer ? 0.65 : 1) * sn;
    if (score >= 0.6) out.push({ wine: w, score, exact: false });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export const wineLabel = (w: Pick<Wine, 'producer' | 'name' | 'vintage' | 'formatCl'>): string =>
  [w.producer, w.name, w.vintage && w.vintage !== 'NM' ? w.vintage : '', w.formatCl !== 75 ? formatLabel(w.formatCl) : '']
    .filter(Boolean)
    .join(' · ');
