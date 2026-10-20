import { describe, expect, it } from 'vitest';
import type { Wine } from '@/types';
import { EMPTY_FILTERS, QUICK_FILTERS, buildWineSections, quickActive, sortWines } from '@/lib/wineFilters';
import { formatMessage } from '@/i18n';
import { ux } from '@/i18n/ux';
import { adjustedPrice } from '@/pages/Wines';

const w = (id: string, o: Partial<Wine> = {}): Wine =>
  ({ id, producer: 'Domaine A', name: 'Cuvée', vintage: '2020', color: 'rouge', formatCl: 75, alertThreshold: 1, canonicalKey: id, createdAt: 0, updatedAt: 0, ...o }) as Wine;

describe('compact grouping', () => {
  const list = [
    w('1', { region: 'Bourgogne', subRegion: 'Côte de Beaune', producer: 'Leflaive' }),
    w('2', { region: 'Bourgogne', subRegion: 'Côte de Beaune', producer: 'Leflaive', vintage: '2019' }),
    w('3', { region: 'Bourgogne', subRegion: 'Côte de Nuits', producer: 'Dujac' }),
    w('4', { region: 'Alsace', producer: 'Ostertag' }),
    w('5', { producer: 'Inconnu' }),
  ];
  it('groups by region with « sub-region · estate » sub-headers and unknown last', () => {
    const s = buildWineSections(list, 'terroir', 'Terroir non renseigné');
    expect(s.map((x) => x.title)).toEqual(['Alsace', 'Bourgogne', 'Terroir non renseigné']);
    expect(s[1].subgroups.map((g) => g.label)).toEqual(['Côte de Beaune · Leflaive', 'Côte de Nuits · Dujac']);
    expect(s[1].subgroups[0].wines.map((x) => x.id)).toEqual(['1', '2']);
    expect(s[0].subgroups[0].label).toBe('Ostertag');
  });
  it('keeps the requested order inside groups and supports flat / estate modes', () => {
    expect(buildWineSections(list, 'none', '?')[0].wines).toHaveLength(5);
    const byEstate = buildWineSections(list, 'producer', '?');
    expect(byEstate.map((s) => s.title)).toEqual(['Dujac', 'Inconnu', 'Leflaive', 'Ostertag']);
    expect(byEstate[2].subgroups).toHaveLength(1);
    expect(byEstate[2].subgroups[0].label).toBe('');
  });
});

describe('sorting with direction', () => {
  const a = w('a', { vintage: '2018', sellPriceHT: 30 });
  const b = w('b', { vintage: '2021', sellPriceHT: 10 });
  const c = w('c', { vintage: '2015', sellPriceHT: undefined });
  const qty = new Map([['a', 5], ['b', 1], ['c', 9]]);
  it('reverses the main criterion', () => {
    expect(sortWines([a, b, c], qty, 'qty', 'sellPriceHT').map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(sortWines([a, b, c], qty, 'qty', 'sellPriceHT', true).map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(sortWines([a, b, c], qty, 'vintage', 'sellPriceHT', true).map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
  it('keeps unknown prices last in both directions', () => {
    expect(sortWines([c, a, b], qty, 'price', 'sellPriceHT').map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(sortWines([c, a, b], qty, 'price', 'sellPriceHT', true).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('quick filters', () => {
  it('detects and toggles shortcuts', () => {
    const apogee = QUICK_FILTERS.find((f) => f.id === 'apogee')!;
    expect(quickActive(EMPTY_FILTERS, apogee.patch)).toBe(false);
    expect(quickActive({ ...EMPTY_FILTERS, apogee: true }, apogee.patch)).toBe(true);
  });
});

describe('bulk price adjustment', () => {
  it('applies % change or multiplier with rounding, never below zero', () => {
    expect(adjustedPrice({ sellPriceHT: 20 }, 'pct', 5, 0.1)).toBe(21);
    expect(adjustedPrice({ sellPriceHT: 19.99 }, 'pct', 10, 0.5)).toBe(22);
    expect(adjustedPrice({ buyPriceHT: 12.3 }, 'coef', 1.6, 0.01)).toBe(19.68);
    expect(adjustedPrice({ sellPriceHT: 10 }, 'pct', -150, 0.1)).toBe(0);
    expect(adjustedPrice({}, 'coef', 1.6, 1)).toBeUndefined();
  });
});

describe('plural messages', () => {
  it('follows French and English rules', () => {
    const s = '{n} {n|référence|références}';
    expect(formatMessage(s, { n: 0 }, 'fr')).toBe('0 référence');
    expect(formatMessage(s, { n: 1 }, 'fr')).toBe('1 référence');
    expect(formatMessage(s, { n: 2 }, 'fr')).toBe('2 références');
    expect(formatMessage('{n} {n|bottle|bottles}', { n: 0 }, 'en')).toBe('0 bottles');
    expect(formatMessage('{n} {n|bottle|bottles}', { n: 1 }, 'en')).toBe('1 bottle');
    expect(formatMessage('« {name} »', { name: 'X' }, 'fr')).toBe('« X »');
  });
  it('ux dictionary has FR/EN parity', () => {
    expect(Object.keys(ux.fr).sort()).toEqual(Object.keys(ux.en).sort());
  });
});
