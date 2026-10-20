import { describe, expect, it } from 'vitest';
import { buildMovementOps, stockDeltas, stockId, stockValue, wineAlerts } from '@/data/stock';
import { detectMapping, mapRows } from '@/lib/importWines';
import { parseCsv, round2, toCsv } from '@/lib/utils';
import type { StockLevel, Wine } from '@/types';

const wine = { id: 'w1', producer: 'Dujac', name: 'Gevrey-Chambertin', vintage: '2018', formatCl: 75 };
const actor = { userId: 'u1', userName: 'Test' };

describe('mouvements de stock', () => {
  it('calcule les variations par type', () => {
    expect(stockDeltas({ type: 'in', qty: 6, siteId: 'a' })).toEqual([{ siteId: 'a', delta: 6 }]);
    expect(stockDeltas({ type: 'out', qty: 2, siteId: 'a' })).toEqual([{ siteId: 'a', delta: -2 }]);
    expect(stockDeltas({ type: 'adjust', qty: -3, siteId: 'a' })).toEqual([{ siteId: 'a', delta: -3 }]);
    expect(stockDeltas({ type: 'transfer', qty: 4, siteId: 'a', toSiteId: 'b' })).toEqual([
      { siteId: 'a', delta: -4 },
      { siteId: 'b', delta: 4 },
    ]);
  });

  it('génère un mouvement immuable + des incréments atomiques', () => {
    const ops = buildMovementOps('org1', [{ wine, siteId: 'a', toSiteId: 'b', type: 'transfer', qty: 3, reason: 'transfert' }], actor, 1000);
    expect(ops).toHaveLength(3);
    expect(ops[0]).toMatchObject({ op: 'set' });
    expect(ops[1]).toMatchObject({ op: 'inc', path: `orgs/org1/stock/${stockId('w1', 'a')}`, by: -3, field: 'qty' });
    expect(ops[2]).toMatchObject({ op: 'inc', path: `orgs/org1/stock/${stockId('w1', 'b')}`, by: 3 });
  });

  it('ignore les mouvements vides ou transferts invalides', () => {
    expect(buildMovementOps('o', [{ wine, siteId: 'a', type: 'in', qty: 0, reason: 'achat' }], actor)).toHaveLength(0);
    expect(buildMovementOps('o', [{ wine, siteId: 'a', toSiteId: 'a', type: 'transfer', qty: 1, reason: 'transfert' }], actor)).toHaveLength(0);
  });

  it('refuse une sortie ou un transfert qui rendrait le stock négatif', () => {
    const currentStock: StockLevel[] = [{ id: stockId('w1', 'a'), wineId: 'w1', siteId: 'a', qty: 5, updatedAt: 0 }];
    // Sortie de 6 sur un stock de 5 : doit lancer une erreur
    expect(() =>
      buildMovementOps('org1', [{ wine, siteId: 'a', type: 'out', qty: 6, reason: 'vente' }], actor, 1000, currentStock),
    ).toThrow(/Stock insuffisant/);

    // Sortie de 5 : autorisé
    expect(() =>
      buildMovementOps('org1', [{ wine, siteId: 'a', type: 'out', qty: 5, reason: 'vente' }], actor, 1000, currentStock),
    ).not.toThrow();
  });
});

describe('agrégats et alertes', () => {
  const wines = [{ ...wine, buyPriceHT: 50, sellPriceHT: 80 } as Wine, { id: 'w2', buyPriceHT: 10, sellPriceHT: 20 } as Wine];
  const stock: StockLevel[] = [
    { id: 'a', wineId: 'w1', siteId: 's1', qty: 4, updatedAt: 0 },
    { id: 'b', wineId: 'w1', siteId: 's2', qty: 2, updatedAt: 0 },
    { id: 'c', wineId: 'w2', siteId: 's1', qty: 10, updatedAt: 0 },
  ];
  it('valorise le stock par site', () => {
    expect(stockValue(wines, stock, 'all')).toEqual({ bottles: 16, costHT: 400, sellHT: 680 });
    expect(stockValue(wines, stock, 's2')).toEqual({ bottles: 2, costHT: 100, sellHT: 160 });
  });
  it('détecte ruptures, stock bas et apogée', () => {
    expect(wineAlerts({ alertThreshold: 3 } as Wine, 0)).toContain('out');
    expect(wineAlerts({ alertThreshold: 3 } as Wine, 3)).toContain('low');
    expect(wineAlerts({ alertThreshold: 0, apogeeFrom: 2020, apogeeTo: 2030 } as Wine, 5, 2025)).toContain('apogee');
    expect(wineAlerts({ alertThreshold: 0, apogeeFrom: 2010, apogeeTo: 2020 } as Wine, 5, 2025)).toContain('past');
  });
});

describe('import de vins', () => {
  it('devine les colonnes', () => {
    const m = detectMapping(['Domaine', 'Cuvée', 'Millésime', 'Prix achat HT', 'Stock']);
    expect(m).toMatchObject({ producer: 0, name: 1, vintage: 2, buyPriceHT: 3, qty: 4 });
  });
  it('mappe les lignes', () => {
    const rows = mapRows([['Dujac', 'Gevrey-Chambertin', 2018, '85,50', 12], ['', '', '', '', '']], { producer: 0, name: 1, vintage: 2, buyPriceHT: 3, qty: 4 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ producer: 'Dujac', vintage: '2018', buyPriceHT: 85.5, qty: 12, formatCl: 75 });
  });
});

describe('utils', () => {
  it('CSV aller-retour avec guillemets et séparateur', () => {
    const csv = toCsv([['a', 'b;c', 'd"e'], [1, 2, 3]]);
    expect(parseCsv(csv)).toEqual([['a', 'b;c', 'd"e'], ['1', '2', '3']]);
  });
  it('arrondis', () => expect(round2(1.005 + 0.0000001)).toBe(1.01));
});
