import { describe, expect, it } from 'vitest';
import type { Movement, Site, StockLevel, Wine } from '../src/types';
import { newDocument, withTotals } from '../src/modules/negoce/calc';
import type { DocLine, Payment, SaleDocument } from '../src/modules/negoce/types';
import { defaultWineList } from '../src/modules/carte/build';
import {
  cellarInsight,
  chainInsight,
  dashboardKind,
  drinkingWindow,
  listShortages,
  monthWindows,
  monthlyExits,
  negoceInsight,
  onboardingProgress,
  onboardingSteps,
  openBottles,
  receivables,
  revenueSummary,
  siteComparison,
  staffInsight,
  staleQuotes,
  stockAlerts,
  todayMovements,
  topClients,
  topWines,
} from '../src/pages/dashboard/compute';
import { FRENCH_REGIONS, MAP_HEIGHT, MAP_WIDTH, isRegionSelected, matchRegion, project, terroirStats, wineTerroir } from '../src/modules/pilotage/terroir';

const wine = (id: string, p: Partial<Wine> = {}): Wine => ({
  id,
  producer: `Prod ${id}`,
  name: `Vin ${id}`,
  vintage: '2020',
  color: 'rouge',
  formatCl: 75,
  buyPriceHT: 10,
  sellPriceHT: 20,
  alertThreshold: 0,
  region: 'Bourgogne',
  canonicalKey: id,
  createdAt: 0,
  updatedAt: 0,
  ...p,
});
const lvl = (wineId: string, siteId: string, qty: number): StockLevel => ({ id: `${wineId}__${siteId}`, wineId, siteId, qty, updatedAt: 0 });
const mv = (p: Partial<Movement>): Movement => ({ id: Math.random().toString(), date: '2026-03-10', wineId: 'a', wineLabel: 'a', siteId: 's1', type: 'out', qty: 1, reason: 'vente', userId: 'u', userName: 'U', createdAt: 0, ...p });
const line = (p: Partial<DocLine>): DocLine => ({ id: Math.random().toString(), description: 'x', qty: 1, unitPriceHT: 10, discountPct: 0, vatRate: 20, ...p });
const doc = (lines: DocLine[], p: Partial<SaleDocument> = {}): SaleDocument =>
  withTotals({ ...newDocument('invoice', { siteId: 's1', vatRate: 20, userId: 'u', date: '2026-03-10' }), status: 'validated', partnerId: 'p1', partnerName: 'Client 1', lines, ...p });
const site = (id: string, name = id): Site => ({ id, name, kind: 'restaurant', createdAt: 0 });

/* ------------------------------------------------------------ terroirs */

describe('matchRegion', () => {
  it('normalise accents, casse et ponctuation', () => {
    expect(matchRegion('BOURGOGNE')).toBe('Bourgogne');
    expect(matchRegion('  vallée du rhône ')).toBe('Vallée du Rhône');
    expect(matchRegion('Vallee-du-Rhone')).toBe('Vallée du Rhône');
    expect(matchRegion('Sud Ouest')).toBe('Sud-Ouest');
    expect(matchRegion('sud-ouest')).toBe('Sud-Ouest');
  });

  it('reconnaît les alias et sous-régions courantes', () => {
    expect(matchRegion('Rhône')).toBe('Vallée du Rhône');
    expect(matchRegion('Côtes-du-Rhône Villages')).toBe('Vallée du Rhône');
    expect(matchRegion('Burgundy')).toBe('Bourgogne');
    expect(matchRegion('Chablis')).toBe('Bourgogne');
    expect(matchRegion('Saint-Émilion Grand Cru')).toBe('Bordeaux');
    expect(matchRegion('Val de Loire')).toBe('Loire');
    expect(matchRegion('Vallée de la Loire')).toBe('Loire');
    expect(matchRegion('Corsica')).toBe('Corse');
    expect(matchRegion('Crémant d’Alsace')).toBe('Alsace');
    expect(matchRegion('Languedoc-Roussillon')).toBe('Languedoc');
    expect(matchRegion('Côtes du Roussillon')).toBe('Roussillon');
    expect(matchRegion('Bandol')).toBe('Provence');
  });

  it('renvoie null pour les régions inconnues ou étrangères', () => {
    expect(matchRegion('Piémont')).toBeNull();
    expect(matchRegion('Mosel')).toBeNull();
    expect(matchRegion('')).toBeNull();
    expect(matchRegion(undefined)).toBeNull();
  });

  it('ignore les vins étrangers et se rabat sur la sous-région si la région est vide', () => {
    expect(wineTerroir({ region: 'Jura', country: 'Suisse' })).toBeNull();
    expect(wineTerroir({ region: 'Jura', country: 'France' })).toBe('Jura');
    expect(wineTerroir({ region: '', subRegion: 'Chablis' })).toBe('Bourgogne');
    expect(wineTerroir({ region: 'Lorraine', subRegion: 'Chablis' })).toBeNull();
  });
});

