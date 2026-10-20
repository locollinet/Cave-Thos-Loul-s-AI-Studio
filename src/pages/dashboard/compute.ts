import type { Movement, OrgProfile, Role, Site, StockLevel, Wine, WineColor } from '@/types';
import { stockByWine, stockValue, wineAlerts } from '@/data/stock';
import { round2 } from '@/lib/utils';
import { daysBetween, unpaidInvoices } from '@/modules/negoce/calc';
import type { Payment, SaleDocument } from '@/modules/negoce/types';
import { qtyForSites } from '@/modules/carte/build';
import type { WineList } from '@/modules/carte/types';
import { buildSalesData, monthlySeries, periodPresets } from '@/modules/pilotage/kpis';
import type { MonthPoint, Period, SaleLine } from '@/modules/pilotage/types';

/* ------------------------------------------------------------ profil */

export type DashboardKind = 'negoce' | 'cellar' | 'chain' | 'staff';

/** Tableau de bord adapté au métier (profil) et au rôle de l'utilisateur. */
export function dashboardKind(profile: OrgProfile, role: Role | undefined): DashboardKind {
  if (!role || role === 'staff') return 'staff';
  if (role === 'sommelier') return 'cellar';
  if (profile === 'chaine') return 'chain';
  if (profile === 'restaurant') return 'cellar';
  return 'negoce';
}

/* ------------------------------------------------------------ dates */

const pad = (n: number) => String(n).padStart(2, '0');

export function monthWindows(asOf: string): { current: Period; previous: Period; previousToDate: Period } {
  const y = Number(asOf.slice(0, 4));
  const m = Number(asOf.slice(5, 7));
  const d = Number(asOf.slice(8, 10));
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const prev = `${py}-${pad(pm)}`;
  return {
    current: { from: `${y}-${pad(m)}-01`, to: asOf },
    previous: { from: `${prev}-01`, to: `${prev}-${pad(lastDay)}` },
    previousToDate: { from: `${prev}-01`, to: `${prev}-${pad(Math.min(d, lastDay))}` },
  };
}

const inPeriod = (d: string, p: Period) => d >= p.from && d <= p.to;

/* ------------------------------------------------------------ négoce */

export interface RevenueSummary {
  current: number; // CA HT du mois en cours (à date)
  previous: number; // CA HT du mois précédent complet
  previousToDate: number; // mois précédent au même jour
  delta: number | null; // % vs mois précédent au même jour
  monthly: MonthPoint[]; // 12 mois glissants
  sales12: SaleLine[];
  total12: number;
}

export function revenueSummary(i: { wines: Wine[]; docs: SaleDocument[]; movements: Movement[]; asOf: string }): RevenueSummary {
  const base = { wines: i.wines, stock: [] as StockLevel[], movements: i.movements, docs: i.docs, restaurantMode: false, vatRate: 20 };
  const revenue = (period: Period) => {
    const d = buildSalesData({ ...base, period });
    return round2(d.sales.reduce((s, l) => s + l.revenueHT, 0) + d.servicesHT);
  };
  const w = monthWindows(i.asOf);
  const last12 = periodPresets(i.asOf).last12;
  const data12 = buildSalesData({ ...base, period: last12 });
  const current = revenue(w.current);
  const previousToDate = revenue(w.previousToDate);
  return {
    current,
    previous: revenue(w.previous),
    previousToDate,
    delta: previousToDate > 0 ? Math.round(((current - previousToDate) / previousToDate) * 100) : null,
    monthly: monthlySeries(data12.sales, last12),
    sales12: data12.sales,
    total12: round2(data12.sales.reduce((s, l) => s + l.revenueHT, 0) + data12.servicesHT),
  };
}

export interface Receivables {
  outstanding: number;
  outstandingCount: number;
  overdue: number;
  overdueCount: number;
  maxDaysLate: number;
}

export function receivables(docs: SaleDocument[], payments: Payment[], asOf: string): Receivables {
  const rows = unpaidInvoices(docs, payments, asOf);
  const late = rows.filter((r) => r.daysLate > 0);
  return {
    outstanding: round2(rows.reduce((s, r) => s + r.balance, 0)),
    outstandingCount: rows.length,
    overdue: round2(late.reduce((s, r) => s + r.balance, 0)),
    overdueCount: late.length,
    maxDaysLate: late.reduce((m, r) => Math.max(m, r.daysLate), 0),
  };
}

