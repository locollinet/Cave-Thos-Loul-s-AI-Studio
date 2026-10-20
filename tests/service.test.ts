import { describe, expect, it } from 'vitest';
import type { Movement, Wine } from '@/types';
import type { Op } from '@/data/store';
import { stockId } from '@/data/stock';
import {
  buildBottleOutOps,
  buildFinishOps,
  buildLossOps,
  buildOpenBottleOps,
  buildServeOps,
  buildUndoBottleOutOps,
  buildUndoOpenOps,
  DAY,
  DEFAULT_FRESHNESS_DAYS,
  durationParts,
  estimatedRevenue,
  freshness,
  freshnessAlerts,
  glassesPerBottle,
  glassesRemaining,
  HOUR,
  isoDay,
  lossRate,
  matchesQuery,
  openDurationMs,
  servedField,
  servedOn,
  todayKpis,
} from '@/modules/service/logic';
import { buildServiceDemoOps } from '@/modules/service/demo';
import type { OpenBottle } from '@/modules/service/types';

const NOW = new Date(2026, 9, 19, 20, 30).getTime();
const actor = { userId: 'u1', userName: 'Léa' };

const wine = (over: Partial<Wine> = {}): Wine => ({
  id: 'w1',
  producer: 'Domaine Huet',
  name: 'Vouvray Le Haut-Lieu Sec',
  vintage: '2020',
  color: 'blanc',
  formatCl: 75,
  region: 'Loire',
  alertThreshold: 2,
  canonicalKey: 'k',
  createdAt: 0,
  updatedAt: 0,
  byGlass: { enabled: true, glassCl: 12.5, priceTTC: 14 },
  ...over,
});

const bottle = (over: Partial<OpenBottle> = {}): OpenBottle => ({
  id: 'b1',
  wineId: 'w1',
  wineLabel: 'Huet',
  color: 'blanc',
  siteId: 's1',
  openedAt: NOW - 2 * HOUR,
  openedBy: 'Léa',
  glassCl: 12.5,
  glassesTotal: 6,
  glassesServed: 0,
  priceTTC: 14,
  status: 'open',
  lostGlasses: 0,
  ...over,
});

const day = (ts: number, n: number): Partial<OpenBottle> => ({ [servedField(ts)]: n });

/** Applique des ops en mémoire comme le store local. */
function apply(ops: Op[], db: Record<string, Record<string, unknown>> = {}) {
  for (const o of ops) {
    if (o.op === 'delete') delete db[o.path];
    else if (o.op === 'set') db[o.path] = o.merge ? { ...(db[o.path] ?? {}), ...o.data } : { ...o.data };
    else {
      const cur = db[o.path] ?? {};
      db[o.path] = { ...cur, ...(o.data ?? {}), [o.field]: ((cur[o.field] as number) ?? 0) + o.by };
    }
  }
  return db;
}

describe('verres', () => {
  it('compte les verres par bouteille', () => {
    expect(glassesPerBottle(75, 12.5)).toBe(6);
    expect(glassesPerBottle(75, 15)).toBe(5);
    expect(glassesPerBottle(150, 12.5)).toBe(12);
    expect(glassesPerBottle(37.5, 10)).toBe(3);
    expect(glassesPerBottle(75, 0)).toBe(0);
  });

  it('calcule les verres restants (servis + perdus)', () => {
    expect(glassesRemaining(bottle({ glassesServed: 2 }))).toBe(4);
    expect(glassesRemaining(bottle({ glassesServed: 2, lostGlasses: 1 }))).toBe(3);
    expect(glassesRemaining(bottle({ glassesServed: 7 }))).toBe(0);
  });

  it('mesure la durée d’ouverture', () => {
    expect(openDurationMs(bottle(), NOW)).toBe(2 * HOUR);
    expect(openDurationMs(bottle({ closedAt: NOW - HOUR }), NOW)).toBe(HOUR);
    expect(durationParts(DAY + 3 * HOUR + 5 * 60_000)).toEqual({ days: 1, hours: 3, minutes: 5 });
  });

  it('recette estimée et taux de perte', () => {
    expect(estimatedRevenue([bottle({ glassesServed: 3 }), bottle({ glassesServed: 2, priceTTC: undefined })])).toBe(42);
    expect(lossRate([bottle({ glassesServed: 4, lostGlasses: 2 }), bottle({ glassesServed: 6, lostGlasses: 0 })])).toBeCloseTo(2 / 12);
    expect(lossRate([])).toBe(0);
  });

  it('recherche par producteur, nom, millésime, région (sans accents)', () => {
    const w = wine();
    expect(matchesQuery(w, 'huet 2020')).toBe(true);
    expect(matchesQuery(w, 'loire')).toBe(true);
    expect(matchesQuery(w, 'VOUVRAY')).toBe(true);
    expect(matchesQuery(wine({ producer: 'Château Rayas' }), 'chateau rayas')).toBe(true);
    expect(matchesQuery(w, 'bordeaux')).toBe(false);
    expect(matchesQuery(w, '  ')).toBe(true);
  });
});

