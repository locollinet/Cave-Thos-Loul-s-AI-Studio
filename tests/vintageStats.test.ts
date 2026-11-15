import { describe, expect, it } from 'vitest';
import { computeSiteActivity, computeVintageAnalytics } from '@/lib/vintageStats';
import { selectCandidateWinesForPrompt } from '@/modules/carte/AiPanel';
import type { Movement, Site, StockLevel, Wine } from '@/types';
import type { PublicItem } from '@/modules/carte/types';

const mkWine = (id: string, p: Partial<Wine> = {}): Wine => ({
  id,
  producer: 'Château de La Commaraine',
  name: 'Pommard 1er Cru Clos de la Commaraine',
  appellation: 'Pommard Premier Cru',
  region: 'Bourgogne',
  vintage: '2018',
  color: 'rouge',
  formatCl: 75,
  buyPriceHT: 70,
  menuPriceTTC: 210,
  alertThreshold: 2,
  canonicalKey: id,
  createdAt: 0,
  updatedAt: 0,
  ...p,
});

describe('analyse statistique sur les années & verticales (computeVintageAnalytics)', () => {
  const now = Date.parse('2026-11-15T12:00:00Z');
  const wines: Wine[] = [
    mkWine('c17', { vintage: '2017', buyPriceHT: 68, menuPriceTTC: 240, apogeeFrom: 2021, apogeeTo: 2026 }),
    mkWine('c18', { vintage: '2018', buyPriceHT: 72, menuPriceTTC: 220, apogeeFrom: 2023, apogeeTo: 2032 }),
    mkWine('c19', { vintage: '2019', buyPriceHT: 78, menuPriceTTC: 210, apogeeFrom: 2025, apogeeTo: 2035 }),
    mkWine('c21', { vintage: '2021', buyPriceHT: 82, menuPriceTTC: 195, apogeeFrom: 2028, apogeeTo: 2038 }),
    mkWine('krug', { producer: 'Champagne Krug', name: 'Grande Cuvée', vintage: 'NM', color: 'bulles', buyPriceHT: 165, menuPriceTTC: 420 }),
  ];
  const stock: StockLevel[] = [
    { id: 'c17__s1', wineId: 'c17', siteId: 's1', qty: 4, updatedAt: 0 },
    { id: 'c18__s1', wineId: 'c18', siteId: 's1', qty: 8, updatedAt: 0 },
    { id: 'c19__s1', wineId: 'c19', siteId: 's1', qty: 10, updatedAt: 0 },
    { id: 'c21__s1', wineId: 'c21', siteId: 's1', qty: 12, updatedAt: 0 },
    { id: 'krug__s1', wineId: 'krug', siteId: 's1', qty: 6, updatedAt: 0 },
  ];
  const movements: Movement[] = [
    { id: 'm1', wineId: 'c18', wineLabel: 'c18', siteId: 's1', type: 'out', reason: 'consommation', qty: 4, date: '2026-05-10', userId: 'u', userName: 'U', createdAt: 0 },
    { id: 'm2', wineId: 'c19', wineLabel: 'c19', siteId: 's1', type: 'out', reason: 'verre', qty: 2, date: '2026-08-12', userId: 'u', userName: 'U', createdAt: 0 },
  ];

  it('calcule la pyramide des millésimes, l’âge moyen pondéré et la répartition de maturité', () => {
    const res = computeVintageAnalytics(wines, stock, movements, { now, vatRate: 20 });
    expect(res.totalBottles).toBe(40);
    expect(res.oldestVintage).toBe(2017);
    expect(res.newestVintage).toBe(2021);
    expect(res.medianVintage).toBe(2019);
    expect(res.weightedAvgAge).toBeGreaterThan(5);
    expect(res.urgentBottles).toBe(4); // 2017 fin d'apogée en 2026
    expect(res.agingBottles).toBe(12); // 2021 apogeeFrom 2028
    expect(res.readyBottles).toBe(24); // 2018 + 2019 + Krug NM
    expect(res.byVintage.map((r) => r.vintage)).toEqual(['2017', '2018', '2019', '2021', 'NM']);
  });

  it('détecte automatiquement les verticales (>= 3 millésimes d’une même cuvée en stock)', () => {
    const res = computeVintageAnalytics(wines, stock, movements, { now, vatRate: 20 });
    expect(res.verticals).toHaveLength(1);
    const v = res.verticals[0];
    expect(v.producer).toBe('Château de La Commaraine');
    expect(v.vintages.map((x) => x.vintage)).toEqual(['2017', '2018', '2019', '2021']);
    expect(v.completeFlights).toBe(4);
    expect(v.totalBottles).toBe(34);
    expect(v.flightMenuTTC).toBe(240 + 220 + 210 + 195);
    expect(v.flightMarginHT).toBeGreaterThan(400);
  });
});