export interface StaleQuote {
  doc: SaleDocument;
  age: number; // jours depuis l'envoi
  expired: boolean;
}

/** Devis envoyés depuis plus de `minDays` jours, sans réponse : à relancer. */
export function staleQuotes(docs: SaleDocument[], asOf: string, minDays = 7): StaleQuote[] {
  return docs
    .filter((d) => d.type === 'quote' && d.status === 'sent')
    .map((doc) => ({ doc, age: daysBetween(doc.date, asOf), expired: !!doc.validUntil && doc.validUntil < asOf }))
    .filter((q) => q.age > minDays)
    .sort((a, b) => b.age - a.age);
}

export interface RankRow {
  id: string;
  label: string;
  amount: number;
  qty: number;
}

/** Meilleurs clients (CA HT facturé, avoirs déduits) sur la période. */
export function topClients(docs: SaleDocument[], period: Period, n = 5): RankRow[] {
  const m = new Map<string, RankRow>();
  for (const d of docs) {
    if ((d.type !== 'invoice' && d.type !== 'credit_note') || (d.status !== 'validated' && d.status !== 'paid') || !inPeriod(d.date, period)) continue;
    const key = d.partnerId || d.partnerName;
    const r = m.get(key) ?? { id: key, label: d.partnerName || '—', amount: 0, qty: 0 };
    r.amount = round2(r.amount + (d.type === 'credit_note' ? -1 : 1) * d.totalHT);
    if (d.type === 'invoice') r.qty += 1;
    m.set(key, r);
  }
  return [...m.values()].filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, n);
}

/** Vins les plus vendus (CA HT) à partir des lignes de vente. */
export function topWines(sales: SaleLine[], labelOf: (wineId: string) => string, n = 5): RankRow[] {
  const m = new Map<string, RankRow>();
  for (const l of sales) {
    const r = m.get(l.wineId) ?? { id: l.wineId, label: labelOf(l.wineId), amount: 0, qty: 0 };
    r.amount = round2(r.amount + l.revenueHT);
    r.qty += l.qty;
    m.set(l.wineId, r);
  }
  return [...m.values()].filter((r) => r.amount > 0 || r.qty > 0).sort((a, b) => b.amount - a.amount || b.qty - a.qty).slice(0, n);
}

/* ------------------------------------------------------------ cave */

export interface StockAlerts {
  out: Wine[];
  low: Wine[];
  past: Wine[];
  apogee: Wine[];
}

export function stockAlerts(wines: Wine[], stock: StockLevel[], siteId: string, year = new Date().getFullYear()): StockAlerts {
  const qty = stockByWine(stock, siteId);
  const tracked = new Set(stock.filter((l) => siteId === 'all' || l.siteId === siteId).map((l) => l.wineId));
  const out: StockAlerts = { out: [], low: [], past: [], apogee: [] };
  for (const w of wines) {
    if (w.isArchived) continue;
    const a = wineAlerts(w, qty.get(w.id) ?? 0, year);
    if (a.includes('out') && (w.alertThreshold > 0 || tracked.has(w.id))) out.out.push(w);
    if (a.includes('low')) out.low.push(w);
    if (a.includes('past')) out.past.push(w);
    if (a.includes('apogee')) out.apogee.push(w);
  }
  return out;
}

export interface WindowRow {
  wine: Wine;
  qty: number;
  year: number; // année d'entrée ou de sortie de la fenêtre
}