describe('fraîcheur', () => {
  it('bulles > 1 jour, tranquilles > 3 jours, doux > 14 jours', () => {
    expect(freshness(bottle({ color: 'bulles', openedAt: NOW - 25 * HOUR }), NOW).level).toBe('expired');
    expect(freshness(bottle({ color: 'bulles', openedAt: NOW - 20 * HOUR }), NOW).level).toBe('soon');
    expect(freshness(bottle({ color: 'bulles', openedAt: NOW - 2 * HOUR }), NOW).level).toBe('fresh');
    expect(freshness(bottle({ color: 'rouge', openedAt: NOW - 2 * DAY }), NOW).level).toBe('fresh');
    expect(freshness(bottle({ color: 'rouge', openedAt: NOW - 3 * DAY - HOUR }), NOW).level).toBe('expired');
    expect(freshness(bottle({ color: 'doux', openedAt: NOW - 10 * DAY }), NOW).level).toBe('fresh');
    expect(freshness(bottle({ color: 'doux', openedAt: NOW - 15 * DAY }), NOW).level).toBe('expired');
    expect(freshness(bottle({ color: 'spiritueux', openedAt: NOW - 13 * DAY }), NOW).group).toBe('sweet');
  });

  it('accepte une table de durées personnalisée', () => {
    const b = bottle({ color: 'rouge', openedAt: NOW - 2 * DAY });
    expect(freshness(b, NOW, { ...DEFAULT_FRESHNESS_DAYS, still: 1 }).level).toBe('expired');
  });

  it('compte les alertes sur les bouteilles ouvertes seulement', () => {
    const old = { color: 'bulles' as const, openedAt: NOW - 2 * DAY };
    expect(freshnessAlerts([bottle(old), bottle({ ...old, status: 'finished' }), bottle()], NOW)).toBe(1);
  });
});

