import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { Org, StockLevel, Wine } from '@/types';
import { buildListSections, defaultWineList, hashPublicDoc, moveSection, newPublicId, priceFor, toPublicDoc, listToCsvRows, PINNED_KEY } from '@/modules/carte/build';
import { carte } from '@/i18n/carte';
import { core } from '@/i18n/core';

const org: Pick<Org, 'id' | 'name' | 'defaultVatRate'> = { id: 'o1', name: 'Chez Loul', defaultVatRate: 20 };

const wine = (id: string, p: Partial<Wine> = {}): Wine => ({
  id,
  producer: `Dom ${id}`,
  name: `Cuvée ${id}`,
  vintage: '2020',
  color: 'rouge',
  formatCl: 75,
  region: 'Bourgogne',
  buyPriceHT: 20,
  alertThreshold: 2,
  canonicalKey: id,
  createdAt: 0,
  updatedAt: 0,
  ...p,
});
const stk = (wineId: string, siteId: string, qty: number): StockLevel => ({ id: `${wineId}__${siteId}`, wineId, siteId, qty, updatedAt: 0 });
const list = (p: Partial<ReturnType<typeof defaultWineList>> = {}) => ({ ...defaultWineList('fr', 'Carte'), id: 'l1', ...p });
const items = (s: ReturnType<typeof buildListSections>) => s.flatMap((x) => x.items.map((i) => i.wineId));

describe('buildListSections', () => {
  it('masque les vins épuisés, archivés, cachés et exclus', () => {
    const wines = [wine('a'), wine('b'), wine('c', { isArchived: true }), wine('d', { hideFromMenu: true }), wine('e'), wine('f')];
    const stock = [stk('a', 's1', 3), stk('b', 's1', 0), stk('c', 's1', 5), stk('d', 's1', 5), stk('e', 's1', 5), stk('f', 's1', 1)];
    const s = buildListSections(list({ excludedWineIds: ['e'] }), wines, stock, org);
    expect(items(s).sort()).toEqual(['a', 'f']);
  });

  it('respecte le stock minimum et les sites choisis', () => {
    const wines = [wine('a'), wine('b')];
    const stock = [stk('a', 's1', 2), stk('a', 's2', 10), stk('b', 's2', 4)];
    expect(items(buildListSections(list({ minStock: 3 }), wines, stock, org)).sort()).toEqual(['a', 'b']);
    expect(items(buildListSections(list({ minStock: 3, siteIds: ['s1'] }), wines, stock, org))).toEqual([]);
    expect(items(buildListSections(list({ siteIds: ['s2'] }), wines, stock, org)).sort()).toEqual(['a', 'b']);
  });

  it('garde les vins épuisés si hideOutOfStock est désactivé', () => {
    expect(items(buildListSections(list({ hideOutOfStock: false }), [wine('a')], [], org))).toEqual(['a']);
  });

  it('est vivante : un vin qui tombe à zéro disparaît', () => {
    const wines = [wine('a'), wine('b')];
    const before = buildListSections(list(), wines, [stk('a', 's', 1), stk('b', 's', 1)], org);
    const after = buildListSections(list(), wines, [stk('a', 's', 0), stk('b', 's', 1)], org);
    expect(items(before)).toHaveLength(2);
    expect(items(after)).toEqual(['b']);
  });

  it('ordonne les couleurs : bulles, blancs, rosés, rouges, doux', () => {
    const wines = [wine('r', { color: 'rouge' }), wine('d', { color: 'doux' }), wine('b', { color: 'bulles' }), wine('w', { color: 'blanc' }), wine('p', { color: 'rose' })];
    const stock = wines.map((w) => stk(w.id, 's', 2));
    const s = buildListSections(list({ groupBy: 'color' }), wines, stock, org);
    expect(s.map((x) => x.key)).toEqual(['bulles', 'blanc', 'rose', 'rouge', 'doux']);
    expect(s[0].title).toBe('Bulles & Champagnes');
    expect(s.every((x) => x.titleKey === x.key)).toBe(true); // titres standard, traduits sans IA
  });

  it('ordonne les régions de façon sensée puis alphabétique', () => {
    const wines = [wine('1', { region: 'Bordeaux' }), wine('2', { region: 'Champagne' }), wine('3', { region: 'Bourgogne' }), wine('4', { region: 'Zzz' }), wine('5', { region: undefined })];
    const s = buildListSections(list({ groupBy: 'region' }), wines, wines.map((w) => stk(w.id, 's', 1)), org);
    expect(s.map((x) => x.title)).toEqual(['Champagne', 'Bourgogne', 'Bordeaux', 'Zzz', 'Autres vins']);
    expect(s.map((x) => x.titleKey)).toEqual([undefined, undefined, undefined, undefined, '__other']);
  });

  it('applique l’ordre personnalisé des sections', () => {
    const wines = [wine('r', { color: 'rouge' }), wine('w', { color: 'blanc' })];
    const stock = wines.map((w) => stk(w.id, 's', 1));
    const s = buildListSections(list({ sectionOrder: ['rouge', 'blanc'] }), wines, stock, org);
    expect(s.map((x) => x.key)).toEqual(['rouge', 'blanc']);
  });

  it('épingle les coups de cœur en tête, sans doublon', () => {
    const wines = [wine('a', { color: 'blanc' }), wine('b', { color: 'rouge' })];
    const s = buildListSections(list({ pinnedWineIds: ['b'] }), wines, wines.map((w) => stk(w.id, 's', 1)), org);
    expect(s[0].key).toBe(PINNED_KEY);
    expect(s[0].title).toBe('Coups de cœur');
    expect(items(s)).toEqual(['b', 'a']);
  });
});

