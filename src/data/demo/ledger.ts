import type { MovementReason, MovementType, Wine } from '@/types';
import type { Op } from '../store';
import { buildMovementOps, stockDeltas, stockId, type Actor } from '../stock';

export const DAY_MS = 86_400_000;

/** Dates relatives à « maintenant » (ISO yyyy-mm-dd, comme `today()`). */
export interface Clock {
  now: number;
  today: string;
  iso: (ago: number) => string;
  ts: (date: string, offsetMs?: number) => number;
}

export function makeClock(now: number): Clock {
  const iso = (ago: number) => new Date(now - ago * DAY_MS).toISOString().slice(0, 10);
  return {
    now,
    today: iso(0),
    iso,
    // 06:00 UTC + décalage : les événements générés sont tous antérieurs à aujourd'hui.
    ts: (date, offsetMs = 0) => Math.min(Date.parse(`${date}T06:00:00Z`) + offsetMs, now - 60_000),
  };
}

export interface Rng {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(arr: readonly T[]) => T;
  chance: (p: number) => boolean;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32) : la démo est identique à chaque création. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}

export const seedOf = (s: string): number => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

export interface LedgerEvent {
  wineId: string;
  siteId: string;
  toSiteId?: string;
  type: MovementType;
  qty: number;
  reason: MovementReason;
  date: string;
  unitCostHT?: number;
  unitPriceHT?: number;
  partnerId?: string;
  documentId?: string;
  note?: string;
}

interface Entry extends LedgerEvent {
  seq: number;
  prio: number;
}

// Dans une même journée : stock d'ouverture, entrées, transferts, sorties, puis ajustements d'inventaire.
const PRIO: Record<MovementType, number> = { in: 1, transfer: 2, out: 3, adjust: 4 };
const key = (wineId: string, siteId: string) => stockId(wineId, siteId);

/**
 * Journal de stock simulé : tous les mouvements de la démo y passent, dans l'ordre chronologique,
 * pour garantir stock = Σ mouvements et un stock jamais négatif.
 */
export class Ledger {
  private entries: Entry[] = [];

  add(e: LedgerEvent, prio = PRIO[e.type]): void {
    if (!e.qty) return;
    this.entries.push({ ...e, seq: this.entries.length, prio });
  }

  sorted(): Entry[] {
    return [...this.entries].sort((a, b) => a.date.localeCompare(b.date) || a.prio - b.prio || a.seq - b.seq);
  }

  /** Variations par (vin, site) dans l'ordre chronologique. */
  private walk(fn: (e: Entry, k: string, delta: number) => void): void {
    for (const e of this.sorted()) for (const d of stockDeltas(e)) fn(e, key(e.wineId, d.siteId), d.delta);
  }

  /** Stock d'un vin sur un site à une date, avant les événements de priorité ≥ `beforePrio` ce jour-là. */
  balanceAt(wineId: string, siteId: string, date: string, beforePrio = 99): number {
    const k = key(wineId, siteId);
    let n = 0;
    this.walk((e, kk, d) => {
      if (kk === k && (e.date < date || (e.date === date && e.prio < beforePrio))) n += d;
    });
    return n;
  }

  /** Sorties (ventes, consommations, transferts sortants, ajustements négatifs) d'un vin sur un site dans ]from, to]. */
  outflow(wineId: string, siteId: string, fromExclusive: string, toInclusive: string): number {
    let n = 0;
    for (const e of this.entries) {
      if (e.wineId !== wineId || e.date <= fromExclusive || e.date > toInclusive) continue;
      for (const d of stockDeltas(e)) if (d.siteId === siteId && d.delta < 0) n -= d.delta;
    }
    return n;
  }

  /**
   * Stock d'ouverture nécessaire pour atteindre la cible finale sans jamais passer sous zéro.
   * Si les mouvements l'imposent, le stock final dépasse la cible.
   */
  openingNeeds(targets: { wineId: string; siteId: string; target: number }[]): { wineId: string; siteId: string; qty: number }[] {
    const bal = new Map<string, number>();
    const min = new Map<string, number>();
    this.walk((_e, k, d) => {
      const v = (bal.get(k) ?? 0) + d;
      bal.set(k, v);
      min.set(k, Math.min(min.get(k) ?? 0, v));
    });
    const out: { wineId: string; siteId: string; qty: number }[] = [];
    const seen = new Set<string>();
    const push = (wineId: string, siteId: string, target: number) => {
      const k = key(wineId, siteId);
      if (seen.has(k)) return;
      seen.add(k);
      const qty = Math.max(target - (bal.get(k) ?? 0), -(min.get(k) ?? 0), 0);
      if (qty > 0) out.push({ wineId, siteId, qty });
    };
    for (const t of targets) push(t.wineId, t.siteId, t.target);
    for (const e of this.entries) for (const d of stockDeltas(e)) push(e.wineId, d.siteId, 0);
    return out;
  }

  /** Mouvements (forme exacte de `buildMovementOps`, sans incréments) + stock final par (vin, site) + dernier coût d'achat. */
  build(orgId: string, wines: Map<string, Wine>, actor: Actor, clock: Clock): { ops: Op[]; balances: Map<string, { wineId: string; siteId: string; qty: number }>; lastCost: Map<string, number> } {
    const ops: Op[] = [];
    const balances = new Map<string, { wineId: string; siteId: string; qty: number }>();
    const lastCost = new Map<string, number>();
    let lastDate = '';
    let n = 0;
    for (const e of this.sorted()) {
      const wine = wines.get(e.wineId);
      if (!wine) continue;
      n = e.date === lastDate ? n + 1 : 0;
      lastDate = e.date;
      if (e.type === 'in' && e.reason === 'achat' && e.unitCostHT) lastCost.set(e.wineId, e.unitCostHT);
      const unitCostHT = e.unitCostHT ?? lastCost.get(e.wineId) ?? wine.buyPriceHT;
      const createdAt = clock.ts(e.date, e.prio * 3_600_000 + n * 1000);
      ops.push(...buildMovementOps(orgId, [{ ...e, wine, unitCostHT }], actor, createdAt).filter((o) => o.op === 'set'));
      for (const d of stockDeltas(e)) {
        const k = key(e.wineId, d.siteId);
        const b = balances.get(k) ?? { wineId: e.wineId, siteId: d.siteId, qty: 0 };
        b.qty += d.delta;
        balances.set(k, b);
      }
    }
    return { ops, balances, lastCost };
  }
}