describe('terroirStats', () => {
  const wines = [
    wine('a', { region: 'Rhône' }),
    wine('b', { region: 'Vallée du Rhône' }),
    wine('c', { region: 'Rhône' }),
    wine('d', { region: 'Piémont', country: 'Italie' }),
    wine('e', { region: 'Bourgogne', isArchived: true }),
    wine('f', { region: '' }),
  ];
  const qty = new Map([
    ['a', 4],
    ['b', 2],
    ['c', 0],
    ['d', 3],
    ['e', 10],
  ]);
  const s = terroirStats(wines, qty);

  it('regroupe les alias et compte références et bouteilles', () => {
    const rhone = s.french.get('Vallée du Rhône')!;
    expect(rhone).toMatchObject({ refs: 3, bottles: 6 });
    expect(rhone.value).toBe('Vallée du Rhône'); // libellé canonique présent : il est privilégié
    expect(s.french.has('Bourgogne')).toBe(false); // archivé
  });

  it('liste les autres terroirs avec leur pays', () => {
    expect(s.others).toEqual([{ value: 'Piémont', country: 'Italie', refs: 1, bottles: 3 }]);
  });

  it('transmet le libellé brut le plus fréquent quand le canonique est absent', () => {
    const only = terroirStats([wine('x', { region: 'Rhône' }), wine('y', { region: 'Rhône' }), wine('z', { region: 'Côtes du Rhône' })], new Map());
    expect(only.french.get('Vallée du Rhône')?.value).toBe('Rhône');
  });

  it('sélection : par libellé brut ou par alias', () => {
    const stat = s.french.get('Vallée du Rhône')!;
    expect(isRegionSelected(stat, 'Rhône')).toBe(true);
    expect(isRegionSelected(stat, 'Vallée du Rhône')).toBe(true);
    expect(isRegionSelected(stat, 'Bourgogne')).toBe(false);
    expect(isRegionSelected(stat, '')).toBe(false);
  });

  it('projette toutes les régions dans le cadre de la carte', () => {
    for (const r of FRENCH_REGIONS) {
      const [x, y] = project(r.lon, r.lat);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(MAP_WIDTH);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(MAP_HEIGHT);
    }
    expect(FRENCH_REGIONS).toHaveLength(14);
  });
});

/* ------------------------------------------------------------ profils */

describe('dashboardKind', () => {
  it('adapte la vue au profil et au rôle', () => {
    expect(dashboardKind('negoce', 'owner')).toBe('negoce');
    expect(dashboardKind('independant', 'accountant')).toBe('negoce');
    expect(dashboardKind('restaurant', 'manager')).toBe('cellar');
    expect(dashboardKind('negoce', 'sommelier')).toBe('cellar');
    expect(dashboardKind('chaine', 'owner')).toBe('chain');
    expect(dashboardKind('chaine', 'sommelier')).toBe('cellar');
    expect(dashboardKind('chaine', 'staff')).toBe('staff');
    expect(dashboardKind('negoce', undefined)).toBe('staff');
  });
});

/* ------------------------------------------------------------ négoce */