describe('écritures', () => {
  it('ouvre une bouteille : mouvement verre + stock −1 + fiche, en une seule écriture', () => {
    const res = buildOpenBottleOps('o1', wine(), 's1', actor, NOW, 'b1')!;
    expect(res.ops).toHaveLength(3);
    const [mv, inc, doc] = res.ops;
    expect(mv).toMatchObject({ op: 'set', data: { type: 'out', qty: 1, reason: 'verre', siteId: 's1', wineId: 'w1', date: isoDay(NOW), userName: 'Léa' } });
    expect(inc).toMatchObject({ op: 'inc', path: `orgs/o1/stock/${stockId('w1', 's1')}`, field: 'qty', by: -1 });
    expect(doc).toMatchObject({ op: 'set', path: 'orgs/o1/openBottles/b1', data: { glassesTotal: 6, glassesServed: 0, status: 'open', openedAt: NOW, priceTTC: 14 } });
    expect(res.bottle.movementId).toBe(mv.path.split('/').pop());
    expect(res.bottle.wineLabel).toContain('Domaine Huet');
  });

  it('refuse d’ouvrir un vin non servi au verre', () => {
    expect(buildOpenBottleOps('o1', wine({ byGlass: undefined }), 's1', actor, NOW)).toBeNull();
    expect(buildOpenBottleOps('o1', wine({ byGlass: { enabled: false, glassCl: 12.5 } }), 's1', actor, NOW)).toBeNull();
    expect(buildOpenBottleOps('o1', wine({ formatCl: 10 }), 's1', actor, NOW)).toBeNull();
  });

  it('annule une ouverture par un mouvement compensatoire', () => {
    const { bottle: b } = buildOpenBottleOps('o1', wine(), 's1', actor, NOW, 'b1')!;
    const ops = buildUndoOpenOps('o1', wine(), b, actor, 'annul', NOW);
    expect(ops[0]).toMatchObject({ op: 'set', data: { type: 'in', reason: 'retour', qty: 1, note: 'annul' } });
    expect(ops[1]).toMatchObject({ op: 'inc', by: 1 });
    expect(ops[2]).toEqual({ op: 'delete', path: 'orgs/o1/openBottles/b1' });
  });

  it('sert un verre et alimente le compteur du jour', () => {
    const ops = buildServeOps('o1', bottle({ glassesServed: 2 }), 1, NOW)!;
    expect(ops).toEqual([
      { op: 'inc', path: 'orgs/o1/openBottles/b1', field: 'glassesServed', by: 1, data: { updatedAt: NOW } },
      { op: 'inc', path: 'orgs/o1/openBottles/b1', field: servedField(NOW), by: 1 },
    ]);
    expect(servedField(NOW)).toBe('served_20261019');
  });

  it('ne sert pas au-delà du total ni sur une bouteille fermée', () => {
    expect(buildServeOps('o1', bottle({ glassesServed: 6 }), 1, NOW)).toBeNull();
    expect(buildServeOps('o1', bottle({ glassesServed: 4, lostGlasses: 2 }), 1, NOW)).toBeNull();
    expect(buildServeOps('o1', bottle({ status: 'finished' }), 1, NOW)).toBeNull();
    expect(buildServeOps('o1', bottle({ glassesServed: 0 }), -1, NOW)).toBeNull();
  });

  it('corrige −1 sans rendre le compteur du jour négatif', () => {
    const b = bottle({ glassesServed: 3, ...day(NOW, 1) });
    expect(buildServeOps('o1', b, -1, NOW)).toHaveLength(2);
    const yesterday = bottle({ glassesServed: 3 });
    const ops = buildServeOps('o1', yesterday, -1, NOW)!;
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ field: 'glassesServed', by: -1 });
  });

  it('enchaîne ouverture, 3 verres, fin de bouteille', () => {
    const res = buildOpenBottleOps('o1', wine(), 's1', actor, NOW, 'b1')!;
    const db = apply(res.ops, { [`orgs/o1/stock/${stockId('w1', 's1')}`]: { qty: 5 } });
    const read = () => db['orgs/o1/openBottles/b1'] as unknown as OpenBottle;
    for (let i = 0; i < 3; i++) apply(buildServeOps('o1', read(), 1, NOW)!, db);
    expect(read().glassesServed).toBe(3);
    expect(servedOn(read(), NOW)).toBe(3);
    expect((db[`orgs/o1/stock/${stockId('w1', 's1')}`] as { qty: number }).qty).toBe(4);
    apply(buildFinishOps('o1', read(), NOW + HOUR)!, db);
    expect(read()).toMatchObject({ status: 'finished', closedAt: NOW + HOUR, lostGlasses: 3 });
    expect(buildFinishOps('o1', read(), NOW)).toBeNull();
  });

  it('déclare une perte partielle ou écarte la bouteille', () => {
    const b = bottle({ glassesServed: 2 });
    expect(buildLossOps('o1', b, 1, NOW)).toEqual([{ op: 'inc', path: 'orgs/o1/openBottles/b1', field: 'lostGlasses', by: 1, data: { updatedAt: NOW } }]);
    expect(buildLossOps('o1', b, 10, NOW)).toEqual([
      { op: 'set', path: 'orgs/o1/openBottles/b1', merge: true, data: { status: 'discarded', closedAt: NOW, updatedAt: NOW, lostGlasses: 4 } },
    ]);
    expect(buildLossOps('o1', b, 0, NOW)).toBeNull();
    expect(buildLossOps('o1', bottle({ status: 'discarded' }), 1, NOW)).toBeNull();
  });

  it('sortie bouteille : refusée sans stock, annulée par un retour', () => {
    expect(buildBottleOutOps('o1', wine(), 's1', 0, actor, NOW)).toBeNull();
    const out = buildBottleOutOps('o1', wine(), 's1', 3, actor, NOW)!;
    expect(out[0]).toMatchObject({ data: { type: 'out', reason: 'vente', qty: 1 } });
    expect(out[1]).toMatchObject({ op: 'inc', by: -1 });
    const undo = buildUndoBottleOutOps('o1', wine(), 's1', actor, 'annul', NOW);
    expect(undo[0]).toMatchObject({ data: { type: 'in', reason: 'retour', qty: 1 } });
    expect(undo[1]).toMatchObject({ op: 'inc', by: 1 });
  });
});

