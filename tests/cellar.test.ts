import { describe, expect, it } from 'vitest';
import type { CellarRack, StockLevel, Wine } from '@/types';
import {
  buildSlotCode,
  computeRackStats,
  formatSlotLabel,
  generateRackSlots,
  getRackCapacity,
  matchSlotToStock,
} from '@/lib/cellar';

describe('Cellar Rack Geometry & Capacity', () => {
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