describe('priceFor', () => {
  const w = wine('a', { buyPriceHT: 20, sellPriceHT: 40 });
  it('priorité : surcharge > prix carte de la fiche > règle', () => {
    expect(priceFor(list({ priceOverrides: { a: 99 } }), { ...w, menuPriceTTC: 80 }, 20)).toBe(99);
    expect(priceFor(list(), { ...w, menuPriceTTC: 80 }, 20)).toBe(80);
    expect(priceFor(list(), w, 20)).toBe(72); // 20 × 3 × 1,2
  });
  it('arrondit selon le pas configuré', () => {
    const l = list({ priceRule: { mode: 'multiplier', multiplier: 2.9, rounding: 5 } });
    expect(priceFor(l, w, 20)).toBe(70); // 69,6 -> 70
    expect(priceFor(list({ priceRule: { mode: 'multiplier', multiplier: 2.9, rounding: 0.5 } }), w, 20)).toBe(69.5);
  });
  it('mode fixe : prix de vente HT converti en TTC, null sans prix', () => {
    const l = list({ priceRule: { mode: 'fixed', multiplier: 3, rounding: 1 } });
    expect(priceFor(l, w, 20)).toBe(48);
    expect(priceFor(l, wine('x', { sellPriceHT: undefined }), 20)).toBeNull();
  });
});

describe('instantané public', () => {
  const wines = [wine('a', { buyPriceHT: 10, technicalSheet: { bouche: 'Ample et frais' } })];
  const sections = buildListSections(list(), wines, [stk('a', 's', 12)], org);

  it('ne contient ni prix d’achat ni stock', () => {
    const doc = toPublicDoc({ ...list({ showDescription: true }), publicId: 'x'.repeat(24) }, sections, org, 1);
    const json = JSON.stringify(doc);
    expect(json).not.toContain('buyPrice');
    expect(json).not.toContain('"qty"');
    expect(json).not.toContain('"stock"');
    expect(doc.sections[0].items[0].note).toBe('Ample et frais');
    expect(doc.orgId).toBe('o1');
  });

  it('respecte les options d’affichage', () => {
    const doc = toPublicDoc(list({ showVintage: false, showFormat: false, showDescription: false }), sections, org, 1);
    const it = doc.sections[0].items[0];
    expect(it.vintage).toBe('');
    expect(it.formatCl).toBe(0);
    expect(it.note).toBeUndefined();
  });

  it('le hash ignore la date mais détecte un changement de contenu', () => {
    const a = toPublicDoc(list(), sections, org, 1);
    const b = toPublicDoc(list(), sections, org, 999);
    const c = toPublicDoc(list({ template: 'or' }), sections, org, 1);
    expect(hashPublicDoc(a)).toBe(hashPublicDoc(b));
    expect(hashPublicDoc(a)).not.toBe(hashPublicDoc(c));
  });
});

describe('utilitaires', () => {
  it('génère des identifiants publics non devinables (≥ 16 car.)', () => {
    const a = newPublicId();
    expect(a.length).toBeGreaterThanOrEqual(16);
    expect(a).not.toBe(newPublicId());
    expect(a).toMatch(/^[a-z2-9]+$/);
  });
  it('déplace une section', () => {
    expect(moveSection(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
    expect(moveSection(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
  });
  it('exporte en lignes CSV', () => {
    const rows = listToCsvRows(buildListSections(list(), [wine('a')], [stk('a', 's', 1)], org));
    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe('Dom a');
  });
});

describe('i18n carte / achats / ai', () => {
  const files = ['src/modules/carte', 'src/modules/achats'];
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []));
  const src = files.flatMap((d) => walk(path.join(process.cwd(), d))).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const keys = [...src.matchAll(/\bt\(\s*'((?:carte|achats|ai|common)\.[a-zA-Z0-9_.]+)'/g)].map((m) => m[1]);
  const prompts = [...src.matchAll(/'(carte\.ai\.p\d)'/g)].map((m) => m[1]);

  it('même jeu de clés en FR et en EN', () => {
    expect(Object.keys(carte.fr).sort()).toEqual(Object.keys(carte.en).sort());
  });
  it('toutes les clés statiques utilisées existent', () => {
    const all = { ...core.fr, ...carte.fr };
    const missing = [...new Set([...keys, ...prompts])].filter((k) => !(k in all));
    expect(missing).toEqual([]);
  });
  it('les clés dynamiques existent', () => {
    const dyn = [
      ...['restaurant', 'bar', 'degustation', 'emporter'].map((k) => `carte.kind.${k}`),
      ...['palace', 'prestige', 'epure', 'bistrot', 'or'].flatMap((k) => [`carte.tpl.${k}`, `carte.tpl.${k}.desc`]),
      ...['region', 'color', 'country', 'custom'].map((k) => `carte.group.${k}`),
      ...['rouge', 'blanc', 'rose', 'bulles', 'orange', 'doux', 'spiritueux', 'autre'].map((k) => `carte.color.${k}`),
      ...['aop', 'lieuDit', 'sol', 'cepage', 'ageVignes', 'vinification', 'elevage', 'oeil', 'nez', 'bouche', 'temperatureService', 'garde', 'accords'].map((k) => `carte.tech.${k}`),
      ...['draft', 'received', 'paid'].map((k) => `achats.status.${k}`),
      ...['transfer', 'cheque', 'card', 'cash', 'debit'].map((k) => `achats.pay.${k}`),
    ];
    expect(dyn.filter((k) => !(k in carte.fr))).toEqual([]);
  });
});
