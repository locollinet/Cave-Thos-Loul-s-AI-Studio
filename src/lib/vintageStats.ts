import type { Movement, Site, StockLevel, Wine, WineColor } from '@/types';
import { stockByWine } from '@/data/stock';
import { htFromTtc, round2 } from '@/lib/utils';
import { norm } from '@/lib/wine';

export type MaturityState = 'ready' | 'aging' | 'urgent';

export interface VintageRow {
  vintage: string; // "2018" ou "NM"
  year: number | null; // null pour "NM"
  age: number | null; // currentYear - year
  bottles: number;
  refs: number;
  costHT: number;
  sellHT: number;
  menuTTC: number;
  marginHT: number;
  marginRate: number | null; // % taux de marque (marginHT / sellHT * 100)
  avgUnitMarginHT: number; // marge moyenne par bouteille (€ HT)
  avgMenuPriceTTC: number; // prix carte moyen par bouteille (€ TTC)
  readyBottles: number; // dans la fenêtre d'apogée (ou prêt à boire)
  agingBottles: number; // en garde (apogeeFrom > currentYear)
  urgentBottles: number; // apogée dépassée ou <= currentYear + 1
  exits12m: number; // bouteilles sorties sur 12 mois glissants
  coverageYears: number | null; // années de stock au rythme actuel
}

export interface VintageCohort {
  id: 'heritage' | 'prime' | 'young' | 'nm';
  label: string;
  subLabel: string;
  bottles: number;
  refs: number;
  shareBottlesPct: number;
  shareValuePct: number;
  costHT: number;
  sellHT: number;
  menuTTC: number;
  marginHT: number;
  marginRate: number | null;
  avgUnitMarginHT: number;
  avgMenuPriceTTC: number;
  exits12m: number;
  rotationPct: number | null; // exits12m / (bottles + exits12m) * 100
}

export interface VerticalVintageItem {
  wineId: string;
  vintage: string;
  year: number;
  qty: number;
  costHT: number;
  menuPriceTTC: number;
  maturity: MaturityState;
  apogeeFrom?: number;
  apogeeTo?: number;
}

export interface VerticalFlight {
  key: string;
  producer: string;
  name: string;
  appellation?: string;
  region?: string;
  color: WineColor;
  vintages: VerticalVintageItem[];
  vintageSpan: string; // ex. "2017 – 2021 (4 millésimes)"
  completeFlights: number; // min(qty) sur tous les millésimes de la verticale
  totalBottles: number;
  flightCostHT: number; // coût d'achat HT d'une verticale complète (1 btl de chaque millésime)
  flightMenuTTC: number; // valeur carte TTC d'une verticale complète
  flightMarginHT: number; // marge nette HT d'une verticale complète
}

export interface VintageAnalytics {
  currentYear: number;
  totalBottles: number;
  totalRefs: number;
  totalCostHT: number;
  totalSellHT: number;
  totalMenuTTC: number;
  totalMarginHT: number;
  weightedAvgAge: number | null; // âge moyen pondéré par le volume (bouteilles)
  valueWeightedAvgAge: number | null; // âge moyen pondéré par la valeur d'achat HT
  medianVintage: number | null;
  oldestVintage: number | null;
  newestVintage: number | null;
  readyBottles: number;
  agingBottles: number;
  urgentBottles: number;
  readySharePct: number;
  agingSharePct: number;
  urgentSharePct: number;
  urgentCostHT: number;
  urgentMenuTTC: number;
  byVintage: VintageRow[]; // trié chronologiquement (du plus ancien au plus récent, puis NM)
  cohorts: VintageCohort[];
  verticals: VerticalFlight[];
}

export const parseVintageYear = (v: string | undefined): number | null => {
  if (!v) return null;
  const m = /^\s*(19\d{2}|20\d{2})\s*$/.exec(v);
  return m ? Number(m[1]) : null;
};

export function classifyMaturity(w: Pick<Wine, 'apogeeFrom' | 'apogeeTo' | 'vintage'>, currentYear: number): MaturityState {
  if (w.apogeeTo && w.apogeeTo <= currentYear + 1) return 'urgent';
  if (w.apogeeFrom && w.apogeeFrom > currentYear) return 'aging';
  return 'ready';
}

const SERVED_REASONS = new Set(['vente', 'verre', 'consommation', 'depot_vente']);
const LOSS_REASONS = new Set(['casse', 'bouchonne', 'oxyde', 'offert', 'degustation', 'autre']);