describe('indicateurs du jour', () => {
  const mv = (over: Partial<Movement>): Movement => ({
    id: Math.random().toString(36),
    date: isoDay(NOW),
    wineId: 'w1',
    wineLabel: 'x',
    siteId: 's1',
    type: 'out',
    qty: 1,
    reason: 'vente',
    userId: 'u',
    userName: 'u',
    createdAt: NOW - HOUR,
    ...over,
  });

  it('agrège verres, recette, sorties nettes et alertes du site', () => {
    const bottles = [
      bottle({ glassesServed: 4, ...day(NOW, 3) }),
      bottle({ id: 'b2', glassesServed: 2, ...day(NOW - DAY, 2), color: 'bulles', openedAt: NOW - 2 * DAY }),
      bottle({ id: 'b3', siteId: 's2', glassesServed: 5, ...day(NOW, 5) }),
    ];
    const movements = [
      mv({}),
      mv({ reason: 'verre' }),
      mv({ type: 'in', reason: 'retour' }),
      mv({ qty: 2, createdAt: NOW - 2 * DAY }),
      mv({ siteId: 's2' }),
      mv({ type: 'transfer', reason: 'transfert', toSiteId: 's2' }),
    ];
    expect(todayKpis(bottles, movements, 's1', NOW)).toEqual({ glassesServed: 3, revenueTTC: 42, bottlesOut: 1, freshnessAlerts: 1, openBottles: 2 });
  });
});

describe('données de démo', () => {
  it('ouvre 3 bouteilles au verre avec leurs sorties de stock', () => {
    const wines = [wine({ id: 'a' }), wine({ id: 'b', color: 'bulles' }), wine({ id: 'c', byGlass: undefined }), wine({ id: 'd', color: 'rouge' }), wine({ id: 'e' })];
    const ops = buildServiceDemoOps('o1', 's1', wines, NOW);
    const docs = ops.filter((o) => o.path.includes('/openBottles/'));
    const moves = ops.filter((o) => o.path.includes('/movements/'));
    const incs = ops.filter((o) => o.op === 'inc');
    expect(docs).toHaveLength(3);
    expect(moves).toHaveLength(3);
    expect(incs).toHaveLength(3);
    expect(moves.every((o) => o.op === 'set' && o.data.reason === 'verre' && o.data.type === 'out')).toBe(true);
    expect(incs.every((o) => o.op === 'inc' && o.by === -1 && o.path.endsWith('__s1'))).toBe(true);
    const bottles = docs.map((o) => (o as Extract<Op, { op: 'set' }>).data as unknown as OpenBottle);
    expect(bottles.map((b) => b.wineId)).toEqual(['a', 'b', 'd']);
    expect(bottles.every((b) => b.glassesServed <= b.glassesTotal && b.status === 'open')).toBe(true);
    expect(todayKpis(bottles, [], 's1', NOW).glassesServed).toBe(3);
    expect(freshnessAlerts(bottles, NOW)).toBeGreaterThanOrEqual(1);
  });

  it('ne fait rien sans vin au verre', () => {
    expect(buildServiceDemoOps('o1', 's1', [wine({ byGlass: undefined })], NOW)).toEqual([]);
  });
});
