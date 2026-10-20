import { describe, expect, it } from 'vitest';
import type { Wine } from '@/types';
import { EMPTY_FILTERS, filterCount, matchesWine, sortWines } from '@/lib/wineFilters';
import { stockByWine } from '@/data/stock';

const wine: Wine = {
  id: 'a', producer: 'Domaine Exemple', name: 'Les Vignes', vintage: '2020', color: 'blanc',
  formatCl: 75, region: 'Bourgogne', subRegion: 'Côte de Beaune', country: 'France',
  grapes: 'Chardonnay', appellation: 'Meursault', alertThreshold: 3,
  buyPriceHT: 30, sellPriceHT: 48, menuPriceTTC: 80, apogeeFrom: 2024, apogeeTo: 2030,
  notes: 'Élevage en fût', technicalSheet: { nez: 'Agrumes et fleurs', accords: 'Volaille' },
  canonicalKey: '', createdAt: 0, updatedAt: 0,
};
const match = (patch = {}, qty = 12, w = wine) => matchesWine(w, qty, { ...EMPTY_FILTERS, ...patch }, '', 2026);

describe('shared cellar filters', () => {
  it('searches accents, appellation, subregion and all terms', () => {
    expect(matchesWine(wine, 12, EMPTY_FILTERS, 'cote meursault 2020')).toBe(true);
    expect(matchesWine(wine, 12, EMPTY_FILTERS, 'meursault 2019')).toBe(false);
  });
  it('combines terroir, estate and product facets', () => {
    const filters = { region: 'Bourgogne', subRegion: 'Côte de Beaune', producer: 'Domaine Exemple', color: 'blanc', country: 'France', vintage: '2020', grapes: 'chard', format: '75' };
    expect(match(filters)).toBe(true);
    for (const key of Object.keys(filters)) expect(match({ ...filters, [key]: 'absent' })).toBe(false);
  });
  it('also searches the recorded technical-sheet grape', () => {
    expect(match({ grapes: 'chenin' }, 1, { ...wine, grapes: undefined, technicalSheet: { cepage: 'Chenin blanc' } })).toBe(true);
  });
  it('uses inclusive quantity boundaries and volume presets', () => {
    expect(match({ minQty: '12', maxQty: '12' })).toBe(true);
    expect(match({ minQty: '12' }, 11)).toBe(false);
    expect(match({ maxQty: '12' }, 13)).toBe(false);
    for (const n of [12, 24, 48, 60]) {
      expect(match({ minQty: String(n) }, n)).toBe(true);
      expect(match({ minQty: String(n) }, n - 1)).toBe(false);
    }
  });
  it('distinguishes stock state at the threshold and zero', () => {
    expect(match({ stock: 'low' }, 3)).toBe(true);
    expect(match({ stock: 'low' }, 0)).toBe(false);
    expect(match({ stock: 'normal' }, 3)).toBe(false);
    expect(match({ stock: 'normal' }, 4)).toBe(true);
    expect(match({ stock: 'out' }, 0)).toBe(true);
    expect(match({ stock: 'in' }, 0)).toBe(false);
  });
  it('prices use the selected basis and inclusive bounds', () => {
    expect(match({ minPrice: '48', maxPrice: '48' })).toBe(true);
    expect(match({ price: 'buyPriceHT', maxPrice: '30' })).toBe(true);
    expect(match({ price: 'menuPriceTTC', maxPrice: '48' })).toBe(false);
    expect(match({ minPrice: '49' })).toBe(false);
    expect(match({ minPrice: '50', maxPrice: '40' })).toBe(false);
  });
  it('does not mistake unknown prices for zero', () => {
    const unknown = { ...wine, sellPriceHT: undefined };
    expect(match({ maxPrice: '50' }, 1, unknown)).toBe(false);
    expect(match({}, 1, unknown)).toBe(true);
    expect(match({ maxPrice: '0' }, 1, { ...wine, sellPriceHT: 0 })).toBe(true);
  });
  it('requires a complete drinking window, inclusive of current year', () => {
    expect(match({ apogee: true })).toBe(true);
    expect(matchesWine(wine, 12, { ...EMPTY_FILTERS, apogee: true }, '', 2030)).toBe(true);
    expect(matchesWine(wine, 12, { ...EMPTY_FILTERS, apogee: true }, '', 2031)).toBe(false);
    expect(match({ apogee: true }, 1, { ...wine, apogeeTo: undefined })).toBe(false);
  });
  it('only searches characteristics explicitly recorded, not assumed', () => {
    expect(match({ characteristics: 'agrumes fut' })).toBe(true);
    expect(match({ characteristics: 'mineral' })).toBe(false);
    expect(match({ characteristics: 'blanc' })).toBe(false);
    expect(match({ characteristics: 'generatedByAI' })).toBe(false);
  });
  it('counts criteria, not price basis', () => {
    expect(filterCount(EMPTY_FILTERS)).toBe(0);
    expect(filterCount({ ...EMPTY_FILTERS, minPrice: '0', price: 'buyPriceHT', apogee: true })).toBe(2);
  });
  it('uses selected-site stock for both filtering and sorting', () => {
    const stock = [{ id: 'a__one', wineId: 'a', siteId: 'one', qty: 10, updatedAt: 0 }, { id: 'a__two', wineId: 'a', siteId: 'two', qty: 2, updatedAt: 0 }];
    expect(match({ minQty: '12' }, stockByWine(stock, 'all').get('a'))).toBe(true);
    expect(match({ minQty: '12' }, stockByWine(stock, 'one').get('a'))).toBe(false);
    const b = { ...wine, id: 'b', vintage: '2022', sellPriceHT: 20 };
    expect(sortWines([wine, b], new Map([['a', 1], ['b', 4]]), 'qty', 'sellPriceHT')[0].id).toBe('b');
    expect(sortWines([wine, b], new Map(), 'vintage', 'sellPriceHT')[0].id).toBe('b');
    expect(sortWines([wine, b], new Map(), 'price', 'sellPriceHT')[0].id).toBe('b');
    expect(sortWines([wine, { ...b, sellPriceHT: undefined }], new Map(), 'price', 'sellPriceHT')[0].id).toBe('a');
  });
});
