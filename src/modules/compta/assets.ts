import { round2 } from '@/lib/utils';
import type { Asset } from './types';

/** Jours restants dans l'année de départ en base 30/360 (1er janvier = 360). */
export function daysFirstYear(startIso: string): number {
  const [, m, d] = startIso.split('-').map(Number);
  return (12 - m) * 30 + (30 - Math.min(d, 30)) + 1;
}

export interface DepreciationRow {
  year: number;
  dotation: number;
  cumul: number;
  vnc: number;
}

/** Amortissement linéaire, prorata temporis (jours/360) la première année ; la dernière année solde la base. */
export function depreciationSchedule(a: Pick<Asset, 'amountHT' | 'durationYears' | 'startDepreciationDate'>): DepreciationRow[] {
  const base = round2(a.amountHT);
  if (base <= 0 || a.durationYears <= 0 || !a.startDepreciationDate) return [];
  const annual = base / a.durationYears;
  const startYear = Number(a.startDepreciationDate.slice(0, 4));
  const days = daysFirstYear(a.startDepreciationDate);
  const count = days < 360 ? a.durationYears + 1 : a.durationYears;
  const rows: DepreciationRow[] = [];
  let cumul = 0;
  for (let i = 0; i < count; i++) {
    const remaining = round2(base - cumul);
    const planned = i === 0 ? round2((annual * days) / 360) : round2(annual);
    const dotation = i === count - 1 ? remaining : Math.min(remaining, planned);
    cumul = round2(cumul + dotation);
    rows.push({ year: startYear + i, dotation, cumul, vnc: round2(base - cumul) });
  }
  return rows;
}

export const depreciationForYear = (a: Asset, year: number): number => depreciationSchedule(a).find((r) => r.year === year)?.dotation ?? 0;

export const totalDepreciationForYear = (assets: Asset[], year: number): number => round2(assets.reduce((s, a) => s + depreciationForYear(a, year), 0));

/** Valeur nette comptable à la clôture de l'exercice `year`. */
export function netBookValue(a: Asset, year: number): number {
  if (year < Number(a.startDepreciationDate.slice(0, 4))) return round2(a.amountHT);
  const rows = depreciationSchedule(a);
  const row = [...rows].reverse().find((r) => r.year <= year);
  return row ? row.vnc : round2(a.amountHT);
}
