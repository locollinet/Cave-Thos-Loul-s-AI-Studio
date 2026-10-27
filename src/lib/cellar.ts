import type { CellarRack, RackGeometry, Site, StockLevel, Wine } from '@/types';

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
  if (rack.geometry === 'matrix') {
    const perLevel = rack.cols * (rack.doubleDepth ? 2 : 1);
    return Math.max(1, rack.rows * perLevel);
  }
  if (rack.geometry === 'staggered_shelf') {
    const l1 = rack.cols;
    const l2 = rack.staggered ? Math.max(0, rack.cols - 1) : 0;
    const perShelf = (l1 + l2) * (rack.doubleDepth ? 2 : 1);
    return Math.max(1, rack.rows * perShelf);
  }
  if (rack.geometry === 'bulk') {
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
  if (rack.geometry === 'matrix' && !rack.doubleDepth) {
    // Si simple préfixe A et matrice compacte, ex: A1, A2 ou A-R1-C2
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
  const rowName = rack.geometry === 'staggered_shelf' ? `Clayette ${row}` : `Niveau ${row}`;
  const posName = layer === 2 ? `Quinconce ${col}` : `Place ${col}`;
  const depthName = rack.doubleDepth ? (depth === 'back' ? ' (Arrière)' : ' (Avant)') : '';
  return `${rowName} · ${posName}${depthName}`;
}

/** Génère tous les slots théoriques d'un meuble. */
export function generateRackSlots(rack: CellarRack): CellarSlot[] {
  const slots: CellarSlot[] = [];
  const depths: ('front' | 'back')[] = rack.doubleDepth ? ['front', 'back'] : ['front'];

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
      if (rack.staggered && rack.geometry === 'staggered_shelf' && rack.cols > 1) {
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

/** Normalise un code bin pour une comparaison tolérante (insensible casse et tirets). */
export function normalizeBin(bin?: string): string {
  if (!bin) return '';
  return bin.trim().toUpperCase().replace(/[\s_]/g, '-');
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
 * Construit la cartographie d'occupation précise d'un meuble.
 * Règle d'or : dans un meuble à alvéoles (matrix ou staggered_shelf), 1 alvéole = 1 bouteille.
 * Si le stock possède une liste explicite bins[], chaque alvéole correspondante est occupée par 1 bouteille.
 * Si le stock possède seulement un bin d'origine (ex: "ARM-R1-C1-AV" avec 18 bouteilles),
 * les bouteilles sont réparties consécutivement (1 bouteille par place) à partir de cet emplacement.
 */
export function buildRackOccupancyMap(
  rack: CellarRack,
  siteStock: StockLevel[],
  winesById: Map<string, Wine>,
): Map<string, SlotMatch> {
  const slots = generateRackSlots(rack);
  const normToSlot = new Map(slots.map((s) => [normalizeBin(s.code), s]));
  const occupancy = new Map<string, SlotMatch>();
  const isBulk = rack.geometry === 'bulk';
  const p = (rack.prefix || '').trim().toUpperCase();

  // Filtrer les stocks pertinents du site
  const validStock = siteStock.filter((s) => s.qty > 0 && winesById.has(s.wineId));

  // 1. Passage prioritaire : les stocks avec des alvéoles précises assignées (bins[])
  for (const s of validStock) {
    if (!s.bins || s.bins.length === 0) continue;
    const wine = winesById.get(s.wineId)!;
    let idx = 0;
    for (const b of s.bins) {
      const norm = normalizeBin(b);
      if (normToSlot.has(norm) && !occupancy.has(norm)) {
        idx++;
        occupancy.set(norm, {
          stockLevel: s,
          wine,
          bottleIndex: idx,
          totalInRack: 0,
          slotBottleCount: 1,
        });
      }
    }
  }

  // 2. Passage secondaire : stock avec bin unique ou compact (support rétro-compatible & répartition 1 par 1)
  for (const s of validStock) {
    if (s.bins && s.bins.length > 0) continue;
    if (!s.bin) continue;
    const wine = winesById.get(s.wineId)!;
    const normBin = normalizeBin(s.bin);

    // Recherche de l'emplacement initial dans ce meuble
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
        // En vrac (zone palettes / caisses), un emplacement unique peut contenir plusieurs bouteilles
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
        // Meuble unitaire (armoire EuroCave ou casier alvéolé) : 1 BOUTEILLE = 1 ALVÉOLE
        // On alloue jusqu'à s.qty alvéoles libres consécutives à partir de startIdx
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
        // Si besoin de boucler pour placer le reste sur le meuble
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
  // 1. Depuis le slot de départ jusqu'à la fin du meuble
  for (let i = startIdx; i < allSlots.length && found.length < count; i++) {
    const s = allSlots[i];
    if (!occupancyMap.has(normalizeBin(s.code))) {
      found.push(s);
    }
  }
  // 2. Si besoin de compléter, boucle depuis le début
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

/**
 * Rapproche un slot avec le vin stocké.
 * Supporte le passage d'une occupancyMap pré-calculée pour performance O(1).
 */
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
