import { describe, expect, it } from 'vitest';
import type { Movement, OrgProfile, StockLevel } from '@/types';
import type { Op } from '@/data/store';
import { buildFullDemoOps } from '@/data/demoSetup';
import { emptyLegal } from '@/app/org';
import { PROFILE_MODULES } from '@/registry';
import { counterSalesHT, computeResult } from '@/modules/compta/result';

const ORG = 'o1';
const MAIN = 'main';
const NOW = Date.parse('2026-10-19T14:00:00Z');

function apply(ops: Op[]) {
  const db = new Map<string, Record<string, unknown>>();
  for (const o of ops) {
    if (o.op === 'delete') db.delete(o.path);
    else if (o.op === 'set') db.set(o.path, o.merge ? { ...(db.get(o.path) ?? {}), ...o.data } : { ...o.data });
    else {
      const cur = db.get(o.path) ?? {};
      db.set(o.path, { ...cur, ...(o.data ?? {}), [o.field]: ((cur[o.field] as number) ?? 0) + o.by });
    }
  }
  const rows = <T,>(coll: string) => [...db.entries()].filter(([p]) => p.startsWith(`orgs/${ORG}/${coll}/`)).map(([, v]) => v as T);
  return { db, rows };
}

const full = (profile: OrgProfile) =>
  apply(buildFullDemoOps(ORG, MAIN, profile, { orgName: 'Le Grand Palais', modules: PROFILE_MODULES[profile], locale: 'fr', defaultVatRate: 20, legal: emptyLegal(), now: NOW }));

describe.each(['negoce', 'independant', 'restaurant', 'chaine'] as OrgProfile[])('full demo — %s', (profile) => {
  const { rows } = full(profile);
  const stock = rows<StockLevel>('stock');
  const moves = rows<Movement>('movements');

  it('keeps every stock level equal to its movements and never negative', () => {
    const sum = new Map<string, number>();
    const add = (wine: string, site: string, n: number) => sum.set(`${wine}__${site}`, (sum.get(`${wine}__${site}`) ?? 0) + n);
    for (const m of moves) {
      if (m.type === 'in') add(m.wineId, m.siteId, m.qty);
      else if (m.type === 'out') add(m.wineId, m.siteId, -m.qty);
      else if (m.type === 'adjust') add(m.wineId, m.siteId, m.qty);
      else if (m.type === 'transfer') {
        add(m.wineId, m.siteId, -m.qty);
        add(m.wineId, m.toSiteId!, m.qty);
      }
    }
    for (const s of stock) {
      expect(s.qty, `${s.id}`).toBeGreaterThanOrEqual(0);
      expect(s.qty, `${s.id}`).toBe(sum.get(s.id) ?? 0);
    }
  });

  it('adds open bottles for hospitality (wines served by the glass), offers only with trade', () => {
    const bottles = rows<{ siteId: string; status: string }>('openBottles');
    const offers = rows<{ id: string }>('offers');
    expect(bottles.length > 0).toBe(profile === 'restaurant' || profile === 'chaine');
    expect(offers.length > 0).toBe(PROFILE_MODULES[profile].includes('negoce'));
    if (bottles.length) expect(moves.filter((m) => m.reason === 'verre')).toHaveLength(bottles.length);
  });
});

describe('front-of-house revenue', () => {
  it('counts unbilled « vente » exits only, at their net price', () => {
    const base = { id: 'x', wineId: 'w', wineLabel: 'w', siteId: 's', userId: 'u', userName: 'u', createdAt: 0 };
    const m: Movement[] = [
      { ...base, date: '2026-03-01', type: 'out', qty: 2, reason: 'vente', unitPriceHT: 50 },
      { ...base, date: '2026-03-01', type: 'out', qty: 1, reason: 'vente', unitPriceHT: 40, documentId: 'inv' },
      { ...base, date: '2026-03-01', type: 'out', qty: 3, reason: 'casse', unitPriceHT: 40 },
      { ...base, date: '2025-03-01', type: 'out', qty: 3, reason: 'vente', unitPriceHT: 40 },
    ];
    expect(counterSalesHT(m, 2026)).toBe(100);
    const r = computeResult({ year: 2026, docs: [], payments: [], purchases: [], expenses: [], assets: [], counterSales: m, counterVatRate: 20 });
    expect(r.revenueHT).toBe(100);
    expect(r.cashIn).toBe(120);
  });

  it('gives the chain demo a positive revenue for the current year', () => {
    const { rows } = full('chaine');
    const r = computeResult({ year: 2026, docs: [], payments: [], purchases: rows('purchaseInvoices'), expenses: rows('expenses'), assets: rows('assets'), counterSales: rows('movements') });
    expect(r.revenueHT).toBeGreaterThan(0);
  });
});