/**
 * Analyse statistique multi-années du parc de cave :
 * - Pyramide des millésimes (volumes, immobilisation HT, valeur carte TTC, maturité, couverture en années)
 * - Âge moyen pondéré (volume vs valeur financière), millésime médian, indice de maturité
 * - Comparaison statistique par cohorte d'âge (marge unitaire € HT et rotation)
 * - Détection automatique des « Verticales Prestige » (≥ 3 millésimes d'une même cuvée en stock)
 */
export function computeVintageAnalytics(
  wines: Wine[],
  stock: StockLevel[],
  movements: Movement[],
  opts?: { siteId?: string | 'all'; now?: number; vatRate?: number; preferMenuPrice?: boolean },
): VintageAnalytics {
  const siteId = opts?.siteId ?? 'all';
  const now = opts?.now ?? Date.now();
  const vatRate = opts?.vatRate ?? 20;
  const preferMenu = opts?.preferMenuPrice ?? true;
  const currentYear = new Date(now).getFullYear();
  const cutoff12m = new Date(now - 365 * 86_400_000).toISOString().slice(0, 10);

  const qtyMap = stockByWine(stock, siteId);
  const exitsByWine = new Map<string, number>();
  for (const m of movements) {
    if (m.type !== 'out' || m.date < cutoff12m) continue;
    if (siteId !== 'all' && m.siteId !== siteId) continue;
    if (SERVED_REASONS.has(m.reason) || LOSS_REASONS.has(m.reason)) {
      exitsByWine.set(m.wineId, (exitsByWine.get(m.wineId) ?? 0) + m.qty);
    }
  }

  const rowMap = new Map<string, {
    vintage: string;
    year: number | null;
    bottles: number;
    refs: number;
    costHT: number;
    sellHT: number;
    menuTTC: number;
    readyBottles: number;
    agingBottles: number;
    urgentBottles: number;
    exits12m: number;
  }>();

  let totalBottles = 0;
  let totalRefs = 0;
  let totalCostHT = 0;
  let totalSellHT = 0;
  let totalMenuTTC = 0;
  let readyBottles = 0;
  let agingBottles = 0;
  let urgentBottles = 0;
  let urgentCostHT = 0;
  let urgentMenuTTC = 0;

  let ageBottleSum = 0;
  let ageBottleWeight = 0;
  let ageCostSum = 0;
  let ageCostWeight = 0;
  const expandedYears: { year: number; bottles: number }[] = [];

  // Groupement pour détection des verticales (même domaine + cuvée sur >= 3 millésimes)
  const verticalGroups = new Map<string, {
    producer: string;
    name: string;
    appellation?: string;
    region?: string;
    color: WineColor;
    byYear: Map<number, VerticalVintageItem>;
  }>();

  for (const w of wines) {
    if (w.isArchived) continue;
    const qty = qtyMap.get(w.id) ?? 0;
    const exits = exitsByWine.get(w.id) ?? 0;
    if (qty <= 0 && exits <= 0) continue;

    const year = parseVintageYear(w.vintage);
    const vKey = year !== null ? String(year) : 'NM';
    const unitCost = w.buyPriceHT ?? 0;
    const unitMenuTTC = w.menuPriceTTC ?? (w.sellPriceHT ? round2(w.sellPriceHT * (1 + vatRate / 100)) : 0);
    const unitSellHT = preferMenu && unitMenuTTC > 0
      ? htFromTtc(unitMenuTTC, vatRate)
      : (w.sellPriceHT ?? (unitMenuTTC > 0 ? htFromTtc(unitMenuTTC, vatRate) : 0));
    const maturity = classifyMaturity(w, currentYear);

    const rec = rowMap.get(vKey) ?? {
      vintage: vKey,
      year,
      bottles: 0,
      refs: 0,
      costHT: 0,
      sellHT: 0,
      menuTTC: 0,
      readyBottles: 0,
      agingBottles: 0,
      urgentBottles: 0,
      exits12m: 0,
    };

    rec.exits12m += exits;

    if (qty > 0) {
      const cHT = qty * unitCost;
      const sHT = qty * unitSellHT;
      const mTTC = qty * unitMenuTTC;

      rec.bottles += qty;
      rec.refs += 1;
      rec.costHT += cHT;
      rec.sellHT += sHT;
      rec.menuTTC += mTTC;

      totalBottles += qty;
      totalRefs += 1;
      totalCostHT += cHT;
      totalSellHT += sHT;
      totalMenuTTC += mTTC;

      if (maturity === 'ready') {
        rec.readyBottles += qty;
        readyBottles += qty;
      } else if (maturity === 'aging') {
        rec.agingBottles += qty;
        agingBottles += qty;
      } else {
        rec.urgentBottles += qty;
        urgentBottles += qty;
        urgentCostHT += cHT;
        urgentMenuTTC += mTTC;
      }

      if (year !== null) {
        const age = Math.max(0, currentYear - year);
        ageBottleSum += age * qty;
        ageBottleWeight += qty;
        if (cHT > 0) {
          ageCostSum += age * cHT;
          ageCostWeight += cHT;
        }
        expandedYears.push({ year, bottles: qty });

        // Enregistrement pour détection de verticale (format 75cl ou 150cl confondu par millésime)
        if (w.producer && w.name) {
          const gKey = `${norm(w.producer)}__${norm(w.name)}__${w.color}`;
          let g = verticalGroups.get(gKey);
          if (!g) {
            g = { producer: w.producer, name: w.name, appellation: w.appellation, region: w.region, color: w.color, byYear: new Map() };
            verticalGroups.set(gKey, g);
          }
          const prev = g.byYear.get(year);
          if (!prev) {
            g.byYear.set(year, {
              wineId: w.id,
              vintage: String(year),
              year,
              qty,
              costHT: unitCost,
              menuPriceTTC: unitMenuTTC,
              maturity,
              apogeeFrom: w.apogeeFrom,
              apogeeTo: w.apogeeTo,
            });
          } else {
            prev.qty += qty;
          }
        }
      }
    }

    if (rec.bottles > 0) rowMap.set(vKey, rec);
  }

  const byVintage: VintageRow[] = [...rowMap.values()]
    .sort((a, b) => {
      if (a.year === null && b.year === null) return 0;
      if (a.year === null) return 1;
      if (b.year === null) return -1;
      return a.year - b.year;
    })
    .map((r) => {
      const costHT = round2(r.costHT);
      const sellHT = round2(r.sellHT);
      const menuTTC = round2(r.menuTTC);
      const marginHT = round2(sellHT - costHT);
      const marginRate = sellHT > 0 ? Math.round((marginHT / sellHT) * 1000) / 10 : null;
      return {
        vintage: r.vintage,
        year: r.year,
        age: r.year !== null ? Math.max(0, currentYear - r.year) : null,
        bottles: r.bottles,
        refs: r.refs,
        costHT,
        sellHT,
        menuTTC,
        marginHT,
        marginRate,
        avgUnitMarginHT: r.bottles > 0 ? round2(marginHT / r.bottles) : 0,
        avgMenuPriceTTC: r.bottles > 0 ? round2(menuTTC / r.bottles) : 0,
        readyBottles: r.readyBottles,
        agingBottles: r.agingBottles,
        urgentBottles: r.urgentBottles,
        exits12m: r.exits12m,
        coverageYears: r.exits12m > 0 ? Math.round((r.bottles / r.exits12m) * 10) / 10 : null,
      };
    });

  // Calcul des bornes et de la médiane
  expandedYears.sort((a, b) => a.year - b.year);
  const oldestVintage = expandedYears.length ? expandedYears[0].year : null;
  const newestVintage = expandedYears.length ? expandedYears[expandedYears.length - 1].year : null;
  let medianVintage: number | null = null;
  if (ageBottleWeight > 0) {
    const half = ageBottleWeight / 2;
    let acc = 0;
    for (const item of expandedYears) {
      acc += item.bottles;
      if (acc >= half) {
        medianVintage = item.year;
        break;
      }
    }
  }

  // Cohortes statistiques par tranche d'âge
  const cohortDefs: { id: VintageCohort['id']; label: string; subLabel: string; match: (y: number | null) => boolean }[] = [
    { id: 'heritage', label: 'Grands Millésimes & Garde', subLabel: `≤ ${currentYear - 8} (8 ans et +)`, match: (y) => y !== null && y <= currentYear - 8 },
    { id: 'prime', label: 'Cœur de Carte & Apogée', subLabel: `${currentYear - 7} – ${currentYear - 5} (5 à 7 ans)`, match: (y) => y !== null && y >= currentYear - 7 && y <= currentYear - 5 },
    { id: 'young', label: 'Millésimes Récents & Vifs', subLabel: `${currentYear - 4} – ${currentYear} (< 5 ans)`, match: (y) => y !== null && y >= currentYear - 4 },
    { id: 'nm', label: 'Non Millésimés (Champagnes)', subLabel: 'Assemblages & Réserves', match: (y) => y === null },
  ];

  const cohorts: VintageCohort[] = cohortDefs
    .map((def) => {
      const matching = byVintage.filter((r) => def.match(r.year));
      const bottles = matching.reduce((s, r) => s + r.bottles, 0);
      const refs = matching.reduce((s, r) => s + r.refs, 0);
      const costHT = round2(matching.reduce((s, r) => s + r.costHT, 0));
      const sellHT = round2(matching.reduce((s, r) => s + r.sellHT, 0));
      const menuTTC = round2(matching.reduce((s, r) => s + r.menuTTC, 0));
      const marginHT = round2(sellHT - costHT);
      const exits12m = matching.reduce((s, r) => s + r.exits12m, 0);
      return {
        id: def.id,
        label: def.label,
        subLabel: def.subLabel,
        bottles,
        refs,
        shareBottlesPct: totalBottles > 0 ? Math.round((bottles / totalBottles) * 100) : 0,
        shareValuePct: totalCostHT > 0 ? Math.round((costHT / totalCostHT) * 100) : 0,
        costHT,
        sellHT,
        menuTTC,
        marginHT,
        marginRate: sellHT > 0 ? Math.round((marginHT / sellHT) * 1000) / 10 : null,
        avgUnitMarginHT: bottles > 0 ? round2(marginHT / bottles) : 0,
        avgMenuPriceTTC: bottles > 0 ? round2(menuTTC / bottles) : 0,
        exits12m,
        rotationPct: bottles + exits12m > 0 ? Math.round((exits12m / (bottles + exits12m)) * 100) : null,
      };
    })
    .filter((c) => c.bottles > 0 || c.exits12m > 0);

  // Construction des verticales (>= 3 millésimes en stock)
  const verticals: VerticalFlight[] = [];
  for (const [key, g] of verticalGroups) {
    if (g.byYear.size < 3) continue;
    const vintages = [...g.byYear.values()].sort((a, b) => a.year - b.year);
    const completeFlights = Math.min(...vintages.map((v) => v.qty));
    const totalVerticalBottles = vintages.reduce((s, v) => s + v.qty, 0);
    const flightCostHT = round2(vintages.reduce((s, v) => s + v.costHT, 0));
    const flightMenuTTC = round2(vintages.reduce((s, v) => s + v.menuPriceTTC, 0));
    const flightSellHT = htFromTtc(flightMenuTTC, vatRate);
    const flightMarginHT = round2(flightSellHT - flightCostHT);

    verticals.push({
      key,
      producer: g.producer,
      name: g.name,
      appellation: g.appellation,
      region: g.region,
      color: g.color,
      vintages,
      vintageSpan: `${vintages[0].vintage} – ${vintages[vintages.length - 1].vintage}`,
      completeFlights,
      totalBottles: totalVerticalBottles,
      flightCostHT,
      flightMenuTTC,
      flightMarginHT,
    });
  }
  verticals.sort((a, b) => b.vintages.length - a.vintages.length || b.flightMarginHT - a.flightMarginHT);

  const fCost = round2(totalCostHT);
  const fSell = round2(totalSellHT);
  const fMenu = round2(totalMenuTTC);
  const fMargin = round2(fSell - fCost);

  return {
    currentYear,
    totalBottles,
    totalRefs,
    totalCostHT: fCost,
    totalSellHT: fSell,
    totalMenuTTC: fMenu,
    totalMarginHT: fMargin,
    weightedAvgAge: ageBottleWeight > 0 ? Math.round((ageBottleSum / ageBottleWeight) * 10) / 10 : null,
    valueWeightedAvgAge: ageCostWeight > 0 ? Math.round((ageCostSum / ageCostWeight) * 10) / 10 : null,
    medianVintage,
    oldestVintage,
    newestVintage,
    readyBottles,
    agingBottles,
    urgentBottles,
    readySharePct: totalBottles > 0 ? Math.round((readyBottles / totalBottles) * 100) : 0,
    agingSharePct: totalBottles > 0 ? Math.round((agingBottles / totalBottles) * 100) : 0,
    urgentSharePct: totalBottles > 0 ? Math.round((urgentBottles / totalBottles) * 100) : 0,
    urgentCostHT: round2(urgentCostHT),
    urgentMenuTTC: round2(urgentMenuTTC),
    byVintage,
    cohorts,
    verticals,
  };
}

