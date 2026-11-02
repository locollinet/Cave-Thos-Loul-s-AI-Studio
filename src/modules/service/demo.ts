import type { Wine } from '@/types';
import type { Op } from '@/data/store';
import type { Actor } from '@/data/stock';
import { buildOpenBottleOps, DAY, glassesRemaining, HOUR, servedField } from './logic';
import type { OpenBottle } from './types';

const DEMO_ACTOR = { userId: 'demo-service', userName: 'Service' };

/** Scénarios : ouverte ce soir, hier, et une bouteille à surveiller (fraîcheur). */
const SCENARIOS: { ageMs: number; servedBefore: number; servedToday: number }[] = [
  { ageMs: 2 * HOUR, servedBefore: 0, servedToday: 2 },
  { ageMs: 1 * DAY + 3 * HOUR, servedBefore: 2, servedToday: 1 },
  { ageMs: 4 * DAY, servedBefore: 3, servedToday: 0 },
];

/**
 * Trois bouteilles ouvertes au verre pour la démo (vins `byGlass.enabled` uniquement),
 * avec leurs sorties de stock « verre » cohérentes avec `buildMovementOps`.
 */
export function buildServiceDemoOps(orgId: string, siteId: string, wines: Wine[], now = Date.now(), actor: Actor = DEMO_ACTOR): Op[] {
  const picks = wines.filter((w) => w.byGlass?.enabled && !w.isArchived).slice(0, SCENARIOS.length);
  const ops: Op[] = [];
  picks.forEach((w, i) => {
    const s = SCENARIOS[i];
    const openedAt = now - s.ageMs;
    const res = buildOpenBottleOps(orgId, w, siteId, actor, openedAt, `demo-open-${w.id}`);
    if (!res) return;
    const bottle: OpenBottle = { ...res.bottle };
    const served = (n: number, at: number) => {
      if (n <= 0) return;
      bottle.glassesServed += n;
      bottle[servedField(at)] = (bottle[servedField(at)] ?? 0) + n;
    };
    served(Math.min(s.servedBefore, bottle.glassesTotal), openedAt + 10 * 60_000);
    served(Math.min(s.servedToday, glassesRemaining(bottle)), now - 5 * 60_000);
    ops.push(...res.ops.filter((o) => o.op !== 'set' || !o.path.includes('/openBottles/')), {
      op: 'set',
      path: `orgs/${orgId}/openBottles/${bottle.id}`,
      data: Object.fromEntries(Object.entries(bottle).filter(([, v]) => v !== undefined)),
    });
  });
  return ops;
}
