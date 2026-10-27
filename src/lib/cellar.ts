import type { CellarRack, RackGeometry, RareBottle, Site, StockLevel, Wine } from '@/types';
import { norm } from './wine';

/* ------------------------------------------------------------------ 1. Modèle alvéolaire précis (EuroCave / Casier / Rayonnage / Vrac) */

export interface CellarSlot {
  code: string; // coordonnée normalisée ex: "ARM-C2-03-AV" ou "A-R1-C2" ou "A1"
  rackId: string;
  row: number; // 1-indexed (étage / clayette)
  col: number; // 1-indexed (position)
  layer: 1 | 2; // 1 = rang inférieur, 2 = rang supérieur quinconce
  depth: 'front' | 'back';
  label: string; // affichage lisible ex: "Clayette 2 · Av. 3"
}

export interface CellarRackPreset {
  id: string;
  name: string;
  desc: string;
  geometry: RackGeometry;
  rows: number;
  cols: number;
  doubleDepth: boolean;
  staggered: boolean;
  defaultPrefix: string;
}

export const RACK_PRESETS: CellarRackPreset[] = [
  {
    id: 'eurocave',
    name: 'Armoire de Vieillissement',
    desc: 'Clayettes coulissantes avec empilement en quinconce et double profondeur avant / arrière (style EuroCave, Liebherr).',
    geometry: 'staggered_shelf',
    rows: 5,
    cols: 6,
    doubleDepth: true,
    staggered: true,
    defaultPrefix: 'ARM',
  },
  {
    id: 'matrix_wood',
    name: 'Casier Alvéolaire Classique',
    desc: 'Casier en bois ou métal avec alvéoles régulières (colonnes × niveaux alignés).',
    geometry: 'matrix',
    rows: 4,
    cols: 6,
    doubleDepth: false,
    staggered: false,
    defaultPrefix: 'A',
  },
  {
    id: 'linear_shelf',
    name: 'Étagère Murale / Rayonnage',
    desc: 'Rayonnage droit linéaire simple, idéal pour la réserve ou la boutique.',
    geometry: 'matrix',
    rows: 3,
    cols: 8,
    doubleDepth: false,
    staggered: false,
    defaultPrefix: 'ETG',
  },
  {
    id: 'bulk_zone',
    name: 'Zone Caisses & Palettes (Vrac)',
    desc: 'Emplacement de stockage au sol pour cartons entiers et caisses bois.',
    geometry: 'bulk',
    rows: 2,
    cols: 4,
    doubleDepth: false,
    staggered: false,
    defaultPrefix: 'VRAC',
  },
];

/** Calcule la capacité totale théorique en bouteilles d'un meuble. */
export function getRackCapacity(rack: CellarRack): number {
  const geometry = rack.geometry || 'matrix';
  if (geometry === 'matrix') {
    const perLevel = rack.cols * (rack.doubleDepth ? 2 : 1);
    return Math.max(1, rack.rows * perLevel);
  }
  if (geometry === 'staggered_shelf') {
    const l1 = rack.cols;
    const l2 = rack.staggered ? Math.max(0, rack.cols - 1) : 0;
    const perShelf = (l1 + l2) * (rack.doubleDepth ? 2 : 1);
    return Math.max(1, rack.rows * perShelf);
  }
  if (geometry === 'bulk') {
    return Math.max(1, rack.rows * rack.cols * 6); // 6 bouteilles par caisse standard
  }
  return rack.rows * rack.cols;
}

/** Formate le code d'emplacement standard pour une alvéole. */
export function buildSlotCode(
  rack: CellarRack,
  row: number,
  col: number,
  depth: 'front' | 'back' = 'front',
  layer: 1 | 2 = 1,
): string {
  const p = (rack.prefix || rack.name.slice(0, 3)).trim().toUpperCase();
  const geometry = rack.geometry || 'matrix';
  if (geometry === 'matrix' && !rack.doubleDepth) {
    return `${p}-R${row}-C${col}`;
  }
  const depthSuffix = depth === 'back' ? '-AR' : rack.doubleDepth ? '-AV' : '';
  const layerSuffix = layer === 2 ? '-Q' : '';
  return `${p}-R${row}-C${col}${layerSuffix}${depthSuffix}`;
}