/** Vins en stock qui entrent dans leur fenêtre de dégustation, ou en sortent, cette année ou l'an prochain. */
export function drinkingWindow(wines: Wine[], qty: Map<string, number>, year: number): { entering: WindowRow[]; leaving: WindowRow[]; past: WindowRow[] } {
  const entering: WindowRow[] = [];
  const leaving: WindowRow[] = [];
  const past: WindowRow[] = [];
  for (const w of wines) {
    const n = qty.get(w.id) ?? 0;
    if (w.isArchived || n <= 0) continue;
    if (w.apogeeTo && w.apogeeTo < year) past.push({ wine: w, qty: n, year: w.apogeeTo });
    else if (w.apogeeTo && w.apogeeTo <= year + 1) leaving.push({ wine: w, qty: n, year: w.apogeeTo });
    else if (w.apogeeFrom && w.apogeeFrom >= year && w.apogeeFrom <= year + 1) entering.push({ wine: w, qty: n, year: w.apogeeFrom });
  }
  const byYear = (a: WindowRow, b: WindowRow) => a.year - b.year || b.qty - a.qty;
  return { entering: entering.sort(byYear), leaving: leaving.sort(byYear), past: past.sort(byYear) };
}

export interface ListShortage {
  wine: Wine;
  lists: string[];
  hidden: boolean; // masqué automatiquement par au moins une carte
}

/** Vins proposés sur une carte publiée mais en rupture sur les sites de cette carte. */
export function listShortages(lists: WineList[], wines: Wine[], stock: StockLevel[]): ListShortage[] {
  const out = new Map<string, ListShortage>();
  for (const list of lists) {
    if (!list?.published) continue;
    const siteIds = Array.isArray(list.siteIds) ? list.siteIds : [];
    const q = qtyForSites(stock, siteIds);
    const excluded = new Set(Array.isArray(list.excludedWineIds) ? list.excludedWineIds : []);
    const tracked = new Set(stock.filter((l) => !siteIds.length || siteIds.includes(l.siteId)).map((l) => l.wineId));
    for (const w of wines) {
      if (w.isArchived || w.hideFromMenu || w.isPreSale || excluded.has(w.id)) continue;
      if ((q.get(w.id) ?? 0) > 0 || !(tracked.has(w.id) || w.alertThreshold > 0)) continue;
      const s = out.get(w.id) ?? { wine: w, lists: [], hidden: false };
      s.lists.push(list.name || '—');
      s.hidden ||= !!list.hideOutOfStock;
      out.set(w.id, s);
    }
  }
  return [...out.values()].sort((a, b) => a.wine.producer.localeCompare(b.wine.producer));
}

/* ------------------------------------------------------------ bouteilles ouvertes */

export interface OpenBottleDoc {
  id: string;
  wineId?: string;
  wineLabel?: string;
  siteId?: string;
  openedAt?: number | string;
  glassesServed?: number;
  glassesTotal?: number;
  status?: string;
}

export type Freshness = 'fresh' | 'watch' | 'late';

/** Conservation indicative d'une bouteille ouverte (jours) : [fraîche jusqu'à, à surveiller jusqu'à]. */
export const KEEP_DAYS: Record<WineColor, [number, number]> = {
  bulles: [1, 2],
  blanc: [2, 4],
  rose: [2, 4],
  orange: [3, 5],
  rouge: [3, 5],
  doux: [7, 21],
  spiritueux: [30, 90],
  autre: [3, 5],
};

export interface OpenBottleRow {
  id: string;
  wineId?: string;
  label: string;
  siteId?: string;
  ageDays: number;
  glassesLeft: number | null;
  freshness: Freshness;
}

const toMs = (v: number | string | undefined): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
};

export function openBottles(docs: OpenBottleDoc[], wines: Wine[], now: number, siteId = 'all'): OpenBottleRow[] {
  const byId = new Map(wines.map((w) => [w.id, w]));
  const rank: Record<Freshness, number> = { late: 0, watch: 1, fresh: 2 };
  const rows: OpenBottleRow[] = [];
  for (const d of docs) {
    if (!d || (d.status && d.status !== 'open')) continue;
    if (siteId !== 'all' && d.siteId && d.siteId !== siteId) continue;
    const opened = toMs(d.openedAt);
    const ageDays = opened === null ? 0 : Math.max(0, (now - opened) / 86_400_000);
    const w = d.wineId ? byId.get(d.wineId) : undefined;
    const [fresh, watch] = KEEP_DAYS[w?.color ?? 'autre'] ?? KEEP_DAYS.autre;
    const total = Number(d.glassesTotal);
    const served = Number(d.glassesServed) || 0;
    rows.push({
      id: d.id,
      wineId: d.wineId,
      label: d.wineLabel || (w ? `${w.producer} · ${w.name} · ${w.vintage}` : '—'),
      siteId: d.siteId,
      ageDays: Math.round(ageDays * 10) / 10,
      glassesLeft: Number.isFinite(total) && total > 0 ? Math.max(0, total - served) : null,
      freshness: ageDays <= fresh ? 'fresh' : ageDays <= watch ? 'watch' : 'late',
    });
  }
  return rows.sort((a, b) => rank[a.freshness] - rank[b.freshness] || b.ageDays - a.ageDays);
}

