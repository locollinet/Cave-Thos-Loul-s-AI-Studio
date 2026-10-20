import type { Movement, Wine, WineColor } from '@/types';
import type { Op } from '@/data/store';
import { buildMovementOps, type Actor } from '@/data/stock';
import { norm, wineLabel } from '@/lib/wine';
import { uid } from '@/lib/utils';
import type { FreshnessGroup, FreshnessLevel, OpenBottle, ServedDayField } from './types';

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/* ------------------------------------------------------------ dates (jour local du service) */

const pad = (n: number) => String(n).padStart(2, '0');

/** Jour local au format ISO `YYYY-MM-DD`. */
export const isoDay = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Nom du compteur journalier de verres servis. */
export const servedField = (ts: number): ServedDayField => `served_${isoDay(ts).replaceAll('-', '')}`;

export const servedOn = (b: OpenBottle, ts: number): number => Math.max(0, b[servedField(ts)] ?? 0);

/* ------------------------------------------------------------ verres */

export const glassesPerBottle = (formatCl: number, glassCl: number): number =>
  glassCl > 0 && formatCl > 0 ? Math.floor(formatCl / glassCl + 1e-9) : 0;

export const glassesRemaining = (b: Pick<OpenBottle, 'glassesTotal' | 'glassesServed' | 'lostGlasses'>): number =>
  Math.max(0, b.glassesTotal - b.glassesServed - (b.lostGlasses ?? 0));

export const isServable = (w: Wine): boolean => !!w.byGlass?.enabled && glassesPerBottle(w.formatCl, w.byGlass.glassCl) >= 1;

export const openDurationMs = (b: Pick<OpenBottle, 'openedAt' | 'closedAt'>, now = Date.now()): number =>
  Math.max(0, (b.closedAt ?? now) - b.openedAt);

export function durationParts(ms: number): { days: number; hours: number; minutes: number } {
  const m = Math.max(0, Math.floor(ms / 60_000));
  return { days: Math.floor(m / 1440), hours: Math.floor((m % 1440) / 60), minutes: m % 60 };
}

/* ------------------------------------------------------------ fraîcheur */

export const FRESHNESS_GROUP: Record<WineColor, FreshnessGroup> = {
  bulles: 'sparkling',
  rouge: 'still',
  blanc: 'still',
  rose: 'still',
  orange: 'still',
  autre: 'still',
  doux: 'sweet',
  spiritueux: 'sweet',
};

/** Durée de conservation après ouverture, en jours (configurable). */
export const DEFAULT_FRESHNESS_DAYS: Record<FreshnessGroup, number> = { sparkling: 1, still: 3, sweet: 14 };

/** Part de la durée de conservation à partir de laquelle on prévient (« à écouler »). */
export const SOON_RATIO = 0.75;

export function freshness(
  b: Pick<OpenBottle, 'openedAt' | 'closedAt' | 'color'>,
  now = Date.now(),
  days: Record<FreshnessGroup, number> = DEFAULT_FRESHNESS_DAYS,
): { level: FreshnessLevel; group: FreshnessGroup; maxMs: number; ageMs: number; leftMs: number } {
  const group = FRESHNESS_GROUP[b.color ?? 'autre'] ?? 'still';
  const maxMs = days[group] * DAY;
  const ageMs = openDurationMs(b, now);
  const level: FreshnessLevel = ageMs > maxMs ? 'expired' : ageMs >= maxMs * SOON_RATIO ? 'soon' : 'fresh';
  return { level, group, maxMs, ageMs, leftMs: maxMs - ageMs };
}

export const freshnessAlerts = (bottles: OpenBottle[], now = Date.now(), days = DEFAULT_FRESHNESS_DAYS): number =>
  bottles.filter((b) => b.status === 'open' && freshness(b, now, days).level === 'expired').length;

/* ------------------------------------------------------------ chiffres */

export const glassRevenue = (b: Pick<OpenBottle, 'glassesServed' | 'priceTTC'>, served = b.glassesServed): number => served * (b.priceTTC ?? 0);

export const estimatedRevenue = (bottles: OpenBottle[]): number => bottles.reduce((s, b) => s + glassRevenue(b), 0);

/** Part des verres perdus sur les verres servis + perdus (0–1). */
export function lossRate(bottles: Pick<OpenBottle, 'glassesServed' | 'lostGlasses'>[]): number {
  let lost = 0;
  let used = 0;
  for (const b of bottles) {
    lost += b.lostGlasses ?? 0;
    used += b.glassesServed + (b.lostGlasses ?? 0);
  }
  return used ? lost / used : 0;
}

export interface TodayKpis {
  glassesServed: number;
  revenueTTC: number;
  bottlesOut: number;
  freshnessAlerts: number;
  openBottles: number;
}

const OUT_REASONS = new Set(['vente', 'verre', 'consommation', 'offert', 'degustation']);

/** Indicateurs du jour pour un site (jour local de `now`). */
export function todayKpis(bottles: OpenBottle[], movements: Movement[], siteId: string, now = Date.now(), days = DEFAULT_FRESHNESS_DAYS): TodayKpis {
  const site = bottles.filter((b) => b.siteId === siteId);
  let glasses = 0;
  let revenue = 0;
  for (const b of site) {
    const n = servedOn(b, now);
    glasses += n;
    revenue += glassRevenue(b, n);
  }
  const day = isoDay(now);
  let out = 0;
  for (const m of movements) {
    if (m.siteId !== siteId || isoDay(m.createdAt) !== day) continue;
    if (m.type === 'out' && OUT_REASONS.has(m.reason)) out += m.qty;
    else if (m.type === 'in' && m.reason === 'retour') out -= m.qty;
  }
  const open = site.filter((b) => b.status === 'open');
  return { glassesServed: glasses, revenueTTC: revenue, bottlesOut: Math.max(0, out), freshnessAlerts: freshnessAlerts(open, now, days), openBottles: open.length };
}