/** Formate un libellé clair pour l'humain. */
export function formatSlotLabel(
  rack: CellarRack,
  row: number,
  col: number,
  depth: 'front' | 'back' = 'front',
  layer: 1 | 2 = 1,
): string {
  const geometry = rack.geometry || 'matrix';
  const rowName = geometry === 'staggered_shelf' ? `Clayette ${row}` : `Niveau ${row}`;
  const posName = layer === 2 ? `Quinconce ${col}` : `Place ${col}`;
  const depthName = rack.doubleDepth ? (depth === 'back' ? ' (Arrière)' : ' (Avant)') : '';
  return `${rowName} · ${posName}${depthName}`;
}

/** Génère tous les slots théoriques d'un meuble. */
export function generateRackSlots(rack: CellarRack): CellarSlot[] {
  const slots: CellarSlot[] = [];
  const depths: ('front' | 'back')[] = rack.doubleDepth ? ['front', 'back'] : ['front'];
  const geometry = rack.geometry || 'matrix';

  for (let r = 1; r <= rack.rows; r++) {
    for (const d of depths) {
      // Rang 1 (base)
      for (let c = 1; c <= rack.cols; c++) {
        slots.push({
          code: buildSlotCode(rack, r, c, d, 1),
          rackId: rack.id,
          row: r,
          col: c,
          layer: 1,
          depth: d,
          label: formatSlotLabel(rack, r, c, d, 1),
        });
      }
      // Rang 2 (quinconce : 1 bouteille de moins imbriquée dans les creux)
      if (rack.staggered && geometry === 'staggered_shelf' && rack.cols > 1) {
        for (let c = 1; c <= rack.cols - 1; c++) {
          slots.push({
            code: buildSlotCode(rack, r, c, d, 2),
            rackId: rack.id,
            row: r,
            col: c,
            layer: 2,
            depth: d,
            label: formatSlotLabel(rack, r, c, d, 2),
          });
        }
      }
    }
  }

  return slots;
}

/** Nettoie et normalise une chaîne de bin pour comparaison insensible à la casse et aux séparateurs. */
export function normalizeBin(bin?: string | null): string {
  if (!bin) return '';
  return bin
    .trim()
    .toUpperCase()
    .replace(/[\s_.]+/g, '-');
}

export interface SlotMatch {
  stockLevel: StockLevel;
  wine: Wine;
  bottleIndex?: number; // index de la bouteille dans ce meuble (ex: 3 sur 18)
  totalInRack?: number; // total de bouteilles de ce vin dans ce meuble
  slotBottleCount: number; // 1 pour alvéole unitaire, N pour casier de vrac
}

/** Formate un libellé résumé des emplacements pour l'affichage synthétique. */
export function formatBinSummary(bins: string[]): string {
  if (!bins || bins.length === 0) return '';
  if (bins.length === 1) return bins[0];
  const first = bins[0];
  const prefix = first.split('-')[0] || '';
  if (prefix) {
    return `${prefix} · ${bins.length} btl`;
  }
  return `${first} (+${bins.length - 1})`;
}

/**
 * Construit la cartographie complète de l'occupation d'un meuble.
 */