/* ------------------------------------------------------------ mouvements */

export function todayMovements(movements: Movement[], day: string, siteId = 'all'): Movement[] {
  return movements
    .filter((m) => m.date === day && (siteId === 'all' || m.siteId === siteId || m.toSiteId === siteId))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export interface ExitPoint {
  month: string;
  served: number; // ventes, consommation, verre
  losses: number; // casse, offerts, dégustation…
}

const SERVED = new Set(['vente', 'consommation', 'verre', 'depot_vente']);

/** Sorties de bouteilles par mois, sur 12 mois glissants. */
export function monthlyExits(movements: Movement[], asOf: string, siteId = 'all'): ExitPoint[] {
  const period = periodPresets(asOf).last12;
  const pts = new Map(monthlySeries([], period).map((p) => [p.month, { month: p.month, served: 0, losses: 0 }]));
  for (const m of movements) {
    if (m.type !== 'out' || !inPeriod(m.date, period) || (siteId !== 'all' && m.siteId !== siteId)) continue;
    const p = pts.get(m.date.slice(0, 7));
    if (!p) continue;
    if (SERVED.has(m.reason)) p.served += m.qty;
    else p.losses += m.qty;
  }
  return [...pts.values()];
}

/* ------------------------------------------------------------ chaîne */

export interface SiteRow {
  site: Site;
  bottles: number;
  costHT: number;
  sellHT: number;
  refs: number;
  out: number;
  low: number;
  share: number; // part des bouteilles du groupe (0–1)
}

export interface SiteTotals {
  bottles: number;
  costHT: number;
  sellHT: number;
  refs: number;
  out: number;
  low: number;
}

export function siteComparison(sites: Site[], wines: Wine[], stock: StockLevel[]): { rows: SiteRow[]; total: SiteTotals } {
  const live = wines.filter((w) => !w.isArchived);
  const byId = new Map(live.map((w) => [w.id, w]));
  const all = stockValue(live, stock, 'all');
  const allQty = stockByWine(stock, 'all');
  const rows = sites
    .filter((s) => !s.isArchived)
    .map((site) => {
      const v = stockValue(live, stock, site.id);
      let out = 0;
      let low = 0;
      let refs = 0;
      for (const [wineId, n] of stockByWine(stock, site.id)) {
        const w = byId.get(wineId);
        if (!w) continue;
        if (n > 0) refs += 1;
        if (n <= 0) out += 1;
        else if (w.alertThreshold > 0 && n <= w.alertThreshold) low += 1;
      }
      return { site, bottles: v.bottles, costHT: round2(v.costHT), sellHT: round2(v.sellHT), refs, out, low, share: all.bottles > 0 ? v.bottles / all.bottles : 0 };
    });
  return {
    rows,
    total: {
      bottles: all.bottles,
      costHT: round2(all.costHT),
      sellHT: round2(all.sellHT),
      refs: live.filter((w) => (allQty.get(w.id) ?? 0) > 0).length,
      // alertes cumulées site par site (une rupture au bar reste une rupture même si la cave est pleine)
      out: rows.reduce((n, r) => n + r.out, 0),
      low: rows.reduce((n, r) => n + r.low, 0),
    },
  };
}

/* ------------------------------------------------------------ prise en main */

export type OnboardingId = 'wines' | 'logo' | 'brand' | 'list' | 'team' | 'inventory' | 'publish';

export interface OnboardingStep {
  id: OnboardingId;
  done: boolean;
  to: string;
}

export function onboardingSteps(i: { wines: number; logo: boolean; brand: boolean; carte: boolean; lists: number; published: number; members: number; inventories: number }): OnboardingStep[] {
  const steps: OnboardingStep[] = [
    { id: 'wines', done: i.wines > 0, to: '/vins?new=1' },
    { id: 'logo', done: i.logo, to: '/reglages?tab=identity' },
    { id: 'brand', done: i.brand, to: '/reglages?tab=identity' },
  ];
  if (i.carte) steps.push({ id: 'list', done: i.lists > 0, to: '/carte' });
  steps.push({ id: 'team', done: i.members > 1, to: '/reglages?tab=team' });
  steps.push({ id: 'inventory', done: i.inventories > 0, to: '/inventaire' });
  if (i.carte) steps.push({ id: 'publish', done: i.published > 0, to: '/carte' });
  return steps;
}

export const onboardingProgress = (steps: OnboardingStep[]): number => (steps.length ? steps.filter((s) => s.done).length / steps.length : 1);

/* ------------------------------------------------------------ phrase d'accroche */

export interface Insight {
  key: string;
  tone: 'calm' | 'attention' | 'good';
  n?: number;
  amount?: number;
  pct?: number;
  site?: string;
}

export function negoceInsight(i: { wines: number; revenue: Pick<RevenueSummary, 'current' | 'delta'> | null; receivables: Receivables | null; stale: number; out: number }): Insight {
  if (i.wines === 0) return { key: 'home.insight.empty', tone: 'calm' };
  if (i.receivables && i.receivables.overdueCount > 0) return { key: 'home.insight.overdue', tone: 'attention', n: i.receivables.overdueCount, amount: i.receivables.overdue };
  if (i.stale > 0) return { key: 'home.insight.quotes', tone: 'attention', n: i.stale };
  if (i.revenue && i.revenue.delta !== null && i.revenue.delta > 0) return { key: 'home.insight.revenueUp', tone: 'good', pct: i.revenue.delta };
  if (i.revenue && i.revenue.delta === 0) return { key: 'home.insight.revenueFlat', tone: 'calm' };
  if (i.revenue && i.revenue.delta !== null) return { key: 'home.insight.revenueDown', tone: 'attention', pct: Math.abs(i.revenue.delta) };
  if (i.out > 0) return { key: 'home.insight.out', tone: 'attention', n: i.out };
  return { key: 'home.insight.calm', tone: 'good' };
}

export function cellarInsight(i: { wines: number; shortages: number; late: number; leaving: number; out: number; low: number }): Insight {
  if (i.wines === 0) return { key: 'home.insight.empty', tone: 'calm' };
  if (i.shortages > 0) return { key: 'home.insight.listOut', tone: 'attention', n: i.shortages };
  if (i.late > 0) return { key: 'home.insight.bottlesLate', tone: 'attention', n: i.late };
  if (i.leaving > 0) return { key: 'home.insight.leaving', tone: 'calm', n: i.leaving };
  if (i.out + i.low > 0) return { key: 'home.insight.low', tone: 'attention', n: i.out + i.low };
  return { key: 'home.insight.calm', tone: 'good' };
}

export function chainInsight(i: { wines: number; rows: SiteRow[] }): Insight {
  if (i.wines === 0) return { key: 'home.insight.empty', tone: 'calm' };
  const worst = [...i.rows].sort((a, b) => b.out + b.low - (a.out + a.low))[0];
  if (worst && worst.out + worst.low > 0) return { key: 'home.insight.siteAlerts', tone: 'attention', site: worst.site.name, n: worst.out + worst.low };
  return { key: 'home.insight.chainCalm', tone: 'good', n: i.rows.length };
}

export function staffInsight(i: { wines: number; today: number; out: number; low: number }): Insight {
  if (i.wines === 0) return { key: 'home.insight.emptyStaff', tone: 'calm' };
  if (i.out + i.low > 0) return { key: 'home.insight.low', tone: 'attention', n: i.out + i.low };
  if (i.today > 0) return { key: 'home.insight.today', tone: 'calm', n: i.today };
  return { key: 'home.insight.calm', tone: 'good' };
}