describe('monthWindows', () => {
  it('gère le changement d’année et les fins de mois', () => {
    expect(monthWindows('2026-01-15')).toEqual({
      current: { from: '2026-01-01', to: '2026-01-15' },
      previous: { from: '2025-12-01', to: '2025-12-31' },
      previousToDate: { from: '2025-12-01', to: '2025-12-15' },
    });
    expect(monthWindows('2026-03-31').previousToDate).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});

describe('revenueSummary', () => {
  const wines = [wine('a'), wine('b', { buyPriceHT: 50 })];
  const docs = [
    doc([line({ wineId: 'a', qty: 10, unitPriceHT: 20 })], { date: '2026-03-05' }), // 200 ce mois
    doc([line({ wineId: 'b', qty: 2, unitPriceHT: 100 })], { date: '2026-02-04' }), // 200 mois dernier à date
    doc([line({ wineId: 'b', qty: 1, unitPriceHT: 100 })], { date: '2026-02-20' }), // 100 fin du mois dernier
    doc([line({ wineId: 'a', qty: 99 })], { date: '2026-03-02', status: 'draft' }), // ignoré
  ];
  const r = revenueSummary({ wines, docs, movements: [mv({ date: '2026-03-08', wineId: 'a', qty: 1, unitPriceHT: 50 })], asOf: '2026-03-10' });

  it('compare le mois en cours au même jour du mois précédent', () => {
    expect(r.current).toBe(250);
    expect(r.previousToDate).toBe(200);
    expect(r.previous).toBe(300);
    expect(r.delta).toBe(25);
    expect(r.total12).toBe(550);
  });

  it('produit 12 à 13 points mensuels et les lignes de vente', () => {
    expect(r.monthly.length).toBeGreaterThanOrEqual(12);
    expect(r.monthly.at(-1)).toMatchObject({ month: '2026-03', revenueHT: 250 });
    expect(r.sales12).toHaveLength(4);
  });

  it('delta nul si rien le mois précédent', () => {
    expect(revenueSummary({ wines, docs: [], movements: [], asOf: '2026-03-10' }).delta).toBeNull();
  });
});

describe('receivables & staleQuotes', () => {
  const inv1 = doc([line({ qty: 10, unitPriceHT: 10 })], { id: 'i1', date: '2026-01-01', dueDate: '2026-01-31' }); // 120 TTC, en retard
  const inv2 = doc([line({ qty: 5, unitPriceHT: 10 })], { id: 'i2', date: '2026-03-01', dueDate: '2026-03-31' }); // 60 TTC, à échoir
  const pay: Payment[] = [{ id: 'p', documentId: 'i1', date: '2026-02-10', amount: 20, method: 'virement', reference: '' }];

  it('calcule encours et retards', () => {
    expect(receivables([inv1, inv2], pay, '2026-03-10')).toEqual({ outstanding: 160, outstandingCount: 2, overdue: 100, overdueCount: 1, maxDaysLate: 38 });
    expect(receivables([], [], '2026-03-10').outstanding).toBe(0);
  });

  it('liste les devis envoyés depuis plus de 7 jours', () => {
    const q = (id: string, date: string, status: SaleDocument['status'] = 'sent') => ({ ...newDocument('quote', { siteId: 's1', vatRate: 20, userId: 'u', date, validityDays: 10 }), id, status });
    const res = staleQuotes([q('old', '2026-02-20'), q('recent', '2026-03-05'), q('limit', '2026-03-03'), q('draft', '2026-01-01', 'draft'), q('accepted', '2026-01-01', 'accepted')], '2026-03-10');
    expect(res.map((r) => r.doc.id)).toEqual(['old']);
    expect(res[0]).toMatchObject({ age: 18, expired: true });
  });
});

describe('topClients & topWines', () => {
  const period = { from: '2025-03-11', to: '2026-03-10' };
  it('classe les clients par CA HT net des avoirs', () => {
    const docs = [
      doc([line({ qty: 10, unitPriceHT: 10 })], { partnerId: 'p1', partnerName: 'Alpha' }),
      doc([line({ qty: 30, unitPriceHT: 10 })], { partnerId: 'p2', partnerName: 'Beta' }),
      doc([line({ qty: 25, unitPriceHT: 10 })], { partnerId: 'p2', partnerName: 'Beta', type: 'credit_note' }),
      doc([line({ qty: 99, unitPriceHT: 10 })], { partnerId: 'p3', partnerName: 'Old', date: '2024-01-01' }),
      doc([line({ qty: 99, unitPriceHT: 10 })], { partnerId: 'p4', partnerName: 'Quote', type: 'quote', status: 'sent' }),
    ];
    expect(topClients(docs, period)).toEqual([
      { id: 'p1', label: 'Alpha', amount: 100, qty: 1 },
      { id: 'p2', label: 'Beta', amount: 50, qty: 1 },
    ]);
  });

  it('classe les vins par CA', () => {
    const sales = [
      { date: '2026-03-01', wineId: 'a', siteId: 's1', qty: 2, revenueHT: 40, costHT: 20, source: 'document' as const },
      { date: '2026-03-02', wineId: 'b', siteId: 's1', qty: 1, revenueHT: 90, costHT: 50, source: 'document' as const },
      { date: '2026-03-03', wineId: 'a', siteId: 's1', qty: 3, revenueHT: 60, costHT: 30, source: 'movement' as const },
    ];
    expect(topWines(sales, (id) => id.toUpperCase())).toEqual([
      { id: 'a', label: 'A', amount: 100, qty: 5 },
      { id: 'b', label: 'B', amount: 90, qty: 1 },
    ]);
  });
});

/* ------------------------------------------------------------ cave & restaurant */

describe('stockAlerts & drinkingWindow', () => {
  const wines = [
    wine('out', { alertThreshold: 2 }),
    wine('never'), // jamais en stock, sans seuil : pas une alerte
    wine('low', { alertThreshold: 6 }),
    wine('enter', { apogeeFrom: 2027, apogeeTo: 2040 }),
    wine('leave', { apogeeFrom: 2015, apogeeTo: 2026 }),
    wine('past', { apogeeFrom: 2010, apogeeTo: 2020 }),
    wine('far', { apogeeFrom: 2035, apogeeTo: 2050 }),
    wine('empty', { apogeeFrom: 2026, apogeeTo: 2030 }),
  ];
  const stock = [lvl('out', 's1', 0), lvl('low', 's1', 3), lvl('enter', 's1', 6), lvl('leave', 's1', 4), lvl('past', 's1', 1), lvl('far', 's1', 12)];

  it('détecte ruptures, stocks bas et vins passés', () => {
    const a = stockAlerts(wines, stock, 'all', 2026);
    expect(a.out.map((w) => w.id)).toEqual(['out']);
    expect(a.low.map((w) => w.id)).toEqual(['low']);
    expect(a.past.map((w) => w.id)).toEqual(['past']);
  });

  it('classe les vins entrant et sortant de leur fenêtre', () => {
    const qty = new Map(stock.map((l) => [l.wineId, l.qty]));
    const w = drinkingWindow(wines, qty, 2026);
    expect(w.entering.map((r) => r.wine.id)).toEqual(['enter']);
    expect(w.leaving.map((r) => r.wine.id)).toEqual(['leave']);
    expect(w.past.map((r) => r.wine.id)).toEqual(['past']);
  });
});

describe('listShortages', () => {
  const wines = [wine('a', { alertThreshold: 2 }), wine('b'), wine('c', { alertThreshold: 3 }), wine('d', { alertThreshold: 2, hideFromMenu: true }), wine('e', { alertThreshold: 2 })];
  const stock = [lvl('a', 'bar', 0), lvl('a', 'cave', 12), lvl('b', 'bar', 4), lvl('c', 'bar', 0), lvl('e', 'bar', 0)];
  const list = (p: Partial<ReturnType<typeof defaultWineList>>) => ({ ...defaultWineList('fr', 'Carte'), ...p });

  it('ne retient que les vins en rupture sur les sites des cartes publiées', () => {
    const res = listShortages([list({ id: 'l1', name: 'Bar', published: true, siteIds: ['bar'], excludedWineIds: ['e'], hideOutOfStock: false }), list({ id: 'l2', name: 'Brouillon', published: false })], wines, stock);
    expect(res.map((s) => s.wine.id)).toEqual(['a', 'c']);
    expect(res[0]).toMatchObject({ lists: ['Bar'], hidden: false });
  });

  it('une carte tous sites voit le stock global ; masquage automatique signalé', () => {
    const res = listShortages([list({ id: 'l1', name: 'Salle', published: true, siteIds: [], hideOutOfStock: true })], wines, stock);
    expect(res.map((s) => s.wine.id)).toEqual(['c', 'e']);
    expect(res.every((s) => s.hidden)).toBe(true);
  });

  it('résiste à des documents incomplets', () => {
    expect(listShortages([{ published: true } as never, null as never], wines, stock).map((s) => s.wine.id)).toEqual(['c', 'e']);
  });
});

describe('openBottles', () => {
  const now = Date.parse('2026-03-10T20:00:00Z');
  const day = 86_400_000;
  const wines = [wine('bul', { color: 'bulles' }), wine('red'), wine('sweet', { color: 'doux' })];
  it('évalue la fraîcheur selon la couleur et ignore les bouteilles terminées', () => {
    const rows = openBottles(
      [
        { id: '1', wineId: 'bul', openedAt: now - 3 * day, glassesServed: 2, glassesTotal: 6, status: 'open' },
        { id: '2', wineId: 'red', openedAt: now - 2 * day, status: 'open' },
        { id: '3', wineId: 'sweet', openedAt: new Date(now - 10 * day).toISOString(), status: 'open', siteId: 'bar' },
        { id: '4', wineId: 'red', openedAt: now - 1, status: 'finished' },
        { id: '5', wineId: 'red', openedAt: now - 4 * day, status: 'open', siteId: 'cave' },
      ],
      wines,
      now,
    );
    expect(rows.map((r) => [r.id, r.freshness])).toEqual([
      ['1', 'late'],
      ['3', 'watch'],
      ['5', 'watch'],
      ['2', 'fresh'],
    ]);
    expect(rows[0]).toMatchObject({ glassesLeft: 4, ageDays: 3, label: 'Prod bul · Vin bul · 2020' });
    expect(rows[3].glassesLeft).toBeNull();
  });

  it('filtre par site actif et tolère les champs manquants', () => {
    const rows = openBottles([{ id: 'x', siteId: 'cave' }, { id: 'y', siteId: 'bar', wineLabel: 'Libre' }], wines, now, 'bar');
    expect(rows).toEqual([{ id: 'y', wineId: undefined, label: 'Libre', siteId: 'bar', ageDays: 0, glassesLeft: null, freshness: 'fresh' }]);
  });
});

describe('mouvements du jour et sorties mensuelles', () => {
  const ms = [
    mv({ id: '1', date: '2026-03-10', createdAt: 1, siteId: 's1' }),
    mv({ id: '2', date: '2026-03-10', createdAt: 3, type: 'transfer', siteId: 's2', toSiteId: 's1' }),
    mv({ id: '3', date: '2026-03-09', createdAt: 2 }),
    mv({ id: '4', date: '2026-03-10', createdAt: 4, siteId: 's3' }),
  ];
  it('trie les mouvements du jour, transferts entrants compris', () => {
    expect(todayMovements(ms, '2026-03-10').map((m) => m.id)).toEqual(['4', '2', '1']);
    expect(todayMovements(ms, '2026-03-10', 's1').map((m) => m.id)).toEqual(['2', '1']);
  });

  it('ventile les sorties entre service et pertes', () => {
    const pts = monthlyExits(
      [mv({ date: '2026-03-01', qty: 5, reason: 'consommation' }), mv({ date: '2026-03-02', qty: 2, reason: 'casse' }), mv({ date: '2026-02-02', qty: 3, reason: 'verre' }), mv({ date: '2026-02-02', qty: 9, type: 'in', reason: 'achat' }), mv({ date: '2024-02-02', qty: 9 })],
      '2026-03-10',
    );
    expect(pts.at(-1)).toEqual({ month: '2026-03', served: 5, losses: 2 });
    expect(pts.at(-2)).toEqual({ month: '2026-02', served: 3, losses: 0 });
    expect(pts.reduce((s, p) => s + p.served + p.losses, 0)).toBe(10);
  });
});

/* ------------------------------------------------------------ chaîne */

describe('siteComparison', () => {
  it('compare les sites et consolide le groupe', () => {
    const wines = [wine('a', { alertThreshold: 5 }), wine('b', { buyPriceHT: 100, sellPriceHT: 150 })];
    const stock = [lvl('a', 's1', 3), lvl('a', 's2', 10), lvl('b', 's1', 0), lvl('b', 's2', 7)];
    const { rows, total } = siteComparison([site('s1', 'Paris'), site('s2', 'Lyon'), { ...site('s3'), isArchived: true }], wines, stock);
    expect(rows.map((r) => [r.site.id, r.bottles, r.costHT, r.refs, r.out, r.low])).toEqual([
      ['s1', 3, 30, 1, 1, 1],
      ['s2', 17, 800, 2, 0, 0],
    ]);
    expect(rows[1].share).toBeCloseTo(0.85);
    expect(total).toEqual({ bottles: 20, costHT: 830, sellHT: 1310, refs: 2, out: 1, low: 1 });
    expect(chainInsight({ wines: 2, rows })).toMatchObject({ key: 'home.insight.siteAlerts', site: 'Paris', n: 2 });
  });
});

/* ------------------------------------------------------------ prise en main & accroche */

describe('onboarding', () => {
  const base = { wines: 0, logo: false, brand: false, carte: true, lists: 0, published: 0, members: 1, inventories: 0 };
  it('liste les étapes selon les modules', () => {
    expect(onboardingSteps(base).map((s) => s.id)).toEqual(['wines', 'logo', 'brand', 'list', 'team', 'inventory', 'publish']);
    expect(onboardingSteps({ ...base, carte: false }).map((s) => s.id)).toEqual(['wines', 'logo', 'brand', 'team', 'inventory']);
  });

  it('mesure la progression et chaque étape renvoie vers une page', () => {
    const steps = onboardingSteps({ ...base, wines: 3, logo: true, members: 2, lists: 1 });
    expect(steps.filter((s) => s.done).map((s) => s.id)).toEqual(['wines', 'logo', 'list', 'team']);
    expect(onboardingProgress(steps)).toBeCloseTo(4 / 7);
    expect(steps.every((s) => s.to.startsWith('/'))).toBe(true);
    expect(onboardingProgress(onboardingSteps({ ...base, wines: 1, logo: true, brand: true, lists: 1, published: 1, members: 3, inventories: 1 }))).toBe(1);
  });
});

describe('accroches', () => {
  it('négoce : retards > devis > tendance > ruptures', () => {
    const recv = { outstanding: 500, outstandingCount: 2, overdue: 300, overdueCount: 1, maxDaysLate: 12 };
    expect(negoceInsight({ wines: 0, revenue: null, receivables: null, stale: 0, out: 0 }).key).toBe('home.insight.empty');
    expect(negoceInsight({ wines: 3, revenue: null, receivables: recv, stale: 2, out: 0 })).toMatchObject({ key: 'home.insight.overdue', n: 1, amount: 300, tone: 'attention' });
    expect(negoceInsight({ wines: 3, revenue: null, receivables: { ...recv, overdueCount: 0 }, stale: 2, out: 0 }).key).toBe('home.insight.quotes');
    expect(negoceInsight({ wines: 3, revenue: { current: 10, delta: 12 }, receivables: null, stale: 0, out: 0 })).toMatchObject({ key: 'home.insight.revenueUp', pct: 12 });
    expect(negoceInsight({ wines: 3, revenue: { current: 10, delta: 0 }, receivables: null, stale: 0, out: 0 }).key).toBe('home.insight.revenueFlat');
    expect(negoceInsight({ wines: 3, revenue: { current: 10, delta: -30 }, receivables: null, stale: 0, out: 0 })).toMatchObject({ key: 'home.insight.revenueDown', pct: 30 });
    expect(negoceInsight({ wines: 3, revenue: { current: 0, delta: null }, receivables: null, stale: 0, out: 4 })).toMatchObject({ key: 'home.insight.out', n: 4 });
    expect(negoceInsight({ wines: 3, revenue: null, receivables: null, stale: 0, out: 0 }).key).toBe('home.insight.calm');
  });

  it('cave, chaîne et personnel', () => {
    expect(cellarInsight({ wines: 2, shortages: 1, late: 3, leaving: 0, out: 0, low: 0 }).key).toBe('home.insight.listOut');
    expect(cellarInsight({ wines: 2, shortages: 0, late: 3, leaving: 0, out: 0, low: 0 }).key).toBe('home.insight.bottlesLate');
    expect(cellarInsight({ wines: 2, shortages: 0, late: 0, leaving: 2, out: 0, low: 0 }).key).toBe('home.insight.leaving');
    expect(cellarInsight({ wines: 2, shortages: 0, late: 0, leaving: 0, out: 1, low: 1 })).toMatchObject({ key: 'home.insight.low', n: 2 });
    expect(chainInsight({ wines: 1, rows: [] }).key).toBe('home.insight.chainCalm');
    expect(staffInsight({ wines: 0, today: 0, out: 0, low: 0 }).key).toBe('home.insight.emptyStaff');
    expect(staffInsight({ wines: 4, today: 3, out: 0, low: 0 })).toMatchObject({ key: 'home.insight.today', n: 3 });
  });
});