export function buildRackOccupancyMap(
  rack: CellarRack,
  siteStock: StockLevel[],
  winesById: Map<string, Wine>,
): Map<string, SlotMatch> {
  const occupancy = new Map<string, SlotMatch>();
  const slots = generateRackSlots(rack);
  const p = rack.prefix ? rack.prefix.trim().toUpperCase() : '';
  const isBulk = rack.geometry === 'bulk';

  // 1. D'abord les attributions unitaires explicites (bins[])
  for (const s of siteStock) {
    if (s.qty <= 0 || !winesById.has(s.wineId)) continue;
    const wine = winesById.get(s.wineId)!;

    if (Array.isArray(s.bins) && s.bins.length > 0) {
      let bIdx = 1;
      for (const rawBin of s.bins) {
        const normBin = normalizeBin(rawBin);
        const existsInRack = slots.some((sl) => normalizeBin(sl.code) === normBin);
        if (existsInRack && !occupancy.has(normBin)) {
          occupancy.set(normBin, {
            stockLevel: s,
            wine,
            bottleIndex: bIdx++,
            totalInRack: 0,
            slotBottleCount: 1,
          });
        }
      }
    }
  }

  // 2. Ensuite les stocks qui ont un bin générique ou un point de départ
  for (const s of siteStock) {
    if (s.qty <= 0 || !winesById.has(s.wineId) || !s.bin) continue;
    const wine = winesById.get(s.wineId)!;
    const normBin = normalizeBin(s.bin);

    let startIdx = slots.findIndex((sl) => normalizeBin(sl.code) === normBin);
    if (startIdx === -1 && p) {
      startIdx = slots.findIndex((sl) => {
        if (sl.layer !== 1 || sl.depth !== 'front') return false;
        const compactCode = `${p}${sl.col + (sl.row - 1) * rack.cols}`;
        const directRowCol = `${p}${sl.row}-${sl.col}`;
        return normBin === compactCode || normBin === directRowCol;
      });
    }

    if (startIdx !== -1) {
      if (isBulk) {
        const code = normalizeBin(slots[startIdx].code);
        if (!occupancy.has(code)) {
          occupancy.set(code, {
            stockLevel: s,
            wine,
            bottleIndex: 1,
            totalInRack: s.qty,
            slotBottleCount: s.qty,
          });
        }
      } else {
        let placed = 0;
        const toPlace = Math.max(1, s.qty);

        for (let i = startIdx; i < slots.length && placed < toPlace; i++) {
          const code = normalizeBin(slots[i].code);
          if (!occupancy.has(code)) {
            placed++;
            occupancy.set(code, {
              stockLevel: s,
              wine,
              bottleIndex: placed,
              totalInRack: 0,
              slotBottleCount: 1,
            });
          }
        }
        if (placed < toPlace) {
          for (let i = 0; i < startIdx && placed < toPlace; i++) {
            const code = normalizeBin(slots[i].code);
            if (!occupancy.has(code)) {
              placed++;
              occupancy.set(code, {
                stockLevel: s,
                wine,
                bottleIndex: placed,
                totalInRack: 0,
                slotBottleCount: 1,
              });
            }
          }
        }
      }
    }
  }

  // 3. Calculer totalInRack pour chaque vin présent dans ce meuble
  const countByWineId = new Map<string, number>();
  for (const m of occupancy.values()) {
    countByWineId.set(m.wine.id, (countByWineId.get(m.wine.id) ?? 0) + m.slotBottleCount);
  }
  for (const m of occupancy.values()) {
    m.totalInRack = countByWineId.get(m.wine.id) ?? m.slotBottleCount;
  }

  return occupancy;
}

/** Recherche les N prochaines alvéoles libres à partir d'un slot de départ. */
export function findConsecutiveFreeSlots(
  startSlot: CellarSlot,
  rack: CellarRack,
  count: number,
  occupancyMap: Map<string, SlotMatch>,
): CellarSlot[] {
  const allSlots = generateRackSlots(rack);
  const startIdx = allSlots.findIndex((s) => s.code === startSlot.code);
  if (startIdx === -1) return [];

  const found: CellarSlot[] = [];
  for (let i = startIdx; i < allSlots.length && found.length < count; i++) {
    const s = allSlots[i];
    if (!occupancyMap.has(normalizeBin(s.code))) {
      found.push(s);
    }
  }
  if (found.length < count) {
    for (let i = 0; i < startIdx && found.length < count; i++) {
      const s = allSlots[i];
      if (!occupancyMap.has(normalizeBin(s.code))) {
        found.push(s);
      }
    }
  }
  return found;
}

/** Rapproche un slot avec le vin stocké. */
export function matchSlotToStock(
  slot: CellarSlot,
  rack: CellarRack,
  siteStock: StockLevel[],
  winesById: Map<string, Wine>,
  occupancyMap?: Map<string, SlotMatch>,
): SlotMatch | undefined {
  if (occupancyMap) {
    return occupancyMap.get(normalizeBin(slot.code));
  }
  const map = buildRackOccupancyMap(rack, siteStock, winesById);
  return map.get(normalizeBin(slot.code));
}