export interface SiteActivityRow {
  site: Site;
  stockBottles: number;
  stockRefs: number;
  stockCostHT: number;
  stockMenuTTC: number;
  servedBottles: number; // vente + consommation + verre
  glassBottles: number; // dont service au verre
  lossBottles: number; // casse, bouchonné, offert, dégustation
  transfersIn: number; // bouteilles reçues d'un autre site (ex. Cave centrale -> Bistrot)
  transfersOut: number; // bouteilles envoyées vers un autre site
  revenueHT: number; // CA HT estimé des sorties servies
  cogsHT: number; // coût d'achat HT des bouteilles servies
  lossCostHT: number; // coût d'achat HT des pertes/offerts
  marginHT: number; // marge nette HT
  markRatePct: number | null; // % taux de marque (marginHT / revenueHT * 100)
  costRatioPct: number | null; // % coût matière F&B (cogsHT / revenueHT * 100)
}

/**
 * Consolidation multi-sites (ex. Cave de garde, Table Gastronomique, Bistrot, Bar & Caveau)
 * sur une fenêtre temporelle donnée (30j, 90j, 365j).
 */
export function computeSiteActivity(
  sites: Site[],
  wines: Wine[],
  stock: StockLevel[],
  movements: Movement[],
  opts?: { days?: number; now?: number; vatRate?: number },
): SiteActivityRow[] {
  const days = opts?.days ?? 365;
  const now = opts?.now ?? Date.now();
  const vatRate = opts?.vatRate ?? 20;
  const cutoffIso = new Date(now - days * 86_400_000).toISOString().slice(0, 10);
  const byId = new Map(wines.filter((w) => !w.isArchived).map((w) => [w.id, w]));

  const rows = new Map<string, SiteActivityRow>();
  for (const s of sites) {
    if (s.isArchived) continue;
    rows.set(s.id, {
      site: s,
      stockBottles: 0,
      stockRefs: 0,
      stockCostHT: 0,
      stockMenuTTC: 0,
      servedBottles: 0,
      glassBottles: 0,
      lossBottles: 0,
      transfersIn: 0,
      transfersOut: 0,
      revenueHT: 0,
      cogsHT: 0,
      lossCostHT: 0,
      marginHT: 0,
      markRatePct: null,
      costRatioPct: null,
    });
  }

  for (const lvl of stock) {
    if (lvl.qty <= 0) continue;
    const r = rows.get(lvl.siteId);
    const w = byId.get(lvl.wineId);
    if (!r || !w) continue;
    const unitCost = w.buyPriceHT ?? 0;
    const unitMenuTTC = lvl.menuPriceTTC ?? w.menuPriceTTC ?? (w.sellPriceHT ? round2(w.sellPriceHT * (1 + vatRate / 100)) : 0);
    r.stockBottles += lvl.qty;
    r.stockRefs += 1;
    r.stockCostHT += lvl.qty * unitCost;
    r.stockMenuTTC += lvl.qty * unitMenuTTC;
  }

  for (const m of movements) {
    if (m.date < cutoffIso) continue;
    const w = byId.get(m.wineId);
    const unitCost = m.unitCostHT ?? w?.buyPriceHT ?? 0;
    const unitMenuTTC = w?.menuPriceTTC ?? (w?.sellPriceHT ? round2(w.sellPriceHT * (1 + vatRate / 100)) : 0);
    const unitSellHT = m.unitPriceHT ?? (unitMenuTTC > 0 ? htFromTtc(unitMenuTTC, vatRate) : (w?.sellPriceHT ?? 0));

    if (m.type === 'transfer') {
      const fromRow = rows.get(m.siteId);
      if (fromRow) fromRow.transfersOut += m.qty;
      if (m.toSiteId) {
        const toRow = rows.get(m.toSiteId);
        if (toRow) toRow.transfersIn += m.qty;
      }
      continue;
    }

    if (m.type !== 'out') continue;
    const r = rows.get(m.siteId);
    if (!r) continue;

    if (SERVED_REASONS.has(m.reason)) {
      r.servedBottles += m.qty;
      if (m.reason === 'verre') r.glassBottles += m.qty;
      r.revenueHT += m.qty * unitSellHT;
      r.cogsHT += m.qty * unitCost;
    } else {
      r.lossBottles += m.qty;
      r.lossCostHT += m.qty * unitCost;
    }
  }

  return [...rows.values()].map((r) => {
    const stockCostHT = round2(r.stockCostHT);
    const stockMenuTTC = round2(r.stockMenuTTC);
    const revenueHT = round2(r.revenueHT);
    const cogsHT = round2(r.cogsHT);
    const lossCostHT = round2(r.lossCostHT);
    const marginHT = round2(revenueHT - cogsHT);
    const markRatePct = revenueHT > 0 ? Math.round((marginHT / revenueHT) * 1000) / 10 : null;
    const costRatioPct = revenueHT > 0 ? Math.round((cogsHT / revenueHT) * 1000) / 10 : null;
    return {
      ...r,
      stockCostHT,
      stockMenuTTC,
      revenueHT,
      cogsHT,
      lossCostHT,
      marginHT,
      markRatePct,
      costRatioPct,
    };
  });
}