/* ------------------------------------------------------------ recherche */

export function matchesQuery(w: Wine, query: string): boolean {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const hay = norm([w.producer, w.name, w.appellation, w.cuvee, w.vintage, w.region, w.subRegion, w.country].filter(Boolean).join(' '));
  return tokens.every((t) => hay.includes(t));
}

/* ------------------------------------------------------------ écritures */

const bottlePath = (orgId: string, id: string) => `orgs/${orgId}/openBottles/${id}`;

type WineRef = Pick<Wine, 'id' | 'producer' | 'name' | 'vintage' | 'formatCl' | 'color' | 'byGlass'>;

/** Ouverture au verre : sortie de stock « verre » + fiche de bouteille ouverte, en une seule écriture. */
export function buildOpenBottleOps(
  orgId: string,
  wine: WineRef,
  siteId: string,
  actor: Actor,
  now = Date.now(),
  id = uid(),
): { ops: Op[]; bottle: OpenBottle } | null {
  if (!wine.byGlass?.enabled) return null;
  const glassesTotal = glassesPerBottle(wine.formatCl, wine.byGlass.glassCl);
  if (glassesTotal < 1 || !siteId) return null;
  const mvOps = buildMovementOps(orgId, [{ wine, siteId, type: 'out', qty: 1, reason: 'verre', date: isoDay(now) }], actor, now);
  const movementId = mvOps[0]?.path.split('/').pop();
  const bottle: OpenBottle = {
    id,
    wineId: wine.id,
    wineLabel: wineLabel(wine),
    color: wine.color,
    siteId,
    openedAt: now,
    openedBy: actor.userName,
    openedByUid: actor.userId,
    movementId,
    glassCl: wine.byGlass.glassCl,
    glassesTotal,
    glassesServed: 0,
    priceTTC: wine.byGlass.priceTTC,
    status: 'open',
    lostGlasses: 0,
    updatedAt: now,
  };
  const data = Object.fromEntries(Object.entries(bottle).filter(([, v]) => v !== undefined));
  return { ops: [...mvOps, { op: 'set', path: bottlePath(orgId, id), data }], bottle };
}

/** Annule une ouverture : mouvement compensatoire (retour) + suppression de la fiche. */
export function buildUndoOpenOps(orgId: string, wine: WineRef, bottle: OpenBottle, actor: Actor, note: string, now = Date.now()): Op[] {
  return [
    ...buildMovementOps(orgId, [{ wine, siteId: bottle.siteId, type: 'in', qty: 1, reason: 'retour', date: isoDay(now), note }], actor, now),
    { op: 'delete', path: bottlePath(orgId, bottle.id) },
  ];
}

/** +1 / −1 verre ; `null` si refusé (bouteille fermée, plus de verre, ou rien à corriger). */
export function buildServeOps(orgId: string, b: OpenBottle, delta: 1 | -1, now = Date.now()): Op[] | null {
  if (b.status !== 'open') return null;
  if (delta > 0 && glassesRemaining(b) < 1) return null;
  if (delta < 0 && b.glassesServed < 1) return null;
  const path = bottlePath(orgId, b.id);
  const ops: Op[] = [{ op: 'inc', path, field: 'glassesServed', by: delta, data: { updatedAt: now } }];
  if (delta > 0 || servedOn(b, now) > 0) ops.push({ op: 'inc', path, field: servedField(now), by: delta });
  return ops;
}

/** Bouteille terminée : les verres non servis sont comptés en perte. */
export function buildFinishOps(orgId: string, b: OpenBottle, now = Date.now()): Op[] | null {
  if (b.status !== 'open') return null;
  return [
    {
      op: 'set',
      path: bottlePath(orgId, b.id),
      merge: true,
      data: { status: 'finished', closedAt: now, updatedAt: now, lostGlasses: Math.max(0, b.glassesTotal - b.glassesServed) },
    },
  ];
}

/** Perte de `lost` verres ; si plus rien ne reste, la bouteille est écartée. */
export function buildLossOps(orgId: string, b: OpenBottle, lost: number, now = Date.now()): Op[] | null {
  const remaining = glassesRemaining(b);
  const n = Math.min(Math.floor(lost), remaining);
  if (b.status !== 'open' || n < 1) return null;
  const path = bottlePath(orgId, b.id);
  if (n >= remaining)
    return [{ op: 'set', path, merge: true, data: { status: 'discarded', closedAt: now, updatedAt: now, lostGlasses: (b.lostGlasses ?? 0) + n } }];
  return [{ op: 'inc', path, field: 'lostGlasses', by: n, data: { updatedAt: now } }];
}

/** Sortie d'une bouteille (vente) ; `null` si le site n'a plus de stock. */
export function buildBottleOutOps(orgId: string, wine: WineRef, siteId: string, siteQty: number, actor: Actor, now = Date.now()): Op[] | null {
  if (siteQty < 1 || !siteId) return null;
  return buildMovementOps(orgId, [{ wine, siteId, type: 'out', qty: 1, reason: 'vente', date: isoDay(now) }], actor, now);
}

/** Annulation d'une sortie : mouvement compensatoire (les mouvements sont immuables). */
export function buildUndoBottleOutOps(orgId: string, wine: WineRef, siteId: string, actor: Actor, note: string, now = Date.now()): Op[] {
  return buildMovementOps(orgId, [{ wine, siteId, type: 'in', qty: 1, reason: 'retour', date: isoDay(now), note }], actor, now);
}