/** Statistiques d'occupation d'un meuble. */
export function computeRackStats(
  rack: CellarRack,
  siteStock: StockLevel[],
  winesById: Map<string, Wine>,
): {
  capacity: number;
  occupiedSlots: number;
  totalBottles: number;
  fillingRate: number;
} {
  const map = buildRackOccupancyMap(rack, siteStock, winesById);
  const capacity = getRackCapacity(rack);
  const occupiedSlots = map.size;
  let totalBottles = 0;
  for (const m of map.values()) {
    totalBottles += m.slotBottleCount;
  }
  const fillingRate = capacity > 0 ? Math.min(100, Math.round((occupiedSlots / capacity) * 100)) : 0;

  return { capacity, occupiedSlots, totalBottles, fillingRate };
}

/* ------------------------------------------------------------------ 2. Modèle Cartographie 2D & 3D Interactive (Prestige Edition) */

export interface CellarSlotCell {
  rackId: string;
  rackPrefix: string;
  row: number; // 0-indexed (0 à rows-1)
  col: number; // 0-indexed (0 à cols-1)
  binCode: string; // ex: "A1"
  label: string;
  wines: {
    wine: Wine;
    qty: number;
    stockLevelId: string;
  }[];
  bottles: RareBottle[];
  totalQty: number;
  isOccupied: boolean;
}

/** Formate le code d'alvéole standard : A1, B3, C12... */
export function formatBinCode(prefix: string, row: number, col: number, cols: number): string {
  const num = row * cols + (col + 1);
  return `${prefix.toUpperCase()}${num}`;
}

/** Analyse un code d'alvéole pour en déduire le préfixe et le numéro (ex: "A4" -> { prefix: "A", num: 4 }) */
export function parseBinCode(bin?: string | null): { prefix: string; num: number } | null {
  if (!bin) return null;
  const clean = bin.trim().toUpperCase();
  const m = clean.match(/^([A-Z]+)\s*[-_.]?\s*(\d+)$/);
  if (!m) return null;
  return { prefix: m[1], num: Number(m[2]) };
}

/** Construit des casiers par défaut à partir des bins existants du stock s'il n'y a aucun casier défini */
export function inferDefaultRacks(stock: StockLevel[], activeSiteId: string): CellarRack[] {
  const visibleStock = activeSiteId === 'all' ? stock : stock.filter((s) => s.siteId === activeSiteId);
  const prefixes = new Set<string>();
  const maxNumByPrefix = new Map<string, number>();

  for (const s of visibleStock) {
    const parsed = parseBinCode(s.bin);
    if (parsed) {
      prefixes.add(parsed.prefix);
      const curr = maxNumByPrefix.get(parsed.prefix) ?? 0;
      if (parsed.num > curr) maxNumByPrefix.set(parsed.prefix, parsed.num);
    }
  }

  if (!prefixes.size) {
    prefixes.add('A');
    prefixes.add('B');
  }

  const sorted = Array.from(prefixes).sort();
  return sorted.map((p, idx) => {
    const maxNum = maxNumByPrefix.get(p) ?? 24;
    const cols = 6;
    const rows = Math.max(4, Math.ceil(maxNum / cols));
    return {
      id: `inferred_rack_${p.toLowerCase()}`,
      siteId: activeSiteId === 'all' ? (visibleStock[0]?.siteId ?? 'main') : activeSiteId,
      name: `Casier ${p} — ${idx === 0 ? 'Bourgogne & Vallée du Rhône' : idx === 1 ? 'Bordeaux & Grands Crus' : 'Sélection de Garde'}`,
      prefix: p,
      rows,
      cols,
      zone: idx === 0 ? 'Cave voûtée centrale' : 'Cave de vieillissement',
      temperatureC: 12.5,
      humidityPct: 74,
      createdAt: Date.now(),
    };
  });
}

