import type { Wine, WineColor } from '@/types';
import { round2 } from '@/lib/utils';
import type { WineSeed } from './catalog';
import type { DemoWorld } from './world';

const SEASON = [0.8, 0.75, 0.85, 0.95, 1.05, 1.1, 1.15, 0.9, 1, 1.05, 1.15, 1.5];
const ROSE = [0.3, 0.3, 0.5, 0.8, 1.3, 1.8, 2.1, 2, 1.2, 0.6, 0.3, 0.3];

/** Saisonnalité : fêtes de fin d'année, rosés l'été, bulles en décembre. */
export function seasonFactor(color: WineColor, month: number): number {
  const base = SEASON[month - 1] ?? 1;
  if (color === 'rose') return base * ROSE[month - 1];
  if (color === 'bulles' && month === 12) return base * 1.4;
  return base;
}

/** Bouteilles par mois en salle, selon le prix d'achat (les grands vins tournent peu). */
export function velocity(s: WineSeed): number {
  const v = s.buy < 25 ? 14 : s.buy < 40 ? 9 : s.buy < 70 ? 5 : s.buy < 120 ? 2.5 : s.buy < 300 ? 0.8 : s.buy < 1000 ? 0.25 : 0.08;
  return (s.format ?? 75) >= 150 ? v * 0.3 : v;
}

const sample = (w: DemoWorld, mean: number): number => (mean < 1 ? (w.rng.chance(mean) ? 1 : 0) : Math.max(0, Math.round(mean * (0.75 + 0.5 * w.rng.next()))));

/** Fenêtres de 30 jours (0 = la plus récente) : jours « il y a » 30k+1 … 30k+29. */
const WINDOWS = 12;
const dayIn = (w: DemoWorld, k: number) => 30 * k + 1 + w.rng.int(0, 28);
const monthOf = (w: DemoWorld, k: number) => Number(w.clock.iso(30 * k + 15).slice(5, 7));

export interface SecondarySite {
  siteId: string;
  name: string;
  wines: Wine[];
  factor: number;
  every: number; // réassort depuis la cave principale toutes les `every` fenêtres
  batch: number; // sorties saisies toutes les `batch` fenêtres (diviseur de `every`)
  target: (s: WineSeed) => number;
}

export interface HospitalityOptions {
  mainFactor: number;
  reason: 'consommation' | 'vente';
  secondaries: SecondarySite[];
  vatRate: number;
}

export type Target = { wineId: string; siteId: string; target: number };

/** Sorties de stock d'un restaurant ou d'un groupe : service, réassorts internes, casse et formations. */
export function buildHospitalityDemand(w: DemoWorld, o: HospitalityOptions): Target[] {
  const targets: Target[] = [];
  const priceOf = (wine: Wine) => (o.reason === 'vente' && wine.menuPriceTTC ? round2(wine.menuPriceTTC / (1 + o.vatRate / 100)) : undefined);

  for (const wine of w.wines) {
    const s = w.seedById.get(wine.id)!;
    targets.push({ wineId: wine.id, siteId: w.mainSiteId, target: s.qty });
    for (let k = 0; k < WINDOWS; k++) {
      const qty = sample(w, velocity(s) * seasonFactor(s.color, monthOf(w, k)) * o.mainFactor);
      if (!qty) continue;
      w.ledger.add({ wineId: wine.id, siteId: w.mainSiteId, type: 'out', qty, reason: o.reason, date: w.clock.iso(dayIn(w, k)), unitPriceHT: priceOf(wine) });
    }
  }

  for (const site of o.secondaries) {
    for (const wine of site.wines) {
      const s = w.seedById.get(wine.id)!;
      const target = s.qty > 0 ? site.target(s) : 0;
      targets.push({ wineId: wine.id, siteId: site.siteId, target });
      const demand: number[] = [];
      for (let k = 0; k < WINDOWS; k++) demand.push(sample(w, velocity(s) * seasonFactor(s.color, monthOf(w, k)) * site.factor));
      // Saisie groupée, datée dans la fenêtre la plus récente du lot (donc après le réassort qui la couvre).
      for (let k = 0; k < WINDOWS; k += site.batch) {
        const qty = demand.slice(k, k + site.batch).reduce((a, b) => a + b, 0);
        if (qty) w.ledger.add({ wineId: wine.id, siteId: site.siteId, type: 'out', qty, reason: o.reason, date: w.clock.iso(dayIn(w, k)), unitPriceHT: priceOf(wine) });
      }
      for (let g = 0; g * site.every < WINDOWS; g++) {
        const ks = Array.from({ length: site.every }, (_, i) => g * site.every + i).filter((k) => k < WINDOWS);
        const qty = ks.reduce((n, k) => n + demand[k], 0) + (g === 0 ? target : 0);
        const oldest = Math.max(...ks);
        if (qty > 0) w.ledger.add({ wineId: wine.id, siteId: w.mainSiteId, toSiteId: site.siteId, type: 'transfer', qty, reason: 'transfert', date: w.clock.iso(30 * oldest + 29), note: `Réassort ${site.name}` });
      }
    }
  }

  // Casse, formation de l'équipe, ventes à emporter
  const extra: [string, number, number, 'casse' | 'degustation' | 'vente', string][] = [
    ['fevre-montmains', 1, 287, 'casse', 'Casse en service'],
    ['joguet-chinon', 1, 175, 'casse', 'Casse en cave'],
    ['ruinart-bdb', 1, 64, 'casse', 'Casse en service'],
    ['jamet-cote-rotie', 2, 330, 'degustation', "Formation de l'équipe de salle"],
    ['leflaive-puligny', 1, 210, 'degustation', "Formation de l'équipe de salle"],
    ['mas-jullien', 2, 120, 'degustation', 'Accord mets-vins de la nouvelle carte'],
    ['peters-reserve', 2, 45, 'degustation', "Formation de l'équipe de salle"],
  ];
  if (o.reason === 'consommation') {
    extra.push(
      ['lapierre-morgon', 6, 300, 'vente', 'Vente à emporter'],
      ['ruinart-bdb', 3, 296, 'vente', 'Vente à emporter'],
      ['tempier-rose', 6, 95, 'vente', 'Vente à emporter'],
      ['jamet-cote-rotie', 2, 30, 'vente', 'Vente à emporter'],
    );
  }
  for (const [k, qty, ago, reason, note] of extra) {
    const wine = w.wineByKey.get(k);
    if (!wine) continue;
    const unitPriceHT = reason === 'vente' ? (o.reason === 'vente' ? priceOf(wine) : wine.sellPriceHT) : undefined;
    w.ledger.add({ wineId: wine.id, siteId: w.mainSiteId, type: 'out', qty, reason, date: w.clock.iso(ago), unitPriceHT, note });
  }
  return targets;
}
