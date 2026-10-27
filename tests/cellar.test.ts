import { describe, expect, it } from 'vitest';
import {
  buildRackMatrix,
  calculateRackStats,
  formatBinCode,
  inferDefaultRacks,
  matchesSlotQuery,
  parseBinCode,
} from '@/lib/cellar';
import type { CellarRack, StockLevel, Wine } from '@/types';

describe('Cellar Cartography Logic', () => {
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