/** Génère la matrice 2D des alvéoles pour un casier donné */
export function buildRackMatrix(
  rack: CellarRack,
  stock: StockLevel[],
  wines: Wine[],
  rareBottles: RareBottle[] = [],
  activeSiteId = 'all',
): CellarSlotCell[][] {
  const winesById = new Map<string, Wine>(wines.map((w) => [w.id, w]));
  const visibleStock = stock.filter(
    (s) => (activeSiteId === 'all' || s.siteId === activeSiteId) && (!rack.siteId || rack.siteId === 'all' || s.siteId === rack.siteId),
  );

  const stockByBin = new Map<string, StockLevel[]>();
  for (const s of visibleStock) {
    if (!s.bin) continue;
    const clean = s.bin.trim().toUpperCase().replace(/\s+/g, '');
    const arr = stockByBin.get(clean) ?? [];
    arr.push(s);
    stockByBin.set(clean, arr);
  }

  const bottlesByBin = new Map<string, RareBottle[]>();
  for (const b of rareBottles) {
    if (!b.bin || b.status !== 'in_cellar') continue;
    const clean = b.bin.trim().toUpperCase().replace(/\s+/g, '');
    const arr = bottlesByBin.get(clean) ?? [];
    arr.push(b);
    bottlesByBin.set(clean, arr);
  }

  const matrix: CellarSlotCell[][] = [];
  const p = (rack.prefix || rack.name.slice(0, 1) || 'A').toUpperCase();

  for (let r = 0; r < rack.rows; r++) {
    const rowCells: CellarSlotCell[] = [];
    for (let c = 0; c < rack.cols; c++) {
      const binCode = formatBinCode(p, r, c, rack.cols);
      const levels = stockByBin.get(binCode) ?? [];
      const bottles = bottlesByBin.get(binCode) ?? [];

      const slotWines = levels
        .map((lvl) => {
          const wine = winesById.get(lvl.wineId);
          if (!wine || lvl.qty <= 0) return null;
          return { wine, qty: lvl.qty, stockLevelId: lvl.id };
        })
        .filter((item): item is { wine: Wine; qty: number; stockLevelId: string } => item !== null);

      const totalQty = slotWines.reduce((sum, item) => sum + item.qty, 0);

      rowCells.push({
        rackId: rack.id,
        rackPrefix: p,
        row: r,
        col: c,
        binCode,
        label: `${binCode} (Niveau ${r + 1}, Col ${c + 1})`,
        wines: slotWines,
        bottles,
        totalQty,
        isOccupied: totalQty > 0 || bottles.length > 0,
      });
    }
    matrix.push(rowCells);
  }

  return matrix;
}

/** Calcule les métriques globales d'un casier 2D */
export function calculateRackStats(matrix: CellarSlotCell[][]): {
  totalSlots: number;
  occupiedSlots: number;
  emptySlots: number;
  totalBottles: number;
  fillPct: number;
} {
  let totalSlots = 0;
  let occupiedSlots = 0;
  let totalBottles = 0;

  for (const row of matrix) {
    for (const cell of row) {
      totalSlots++;
      if (cell.isOccupied) {
        occupiedSlots++;
        totalBottles += cell.totalQty;
      }
    }
  }

  const fillPct = totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0;
  return {
    totalSlots,
    occupiedSlots,
    emptySlots: totalSlots - occupiedSlots,
    totalBottles,
    fillPct,
  };
}

/** Recherche multi-critères sur une alvéole (nom du domaine, cuvée, millésime, appellation, numéro bouteille) */
export function matchesSlotQuery(slot: CellarSlotCell, query: string): boolean {
  if (!query.trim()) return true;
  const q = norm(query);

  if (norm(slot.binCode).includes(q)) return true;

  for (const item of slot.wines) {
    const w = item.wine;
    if (
      norm(w.producer).includes(q) ||
      norm(w.name).includes(q) ||
      norm(w.appellation ?? '').includes(q) ||
      norm(w.cuvee ?? '').includes(q) ||
      w.vintage.includes(q) ||
      norm(w.region ?? '').includes(q)
    ) {
      return true;
    }
  }

  for (const b of slot.bottles) {
    if (b.bottleNumber.toLowerCase().includes(q)) return true;
  }

  return false;
}