describe('consolidation multi-sites (computeSiteActivity)', () => {
  const now = Date.parse('2026-11-15T12:00:00Z');
  const sites: Site[] = [
    { id: 'cave', name: 'Cave de garde', kind: 'cave', createdAt: 0 },
    { id: 'gastro', name: 'Table Gastronomique', kind: 'restaurant', createdAt: 0 },
  ];
  const wines = [mkWine('w1', { buyPriceHT: 50, menuPriceTTC: 180 })];
  const stock: StockLevel[] = [
    { id: 'w1__cave', wineId: 'w1', siteId: 'cave', qty: 20, updatedAt: 0 },
    { id: 'w1__gastro', wineId: 'w1', siteId: 'gastro', qty: 6, updatedAt: 0 },
  ];
  const movements: Movement[] = [
    { id: 't1', wineId: 'w1', wineLabel: 'w1', siteId: 'cave', toSiteId: 'gastro', type: 'transfer', reason: 'transfert', qty: 6, date: '2026-10-01', userId: 'u', userName: 'U', createdAt: 0 },
    { id: 's1', wineId: 'w1', wineLabel: 'w1', siteId: 'gastro', type: 'out', reason: 'consommation', qty: 3, date: '2026-10-15', userId: 'u', userName: 'U', createdAt: 0 },
    { id: 'l1', wineId: 'w1', wineLabel: 'w1', siteId: 'gastro', type: 'out', reason: 'offert', qty: 1, date: '2026-10-16', userId: 'u', userName: 'U', createdAt: 0 },
  ];

  it('consolide stocks, sorties servies, transferts, pertes et ratio coût matière par site', () => {
    const rows = computeSiteActivity(sites, wines, stock, movements, { days: 90, now, vatRate: 20 });
    expect(rows).toHaveLength(2);
    const cave = rows.find((r) => r.site.id === 'cave')!;
    const gastro = rows.find((r) => r.site.id === 'gastro')!;
    expect(cave.transfersOut).toBe(6);
    expect(gastro.transfersIn).toBe(6);
    expect(gastro.servedBottles).toBe(3);
    expect(gastro.lossBottles).toBe(1);
    expect(gastro.revenueHT).toBe(3 * 150);
    expect(gastro.cogsHT).toBe(3 * 50);
    expect(gastro.marginHT).toBe(300);
    expect(gastro.costRatioPct).toBe(33.3);
  });
});

describe('pré-filtrage intelligent du Sommelier IA pour grandes cartes (> 150 vins)', () => {
  it('sélectionne les vins pertinents dans les dernières sections au-delà du 150e vin', () => {
    const champagnes: PublicItem[] = Array.from({ length: 160 }, (_, i) => ({
      wineId: `ch-${i}`,
      producer: 'Maison Champagne',
      name: `Brut ${i}`,
      vintage: 'NM',
      color: 'bulles',
      formatCl: 75,
      region: 'Champagne',
      priceTTC: 110,
    }));
    const bourgognesRouges: PublicItem[] = [
      {
        wineId: 'pommard-commaraine',
        producer: 'Château de La Commaraine',
        name: 'Pommard 1er Cru Clos de la Commaraine',
        vintage: '2018',
        color: 'rouge',
        formatCl: 75,
        region: 'Bourgogne',
        grapes: 'Pinot noir',
        priceTTC: 220,
      },
    ];
    const picked = selectCandidateWinesForPrompt(
      [{ items: champagnes }, { items: bourgognesRouges }],
      'Je cherche un grand Pommard rouge pour accompagner un pigeon rôti',
      '250',
      150,
    );
    expect(picked).toHaveLength(150);
    expect(picked.some((w) => w.wineId === 'pommard-commaraine')).toBe(true);
    expect(picked[0].wineId).toBe('pommard-commaraine');
  });
});
