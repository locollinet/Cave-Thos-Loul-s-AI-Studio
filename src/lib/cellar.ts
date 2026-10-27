import type { CellarRack, RareBottle, StockLevel, Wine } from '@/types';
import { norm } from './wine';

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

  // Si aucun bin détecté, créer au moins un casier de démonstration
  if (!prefixes.size) {
    prefixes.add('A');
    prefixes.add('B');
  }

  const sorted = Array.from(prefixes).sort();
  return sorted.map((p, idx) => {
    const maxNum = maxNumByPrefix.get(p) ?? 24;
    // Dimensionner intelligemment la grille : 6 colonnes par défaut
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
  const visibleStock = stock.filter((s) => (activeSiteId === 'all' || s.siteId === activeSiteId) && (rack.siteId === 'all' || s.siteId === rack.siteId));

  // Indexer le stock par bin normalisé (ex: "A1", "A2")
  const stockByBin = new Map<string, StockLevel[]>();
  for (const s of visibleStock) {
    if (!s.bin) continue;
    const clean = s.bin.trim().toUpperCase().replace(/\s+/g, '');
    const arr = stockByBin.get(clean) ?? [];
    arr.push(s);
    stockByBin.set(clean, arr);
  }

  // Indexer les flacons rares par bin
  const bottlesByBin = new Map<string, RareBottle[]>();
  for (const b of rareBottles) {
    if (!b.bin || b.status !== 'in_cellar') continue;
    const clean = b.bin.trim().toUpperCase().replace(/\s+/g, '');
    const arr = bottlesByBin.get(clean) ?? [];
    arr.push(b);
    bottlesByBin.set(clean, arr);
  }

  const matrix: CellarSlotCell[][] = [];

  for (let r = 0; r < rack.rows; r++) {
    const rowCells: CellarSlotCell[] = [];
    for (let c = 0; c < rack.cols; c++) {
      const binCode = formatBinCode(rack.prefix, r, c, rack.cols);
      const levels = stockByBin.get(binCode) ?? [];
      const bottles = bottlesByBin.get(binCode) ?? [];

      const slotWines = levels
        .map((lvl) => {
          const wine = winesById.get(lvl.wineId);
          if (!wine || lvl.qty <= 0) return null;
          return { wine, qty: lvl.qty, stockLevelId: lvl.id };
        })
        .filter((w): w is NonNullable<typeof w> => w !== null);

      const totalQty = slotWines.reduce((sum, item) => sum + item.qty, 0);

      rowCells.push({
        rackId: rack.id,
        rackPrefix: rack.prefix,
        row: r,
        col: c,
        binCode,
        label: `Rangée ${r + 1}, Alvéole ${c + 1}`,
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

/** Statistiques d'un casier */
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

/** Recherche dans les alvéoles (par producteur, nom, millésime, appellation ou cépage) */
export function matchesSlotQuery(cell: CellarSlotCell, query: string): boolean {
  if (!query.trim()) return true;
  const q = norm(query);

  // Recherche sur le code d'alvéole lui-même (ex: "A4")
  if (norm(cell.binCode).includes(q)) return true;

  return cell.wines.some(({ wine }) => {
    const haystack = norm(`${wine.producer} ${wine.name} ${wine.vintage} ${wine.region ?? ''} ${wine.grapes ?? ''} ${wine.appellation ?? ''}`);
    return haystack.includes(q);
  });
}
