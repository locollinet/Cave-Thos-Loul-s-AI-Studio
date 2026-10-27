import { describe, expect, it } from 'vitest';
import type { CellarRack, StockLevel, Wine } from '@/types';
import {
  buildRackMatrix,
  buildSlotCode,
  calculateRackStats,
  computeRackStats,
  formatBinCode,
  formatSlotLabel,
  generateRackSlots,
  getRackCapacity,
  inferDefaultRacks,
  matchesSlotQuery,
  matchSlotToStock,
  parseBinCode,
} from '@/lib/cellar';

describe('Cellar Cartography Logic (2D & 3D Matrix)', () => {
  it('formats and parses bin codes correctly', () => {
    expect(formatBinCode('A', 0, 0, 6)).toBe('A1');
    expect(formatBinCode('A', 0, 5, 6)).toBe('A6');
    expect(formatBinCode('A', 1, 0, 6)).toBe('A7');
    expect(formatBinCode('B', 3, 2, 6)).toBe('B21');

    expect(parseBinCode('A1')).toEqual({ prefix: 'A', num: 1 });
    expect(parseBinCode('B-12')).toEqual({ prefix: 'B', num: 12 });
    expect(parseBinCode('c.04')).toEqual({ prefix: 'C', num: 4 });
    expect(parseBinCode('invalid')).toBeNull();
    expect(parseBinCode('')).toBeNull();
  });

  it('infers default racks from stock bins', () => {
    const stock: StockLevel[] = [
      { id: '1', wineId: 'w1', siteId: 'site1', qty: 6, bin: 'A1', updatedAt: 1 },
      { id: '2', wineId: 'w2', siteId: 'site1', qty: 3, bin: 'A12', updatedAt: 1 },
      { id: '3', wineId: 'w3', siteId: 'site1', qty: 12, bin: 'B4', updatedAt: 1 },
    ];
    const racks = inferDefaultRacks(stock, 'site1');
    expect(racks.length).toBe(2);
    expect(racks.map((r) => r.prefix)).toEqual(['A', 'B']);
    expect(racks[0].cols).toBe(6);
    expect(racks[0].rows).toBeGreaterThanOrEqual(2);
  });

  it('builds a 2D rack matrix and maps wines into slots', () => {
    const rack: CellarRack = {
      id: 'rack_a',
      siteId: 'site1',
      name: 'Casier A',
      prefix: 'A',
      rows: 2,
      cols: 3,
      createdAt: 1,
    };
    const wines: Wine[] = [
      {
        id: 'w1',
        producer: 'Domaine Leflaive',
        name: 'Puligny-Montrachet',
        vintage: '2020',
        color: 'blanc',
        formatCl: 75,
        alertThreshold: 2,
        canonicalKey: 'leflaive__puligny__2020__blanc__75',
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const stock: StockLevel[] = [
      { id: 's1', wineId: 'w1', siteId: 'site1', qty: 6, bin: 'A2', updatedAt: 1 },
    ];

    const matrix = buildRackMatrix(rack, stock, wines, [], 'site1');
    expect(matrix.length).toBe(2);
    expect(matrix[0].length).toBe(3);

    // Alvéole A1 (row 0, col 0) est vide
    expect(matrix[0][0].binCode).toBe('A1');
    expect(matrix[0][0].isOccupied).toBe(false);

    // Alvéole A2 (row 0, col 1) contient le Puligny-Montrachet
    expect(matrix[0][1].binCode).toBe('A2');
    expect(matrix[0][1].isOccupied).toBe(true);
    expect(matrix[0][1].wines[0].wine.producer).toBe('Domaine Leflaive');
    expect(matrix[0][1].totalQty).toBe(6);

    const stats = calculateRackStats(matrix);
    expect(stats.totalSlots).toBe(6);
    expect(stats.occupiedSlots).toBe(1);
    expect(stats.emptySlots).toBe(5);
    expect(stats.totalBottles).toBe(6);
    expect(stats.fillPct).toBe(17);

    // Test de recherche
    expect(matchesSlotQuery(matrix[0][1], 'Leflaive')).toBe(true);
    expect(matchesSlotQuery(matrix[0][1], 'Montrachet')).toBe(true);
    expect(matchesSlotQuery(matrix[0][1], 'A2')).toBe(true);
    expect(matchesSlotQuery(matrix[0][1], 'Bordeaux')).toBe(false);
  });
});

describe('Cellar Rack Geometry & Capacity (EuroCave & Staggered Shelves)', () => {
  it('computes regular matrix capacity correctly', () => {
    const rack: CellarRack = {
      id: 'matrix-1',
      name: 'Casier Bois',
      geometry: 'matrix',
      rows: 4,
      cols: 6,
      doubleDepth: false,
    };
    expect(getRackCapacity(rack)).toBe(24);
  });

  it('computes staggered shelf capacity with quincunx and double depth', () => {
    // 5 clayettes, 6 bouteilles de front
    // Rang 1 (base): 6 bouteilles
    // Rang 2 (quinconce): 5 bouteilles
    // Total par niveau = 11. Avec double profondeur (avant + arrière) = 22 par clayette.
    // Pour 5 clayettes = 110 bouteilles.
    const eurocave: CellarRack = {
      id: 'eurocave-1',
      name: 'Armoire EuroCave',
      geometry: 'staggered_shelf',
      rows: 5,
      cols: 6,
      staggered: true,
      doubleDepth: true,
    };
    expect(getRackCapacity(eurocave)).toBe(110);
  });

  it('generates correct slot codes and human-readable labels', () => {
    const rack: CellarRack = {
      id: 'arm-1',
      name: 'Armoire 1',
      prefix: 'ARM',
      geometry: 'staggered_shelf',
      rows: 3,
      cols: 4,
      staggered: true,
      doubleDepth: true,
    };

    const slots = generateRackSlots(rack);
    // 3 rows * 2 depths (front, back) * (4 base + 3 quinconce = 7) = 42 slots
    expect(slots.length).toBe(42);

    const slotAvBase = slots.find((s) => s.row === 1 && s.col === 2 && s.layer === 1 && s.depth === 'front');
    expect(slotAvBase?.code).toBe('ARM-R1-C2-AV');
    expect(slotAvBase?.label).toBe('Clayette 1 · Place 2 (Avant)');

    const slotArQuinconce = slots.find((s) => s.row === 2 && s.col === 1 && s.layer === 2 && s.depth === 'back');
    expect(slotArQuinconce?.code).toBe('ARM-R2-C1-Q-AR');
    expect(slotArQuinconce?.label).toBe('Clayette 2 · Quinconce 1 (Arrière)');
  });

  it('matches stock levels with exact and tolerant codes', () => {
    const rack: CellarRack = {
      id: 'rack-a',
      name: 'Casier A',
      prefix: 'A',
      geometry: 'matrix',
      rows: 4,
      cols: 6,
    };
    const slots = generateRackSlots(rack);
    const sampleWine: Wine = {
      id: 'wine-1',
      producer: 'Domaine Leflaive',
      name: 'Puligny-Montrachet',
      vintage: '2020',
      color: 'blanc',
      formatCl: 75,
      alertThreshold: 3,
      canonicalKey: 'leflaive-puligny-2020',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const winesById = new Map([[sampleWine.id, sampleWine]]);

    // 1. Match exact
    const stockExact: StockLevel[] = [
      { id: 's1', wineId: 'wine-1', siteId: 'cave-1', qty: 3, bin: 'A-R1-C2', updatedAt: Date.now() },
    ];
    const slot = slots.find((s) => s.row === 1 && s.col === 2)!;
    const match = matchSlotToStock(slot, rack, stockExact, winesById);
    expect(match).toBeDefined();
    expect(match?.wine.name).toBe('Puligny-Montrachet');
    expect(match?.stockLevel.qty).toBe(3);

    // 2. Stats computation (règle 1 bouteille = 1 alvéole : 3 bouteilles occupent 3 alvéoles)
    const stats = computeRackStats(rack, stockExact, winesById);
    expect(stats.capacity).toBe(24);
    expect(stats.occupiedSlots).toBe(3);
    expect(stats.totalBottles).toBe(3);
    expect(stats.fillingRate).toBe(13); // 3 / 24 = 12.5% arrondi à 13%

    // 3. Match avec liste précise bins[] (1 alvéole individuelle par bouteille)
    const stockBins: StockLevel[] = [
      {
        id: 's2',
        wineId: 'wine-1',
        siteId: 'cave-1',
        qty: 2,
        bins: ['A-R1-C5', 'A-R1-C6'],
        updatedAt: Date.now(),
      },
    ];
    const slot5 = slots.find((s) => s.row === 1 && s.col === 5)!;
    const match5 = matchSlotToStock(slot5, rack, stockBins, winesById);
    expect(match5).toBeDefined();
    expect(match5?.slotBottleCount).toBe(1);
  });
});
