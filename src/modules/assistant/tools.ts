import type {
  Locale,
  ModuleId,
  Movement,
  Org,
  Partner,
  Producer,
  Role,
  Site,
  StockLevel,
  Wine,
  WineColor,
} from '@/types';
import type { DataStore, QueryOpts } from '@/data/store';
import { NAV, hasRole, isNavVisible } from '@/registry';
import { EMPTY_FILTERS, matchesWine, sortWines, type WineFilters, type WineSort } from '@/lib/wineFilters';
import { findMatches, formatLabel, norm, wineLabel } from '@/lib/wine';
import { eur, htFromTtc, round2, today } from '@/lib/utils';
import { maturityRisk, qtyAt, stockByWine, stockValuation, wineAlerts, type AlertKind } from '@/data/stock';
import { buildSalesData, bySite, computeKpis, dormantWines, rankWines, winePerformance } from '@/modules/pilotage/kpis';
import type { SaleDocument } from '@/modules/negoce/types';
import type { OpenBottle } from '@/modules/service/types';
import { findDuplicateGroups } from '@/pages/wines/Duplicates';
import { searchHelpArticles } from './helpContent';
import type { AssistantToolName, MovementPrefillPayload, ResultCard, WinePrefillPayload } from './types';

export interface AssistantToolContext {
  store: DataStore;
  orgId: string;
  org: Org;
  role: Role;
  sites: Site[];
  wines: Wine[];
  producers: Producer[];
  partners: Partner[];
  stock: StockLevel[];
  activeSiteId: string;
  canSeeCosts: boolean;
  hasModule: (m: ModuleId) => boolean;
  locale?: Locale;
}

export interface AssistantTool<I = Record<string, unknown>, O = Record<string, unknown>> {
  name: AssistantToolName;
  module?: ModuleId;
  roles?: Role[];
  needsCosts?: boolean;
  run: (ctx: AssistantToolContext, input: I) => Promise<O>;
  toCards: (output: O, ctx: AssistantToolContext) => ResultCard[];
}

const MAX_ITEMS = 20;

const COST_KEYS = new Set([
  'buyPriceHT',
  'coefficient',
  'unitCostHT',
  'costHT',
  'costValue',
  'costValueHT',
  'totalCostHT',
  'stockCost',
  'cogs',
  'grossMargin',
  'margin',
  'marginHT',
  'marginRate',
  'markRate',
  'marginAfterShrink',
  'shrinkCost',
]);

/** Purge récursivement tous les champs de coût d'achat et de marge lorsque l'utilisateur n'a pas `canSeeCosts`. */
export function sanitizeForRole<T>(value: T, canSeeCosts: boolean): T {
  if (canSeeCosts || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeForRole(item, canSeeCosts)) as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (COST_KEYS.has(k)) continue;
      out[k] = sanitizeForRole(v, canSeeCosts);
    }
    return out as T;
  }
  return value;
}

/** Lecture ponctuelle d'une collection via `subscribeCollection` (compatible mode démo local et Firestore). */
export function readCollectionOnce<T>(store: DataStore, path: string, opts?: QueryOpts): Promise<T[]> {
  return new Promise((resolve) => {
    let settled = false;
    let unsub: (() => void) | undefined;
    const finish = (rows: T[]) => {
      if (settled) return;
      settled = true;
      queueMicrotask(() => unsub?.());
      resolve(rows);
    };
    unsub = store.subscribeCollection<T>(
      path,
      (rows) => finish(rows),
      opts,
      () => finish([]),
    );
  });
}

/** Résout un identifiant ou un nom de lieu vers un `siteId` valide (ou `'all'`). */
export function resolveSiteId(sites: Site[], requested: unknown, fallback: string): string {
  if (typeof requested !== 'string' || !requested.trim()) return fallback || 'all';
  const raw = requested.trim();
  if (raw === 'all') return 'all';
  const exact = sites.find((s) => s.id === raw);
  if (exact) return exact.id;
  const q = norm(raw);
  const byName = sites.find((s) => norm(s.name).includes(q) || q.includes(norm(s.name)));
  return byName ? byName.id : fallback || 'all';
}

const siteName = (sites: Site[], siteId: string, locale: Locale = 'fr'): string => {
  if (siteId === 'all') return locale === 'en' ? 'All sites' : 'Tous les lieux';
  return sites.find((s) => s.id === siteId)?.name ?? siteId;
};

const navItemFor = (id: string) => NAV.find((n) => n.id === id);

const clampLimit = (v: unknown, def = 10): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.round(n), MAX_ITEMS);
};

/**
 * Résout une valeur partielle (ex: "Rhône" -> "Vallée du Rhône", "Roulot" -> "Domaine Jean-Marc Roulot")
 * pour que `matchesWine` ne rejette pas une correspondance évidente par égalité stricte.
 */
function resolveWineFieldValue(
  wines: Wine[],
  field: 'region' | 'subRegion' | 'producer',
  raw: unknown,
): { exactFilter: string; fallbackQuery: string } {
  if (typeof raw !== 'string' || !raw.trim()) return { exactFilter: '', fallbackQuery: '' };
  const q = norm(raw);
  if (!q) return { exactFilter: '', fallbackQuery: '' };
  const exact = wines.find((w) => norm(w[field]) === q);
  if (exact?.[field]) return { exactFilter: exact[field]!, fallbackQuery: '' };
  const partialMatches = [...new Set(wines.map((w) => w[field]?.trim()).filter((v): v is string => !!v && norm(v).includes(q)))];
  if (partialMatches.length === 1) return { exactFilter: partialMatches[0], fallbackQuery: '' };
  if (partialMatches.length > 1) return { exactFilter: '', fallbackQuery: raw.trim() };
  return { exactFilter: raw.trim(), fallbackQuery: '' };
}

/* ---------------------------------------------------------------- 1. find_wines */

interface FindWinesOutput {
  siteId: string;
  siteLabel: string;
  totalMatchingRefs: number;
  totalBottles: number;
  totalMenuTTC: number;
  totalSellHT?: number;
  totalCostHT?: number;
  bySite?: Record<string, { siteName: string; bottles: number; refs: number; menuTTC: number; costHT?: number }>;
  truncated: boolean;
  filterUrl: string;
  items: {
    wineId: string;
    label: string;
    producer: string;
    name: string;
    vintage: string;
    color: WineColor;
    region?: string;
    formatCl: number;
    qty: number;
    bin?: string;
    menuPriceTTC?: number;
    sellPriceHT?: number;
    buyPriceHT?: number;
  }[];
  duplicateMatches?: { wineId: string; label: string; score: number; exact: boolean; qty: number }[];
}

const findWinesTool: AssistantTool<Record<string, unknown>, FindWinesOutput> = {
  name: 'find_wines',
  module: navItemFor('wines')?.module,
  roles: navItemFor('wines')?.roles,
  needsCosts: false,
  async run(ctx, input) {
    const locale = ctx.locale ?? ctx.org.locale ?? 'fr';
    const siteId = resolveSiteId(ctx.sites, input.siteId, ctx.activeSiteId);
    const limit = clampLimit(input.limit, 12);
    const liveWines = ctx.wines.filter((w) => !w.isArchived);
    const reg = resolveWineFieldValue(liveWines, 'region', input.region);
    const subReg = resolveWineFieldValue(liveWines, 'subRegion', input.subRegion);
    const prod = resolveWineFieldValue(liveWines, 'producer', input.producer);
    const query = [typeof input.query === 'string' ? input.query.trim() : '', reg.fallbackQuery, subReg.fallbackQuery, prod.fallbackQuery]
      .filter(Boolean)
      .join(' ');
    const requestedPriceField =
      input.priceField === 'buyPriceHT' || input.priceField === 'sellPriceHT' || input.priceField === 'menuPriceTTC'
        ? input.priceField
        : 'menuPriceTTC';
    const priceField: WineFilters['price'] = !ctx.canSeeCosts && requestedPriceField === 'buyPriceHT' ? 'menuPriceTTC' : requestedPriceField;

    const filters: WineFilters = {
      ...EMPTY_FILTERS,
      region: reg.exactFilter,
      subRegion: subReg.exactFilter,
      producer: prod.exactFilter,
      color: typeof input.color === 'string' ? input.color : '',
      vintage: typeof input.vintage === 'string' ? input.vintage : '',
      grapes: typeof input.grapes === 'string' ? input.grapes : '',
      format: input.formatCl !== undefined ? String(input.formatCl) : '',
      stock:
        typeof input.stockStatus === 'string' && ['in', 'low', 'out', 'normal'].includes(input.stockStatus)
          ? input.stockStatus
          : '',
      minQty: input.minQty !== undefined ? String(input.minQty) : '',
      maxQty: input.maxQty !== undefined ? String(input.maxQty) : '',
      price: priceField,
      minPrice: input.minPrice !== undefined ? String(input.minPrice) : '',
      maxPrice: input.maxPrice !== undefined ? String(input.maxPrice) : '',
      apogee: Boolean(input.apogeeOnly),
    };

    const qtyMap = stockByWine(ctx.stock, siteId);
    const matched = liveWines.filter((w) => matchesWine(w, qtyMap.get(w.id) ?? 0, filters, query));

    const sortBy: WineSort =
      input.sortBy === 'qty' || input.sortBy === 'price' || input.sortBy === 'vintage' || input.sortBy === 'producer'
        ? input.sortBy
        : 'qty';
    const sorted = sortWines(matched, qtyMap, sortBy, priceField, Boolean(input.sortDesc));

    const matchedIds = new Set(matched.map((w) => w.id));
    const filteredStock = ctx.stock.filter((s) => matchedIds.has(s.wineId));
    const valuation = stockValuation(matched, filteredStock, siteId, {
      vatRate: ctx.org.defaultVatRate,
      preferMenuPrice: ctx.org.profile === 'restaurant' || ctx.org.profile === 'chaine',
    });

    const bySiteOut: FindWinesOutput['bySite'] = {};
    for (const [sId, slice] of Object.entries(valuation.bySite)) {
      bySiteOut[sId] = {
        siteName: siteName(ctx.sites, sId, locale),
        bottles: slice.bottles,
        refs: slice.refs,
        menuTTC: slice.menuTTC,
        ...(ctx.canSeeCosts ? { costHT: slice.costHT } : {}),
      };
    }

    const searchParams = new URLSearchParams();
    if (query) searchParams.set('q', query);
    if (filters.color) searchParams.set('color', filters.color);
    if (filters.region) searchParams.set('region', filters.region);
    if (filters.subRegion) searchParams.set('subRegion', filters.subRegion);
    if (filters.producer) searchParams.set('producer', filters.producer);
    if (filters.vintage) searchParams.set('vintage', filters.vintage);
    if (filters.stock) searchParams.set('stock', filters.stock);
    if (filters.apogee) searchParams.set('apogee', '1');
    const qs = searchParams.toString();
    const filterUrl = `/vins${qs ? `?${qs}` : ''}`;

    const duplicateMatches =
      query || filters.producer
        ? findMatches(
            {
              producer: filters.producer || undefined,
              name: query || undefined,
              vintage: filters.vintage || undefined,
              color: filters.color || undefined,
              formatCl: filters.format ? Number(filters.format) : undefined,
            },
            liveWines,
            5,
          ).map((m) => ({
            wineId: m.wine.id,
            label: wineLabel(m.wine),
            score: round2(m.score),
            exact: m.exact,
            qty: qtyMap.get(m.wine.id) ?? 0,
          }))
        : undefined;

    const out: FindWinesOutput = {
      siteId,
      siteLabel: siteName(ctx.sites, siteId, locale),
      totalMatchingRefs: sorted.length,
      totalBottles: valuation.bottles,
      totalMenuTTC: valuation.menuTTC,
      ...(ctx.canSeeCosts ? { totalSellHT: valuation.sellHT, totalCostHT: valuation.costHT } : {}),
      bySite: Object.keys(bySiteOut).length > 0 ? bySiteOut : undefined,
      truncated: sorted.length > limit,
      filterUrl,
      items: sorted.slice(0, limit).map((w) => {
        const level = siteId !== 'all' ? ctx.stock.find((s) => s.wineId === w.id && s.siteId === siteId) : undefined;
        return {
          wineId: w.id,
          label: wineLabel(w),
          producer: w.producer,
          name: w.name,
          vintage: w.vintage,
          color: w.color,
          region: w.region,
          formatCl: w.formatCl,
          qty: qtyMap.get(w.id) ?? 0,
          bin: level?.bin,
          menuPriceTTC: level?.menuPriceTTC ?? w.menuPriceTTC,
          sellPriceHT: w.sellPriceHT,
          ...(ctx.canSeeCosts ? { buyPriceHT: w.buyPriceHT } : {}),
        };
      }),
      ...(duplicateMatches && duplicateMatches.length > 0 ? { duplicateMatches } : {}),
    };

    return sanitizeForRole(out, ctx.canSeeCosts);
  },
  toCards(output, ctx) {
    const locale = ctx.locale ?? ctx.org.locale ?? 'fr';
    const intl = locale === 'en' ? 'en-GB' : 'fr-FR';
    const metrics: ResultCard['metrics'] = [
      { label: locale === 'en' ? 'References' : 'Références', value: String(output.totalMatchingRefs) },
      { label: locale === 'en' ? 'Bottles' : 'Bouteilles', value: String(output.totalBottles), tone: 'brand' },
      { label: locale === 'en' ? 'Menu value TTC' : 'Valeur carte TTC', value: eur(output.totalMenuTTC, intl) },
    ];
    if (ctx.canSeeCosts && output.totalCostHT !== undefined) {
      metrics.push({ label: locale === 'en' ? 'Cost value HT' : 'Valeur achat HT', value: eur(output.totalCostHT, intl) });
    }
    return [
      {
        id: `card-wines-${Date.now()}`,
        kind: 'wines',
        title: locale === 'en' ? `Selection (${output.siteLabel})` : `Sélection (${output.siteLabel})`,
        subtitle:
          output.truncated
            ? locale === 'en'
              ? `Top ${output.items.length} of ${output.totalMatchingRefs} wines`
              : `Top ${output.items.length} sur ${output.totalMatchingRefs} vins`
            : undefined,
        metrics,
        items: output.items.slice(0, 8).map((w) => ({
          id: w.wineId,
          title: w.label,
          subtitle: [w.region, w.bin ? `Casier ${w.bin}` : '', w.menuPriceTTC ? `${eur(w.menuPriceTTC, intl)} TTC` : '']
            .filter(Boolean)
            .join(' · '),
          badge: `${w.qty} btl`,
          badgeTone: w.qty <= 0 ? 'bad' : w.qty <= 3 ? 'warn' : 'ok',
          href: `/vins?open=${w.wineId}`,
        })),
        link: {
          label:
            locale === 'en'
              ? `View all ${output.totalMatchingRefs} wines`
              : `Voir les ${output.totalMatchingRefs} vins`,
          to: output.filterUrl,
        },
      },
    ];
  },
};

/* ---------------------------------------------------------------- 2. stock_alerts */

interface StockAlertsOutput {
  siteId: string;
  siteLabel: string;
  counts: {
    out: number;
    low: number;
    apogee: number;
    past: number;
    maturityRisk: number;
    openBottlesExpired: number;
  };
  truncated: boolean;
  items: {
    id: string;
    wineId: string;
    label: string;
    kind: string;
    qty: number;
    detail: string;
    menuValueTTC?: number;
    costValueHT?: number;
  }[];
}

const stockAlertsTool: AssistantTool<Record<string, unknown>, StockAlertsOutput> = {
  name: 'stock_alerts',
  module: navItemFor('stock')?.module,
  roles: navItemFor('stock')?.roles,
  needsCosts: false,
  async run(ctx, input) {
    const locale = ctx.locale ?? ctx.org.locale ?? 'fr';
    const siteId = resolveSiteId(ctx.sites, input.siteId, ctx.activeSiteId);
    const limit = clampLimit(input.limit, 15);
    const openDays = Number(input.openDaysThreshold) > 0 ? Number(input.openDaysThreshold) : 3;
    const requestedKinds = Array.isArray(input.kinds) && input.kinds.length > 0 ? (input.kinds as string[]) : ['out', 'low', 'apogee', 'past', 'maturity_risk', 'open_bottles'];
    const want = new Set(requestedKinds);

    const qtyMap = stockByWine(ctx.stock, siteId);
    const liveWines = ctx.wines.filter((w) => !w.isArchived);
    const year = new Date().getFullYear();

    const movements = want.has('maturity_risk')
      ? await readCollectionOnce<Movement>(ctx.store, `orgs/${ctx.orgId}/movements`, { orderBy: ['createdAt', 'desc'], limit: 500 })
      : [];
    const openBottles =
      want.has('open_bottles') && ctx.hasModule('carte')
        ? await readCollectionOnce<OpenBottle>(ctx.store, `orgs/${ctx.orgId}/openBottles`)
        : [];

    const matRisks = want.has('maturity_risk')
      ? maturityRisk(liveWines, ctx.stock, movements, { siteId, vatRate: ctx.org.defaultVatRate })
      : [];

    const counts = {
      out: 0,
      low: 0,
      apogee: 0,
      past: 0,
      maturityRisk: matRisks.length,
      openBottlesExpired: 0,
    };

    const items: StockAlertsOutput['items'] = [];

    for (const r of matRisks) {
      items.push({
        id: `mat-${r.wine.id}`,
        wineId: r.wine.id,
        label: wineLabel(r.wine),
        kind: 'maturity_risk',
        qty: r.qty,
        detail:
          r.yearsLeft < 0
            ? `Apogée dépassée (${r.apogeeTo}) · ${r.annualOut} btl/an`
            : `Fin d'apogée ${r.apogeeTo} · rythme ${r.annualOut} btl/an`,
        menuValueTTC: r.menuValueTTC,
        ...(ctx.canSeeCosts ? { costValueHT: r.costValueHT } : {}),
      });
    }

    for (const w of liveWines) {
      const qty = qtyMap.get(w.id) ?? 0;
      const level = siteId !== 'all' ? ctx.stock.find((s) => s.wineId === w.id && s.siteId === siteId) : undefined;
      const alerts: AlertKind[] = wineAlerts(w, qty, year, level);
      for (const k of alerts) {
        counts[k] += 1;
        if (!want.has(k)) continue;
        if (k === 'past' && items.some((it) => it.wineId === w.id && it.kind === 'maturity_risk')) continue;
        items.push({
          id: `${k}-${w.id}`,
          wineId: w.id,
          label: wineLabel(w),
          kind: k,
          qty,
          detail:
            k === 'out'
              ? 'Rupture de stock (0 btl)'
              : k === 'low'
                ? `Sous le seuil (${qty} / ${level?.alertThreshold ?? w.alertThreshold} btl)`
                : k === 'past'
                  ? `Apogée dépassée (${w.apogeeTo})`
                  : `À son apogée (${w.apogeeFrom}–${w.apogeeTo})`,
        });
      }
    }

    const now = Date.now();
    for (const ob of openBottles) {
      if (ob.status !== 'open') continue;
      if (siteId !== 'all' && ob.siteId !== siteId) continue;
      const daysOpen = Math.floor((now - ob.openedAt) / 86_400_000);
      if (daysOpen >= openDays) {
        counts.openBottlesExpired += 1;
        if (want.has('open_bottles')) {
          items.push({
            id: `open-${ob.id}`,
            wineId: ob.wineId,
            label: ob.wineLabel,
            kind: 'open_bottles',
            qty: Math.max(0, ob.glassesTotal - ob.glassesServed),
            detail: `Ouverte depuis ${daysOpen} j (${ob.glassesServed}/${ob.glassesTotal} verres servis)`,
          });
        }
      }
    }

    const out: StockAlertsOutput = {
      siteId,
      siteLabel: siteName(ctx.sites, siteId, locale),
      counts,
      truncated: items.length > limit,
      items: items.slice(0, limit),
    };
    return sanitizeForRole(out, ctx.canSeeCosts);
  },
  toCards(output, ctx) {
    const locale = ctx.locale ?? ctx.org.locale ?? 'fr';
    return [
      {
        id: `card-alerts-${Date.now()}`,
        kind: 'alerts',
        title: locale === 'en' ? `Stock & Maturity Alerts (${output.siteLabel})` : `Alertes Stock & Apogée (${output.siteLabel})`,
        metrics: [
          { label: locale === 'en' ? 'Low / Out' : 'Seuils bas / Ruptures', value: `${output.counts.low} / ${output.counts.out}`, tone: output.counts.low + output.counts.out > 0 ? 'warn' : 'ok' },
          { label: locale === 'en' ? 'Peak window' : 'À l’apogée', value: String(output.counts.apogee), tone: 'brand' },
          { label: locale === 'en' ? 'Maturity risk' : 'Risque déclin', value: String(output.counts.maturityRisk), tone: output.counts.maturityRisk > 0 ? 'bad' : 'ok' },
        ],
        items: output.items.slice(0, 8).map((it) => ({
          id: it.id,
          title: it.label,
          subtitle: it.detail,
          badge: `${it.qty} btl`,
          badgeTone: it.kind === 'out' || it.kind === 'maturity_risk' || it.kind === 'past' ? 'bad' : it.kind === 'low' || it.kind === 'open_bottles' ? 'warn' : 'ok',
          href: `/vins?open=${it.wineId}`,
        })),
        link: {
          label: locale === 'en' ? 'Open stock & alerts' : 'Ouvrir le stock',
          to: '/stock?stock=low',
        },
      },
    ];
  },
};

/* ---------------------------------------------------------------- 3. rotation */

interface RotationOutput {
  metric: 'dormant' | 'top_out' | 'shrinkage' | 'compare_sites';
  days: number;
  siteId: string;
  siteLabel: string;
  truncated: boolean;
  items: {
    id: string;
    wineId?: string;
    label: string;
    qty: number;
    detail: string;
    costValue?: number;
  }[];
}

const rotationTool: AssistantTool<Record<string, unknown>, RotationOutput> = {
  name: 'rotation',
  module: navItemFor('stock')?.module,
  roles: navItemFor('stock')?.roles,
  needsCosts: false,
  async run(ctx, input) {
    const locale = ctx.locale ?? ctx.org.locale ?? 'fr';
    const metric =
      input.metric === 'top_out' || input.metric === 'shrinkage' || input.metric === 'compare_sites' ? input.metric : 'dormant';
    const rawDays = Number(input.days);
    const days = Number.isFinite(rawDays) && rawDays >= 7 ? Math.min(Math.round(rawDays), 365) : metric === 'dormant' ? 180 : 90;
    const siteId = resolveSiteId(ctx.sites, input.siteId, ctx.activeSiteId);
    const limit = clampLimit(input.limit, 12);

    const movements = await readCollectionOnce<Movement>(ctx.store, `orgs/${ctx.orgId}/movements`, {
      orderBy: ['createdAt', 'desc'],
      limit: 500,
    });
    const asOf = today();
    const cutoffIso = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const liveWines = ctx.wines.filter((w) => !w.isArchived);

    let items: RotationOutput['items'] = [];

    if (metric === 'dormant') {
      const dormants = dormantWines({
        wines: liveWines,
        stock: ctx.stock,
        movements,
        siteId,
        asOf,
        days,
      });
      items = dormants.map((d) => ({
        id: d.wineId,
        wineId: d.wineId,
        label: d.label,
        qty: d.stock,
        detail: d.daysSince !== null ? `Aucune sortie depuis ${d.daysSince} j` : `Aucune sortie enregistrée${d.isAgingReserve ? ' (vin de garde)' : ''}`,
        ...(ctx.canSeeCosts ? { costValue: d.costValue } : {}),
      }));
    } else if (metric === 'top_out') {
      const outByWine = new Map<string, number>();
      for (const m of movements) {
        if (m.type !== 'out' || m.date < cutoffIso) continue;
        if (siteId !== 'all' && m.siteId !== siteId) continue;
        if (!['vente', 'verre', 'consommation', 'depot_vente'].includes(m.reason)) continue;
        outByWine.set(m.wineId, (outByWine.get(m.wineId) ?? 0) + m.qty);
      }
      const qtyMap = stockByWine(ctx.stock, siteId);
      const byId = new Map(liveWines.map((w) => [w.id, w]));
      items = [...outByWine.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([wId, outQty]) => {
          const w = byId.get(wId);
          const rem = qtyMap.get(wId) ?? 0;
          return {
            id: wId,
            wineId: wId,
            label: w ? wineLabel(w) : wId,
            qty: outQty,
            detail: `${outQty} btl sorties sur ${days} j · reste ${rem} btl en stock`,
          };
        });
    } else if (metric === 'shrinkage') {
      const shrinkReasons = new Set(['casse', 'bouchonne', 'oxyde', 'degustation', 'offert']);
      const byWine = new Map<string, { qty: number; reasons: Set<string>; cost: number }>();
      const wineMap = new Map(liveWines.map((w) => [w.id, w]));
      for (const m of movements) {
        if (m.type !== 'out' || m.date < cutoffIso || !shrinkReasons.has(m.reason)) continue;
        if (siteId !== 'all' && m.siteId !== siteId) continue;
        const w = wineMap.get(m.wineId);
        const cur = byWine.get(m.wineId) ?? { qty: 0, reasons: new Set<string>(), cost: 0 };
        cur.qty += m.qty;
        cur.reasons.add(m.reason);
        cur.cost = round2(cur.cost + m.qty * (m.unitCostHT ?? w?.buyPriceHT ?? 0));
        byWine.set(m.wineId, cur);
      }
      items = [...byWine.entries()]
        .sort((a, b) => b[1].qty - a[1].qty)
        .map(([wId, info]) => {
          const w = wineMap.get(wId);
          return {
            id: wId,
            wineId: wId,
            label: w ? wineLabel(w) : wId,
            qty: info.qty,
            detail: `Motifs : ${[...info.reasons].join(', ')}`,
            ...(ctx.canSeeCosts ? { costValue: info.cost } : {}),
          };
        });
    } else {
      const rows = bySite(
        {
          wines: liveWines,
          stock: ctx.stock,
          movements,
          docs: [],
          period: { from: cutoffIso, to: asOf },
          siteId: 'all',
          restaurantMode: ctx.org.profile === 'restaurant' || ctx.org.profile === 'chaine',
          vatRate: ctx.org.defaultVatRate,
        },
        ctx.sites.map((s) => s.id),
      );
      items = rows.map((r) => {
        const outCount = movements
          .filter((m) => m.type === 'out' && m.siteId === r.siteId && m.date >= cutoffIso)
          .reduce((s, m) => s + m.qty, 0);
        return {
          id: r.siteId,
          label: siteName(ctx.sites, r.siteId, locale),
          qty: outCount,
          detail: `${outCount} btl sorties sur ${days} j · ${r.stockBottles} btl en stock`,
          ...(ctx.canSeeCosts ? { costValue: r.stockCost } : {}),
        };
      });
    }

    const out: RotationOutput = {
      metric,
      days,
      siteId,
      siteLabel: siteName(ctx.sites, siteId, locale),
      truncated: items.length > limit,
      items: items.slice(0, limit),
    };
    return sanitizeForRole(out, ctx.canSeeCosts);
  },
  toCards(output, ctx) {
    const locale = ctx.locale ?? ctx.org.locale ?? 'fr';
    const titles: Record<RotationOutput['metric'], string> = {
      dormant: locale === 'en' ? `Dormant wines (${output.days}d)` : `Vins dormants (${output.days} j)`,
      top_out: locale === 'en' ? `Top rotations (${output.days}d)` : `Meilleures rotations (${output.days} j)`,
      shrinkage: locale === 'en' ? `Breakage & corked (${output.days}d)` : `Casse, bouchonnés & pertes (${output.days} j)`,
      compare_sites: locale === 'en' ? `Site comparison (${output.days}d)` : `Comparatif des lieux (${output.days} j)`,
    };
    return [
      {
        id: `card-rot-${Date.now()}`,
        kind: 'rotation',
        title: titles[output.metric],
        subtitle: output.siteLabel,
        items: output.items.slice(0, 8).map((it) => ({
          id: it.id,
          title: it.label,
          subtitle: it.detail,
          badge: `${it.qty} btl`,
          badgeTone: output.metric === 'dormant' || output.metric === 'shrinkage' ? 'warn' : 'ok',
          href: it.wineId ? `/vins?open=${it.wineId}` : '/stock',
        })),
        link: {
          label: locale === 'en' ? 'Open movement journal' : 'Voir le journal des mouvements',
          to: '/stock?tab=journal',
        },
      },
    ];
  },
};

/* ---------------------------------------------------------------- 4. margins */

interface MarginsOutput {
  focus: 'low_margins' | 'top_margins' | 'underpriced' | 'summary';
  siteId: string;
  siteLabel: string;
  kpis: {
    revenueHT: number;
    grossMargin: number;
    markRate: number | null;
    stockCost: number;
    stockSell: number;
  };
  truncated: boolean;
  items: {
    wineId: string;
    label: string;
    qty: number;
    buyPriceHT: number;
    sellHT: number;
    markRatePct: number;
    detail: string;
  }[];
}

const marginsTool: AssistantTool<Record<string, unknown>, MarginsOutput> = {
  name: 'margins',
  module: navItemFor('pilotage')?.module ?? 'pilotage',
  roles: navItemFor('pilotage')?.roles ?? ['owner', 'manager', 'sommelier', 'accountant'],
  needsCosts: true,
  async run(ctx, input) {
    const locale = ctx.locale ?? ctx.org.locale ?? 'fr';
    const focus =
      input.focus === 'top_margins' || input.focus === 'underpriced' || input.focus === 'summary' ? input.focus : 'low_margins';
    const siteId = resolveSiteId(ctx.sites, input.siteId, ctx.activeSiteId);
    const limit = clampLimit(input.limit, 12);
    const days = Number(input.days) > 0 ? Math.min(Number(input.days), 365) : 90;
    const maxMarginRatePct = Number(input.maxMarginRatePct) > 0 ? Number(input.maxMarginRatePct) : 55;

    const movements = await readCollectionOnce<Movement>(ctx.store, `orgs/${ctx.orgId}/movements`, {
      orderBy: ['createdAt', 'desc'],
      limit: 500,
    });
    const docs =
      ctx.hasModule('negoce') && hasRole(ctx.role, ['owner', 'manager', 'accountant'])
        ? await readCollectionOnce<SaleDocument>(ctx.store, `orgs/${ctx.orgId}/documents`, { limit: 200 })
        : [];

    const asOf = today();
    const fromIso = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const liveWines = ctx.wines.filter((w) => !w.isArchived);
    const restaurantMode = ctx.org.profile === 'restaurant' || ctx.org.profile === 'chaine';

    const pilotageInput = {
      wines: liveWines,
      stock: ctx.stock,
      movements,
      docs,
      period: { from: fromIso, to: asOf },
      siteId,
      restaurantMode,
      vatRate: ctx.org.defaultVatRate,
    };
    const salesData = buildSalesData(pilotageInput);
    const kpis = computeKpis(pilotageInput, salesData);
    const qtyMap = stockByWine(ctx.stock, siteId);

    const catalogueRows = liveWines
      .map((w) => {
        const buy = w.buyPriceHT ?? 0;
        const sellHT =
          restaurantMode && w.menuPriceTTC
            ? htFromTtc(w.menuPriceTTC, ctx.org.defaultVatRate)
            : (w.sellPriceHT ?? (w.menuPriceTTC ? htFromTtc(w.menuPriceTTC, ctx.org.defaultVatRate) : 0));
        if (buy <= 0 || sellHT <= 0) return null;
        const marginHT = round2(sellHT - buy);
        const markRatePct = Math.round((marginHT / sellHT) * 1000) / 10;
        const targetCoef = w.coefficient ?? ctx.org.defaultCoefficient ?? 1.6;
        const actualCoef = round2(sellHT / buy);
        const qty = qtyMap.get(w.id) ?? 0;
        return {
          wineId: w.id,
          label: wineLabel(w),
          qty,
          buyPriceHT: buy,
          sellHT,
          markRatePct,
          actualCoef,
          targetCoef,
          detail: `Achat ${buy} € HT → Vente ${sellHT} € HT · taux de marque ${markRatePct}% (coef ×${actualCoef})`,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    let sorted = catalogueRows;
    if (focus === 'low_margins') {
      const below = catalogueRows.filter((r) => r.markRatePct <= maxMarginRatePct && r.qty > 0);
      sorted = (below.length > 0 ? below : catalogueRows).sort((a, b) => a.markRatePct - b.markRatePct);
    } else if (focus === 'top_margins') {
      const perfs = winePerformance(salesData.sales, liveWines, ctx.stock, siteId);
      const { top } = rankWines(perfs, limit);
      if (top.length > 0) {
        const byW = new Map(catalogueRows.map((c) => [c.wineId, c]));
        sorted = top
          .map((p) => byW.get(p.wineId))
          .filter((x): x is NonNullable<typeof x> => !!x);
      } else {
        sorted = [...catalogueRows].sort((a, b) => b.markRatePct - a.markRatePct);
      }
    } else if (focus === 'underpriced') {
      sorted = catalogueRows
        .filter((r) => r.actualCoef < r.targetCoef * 0.95)
        .sort((a, b) => a.actualCoef - b.actualCoef);
    } else {
      sorted = [...catalogueRows].sort((a, b) => a.markRatePct - b.markRatePct);
    }

    return {
      focus,
      siteId,
      siteLabel: siteName(ctx.sites, siteId, locale),
      kpis: {
        revenueHT: kpis.revenueHT,
        grossMargin: kpis.grossMargin,
        markRate: kpis.markRate,
        stockCost: kpis.stockCost,
        stockSell: kpis.stockSell,
      },
      truncated: sorted.length > limit,
      items: sorted.slice(0, limit).map(({ wineId, label, qty, buyPriceHT, sellHT, markRatePct, detail }) => ({
        wineId,
        label,
        qty,
        buyPriceHT,
        sellHT,
        markRatePct,
        detail,
      })),
    };
  },
  toCards(output, ctx) {
    const locale = ctx.locale ?? ctx.org.locale ?? 'fr';
    const intl = locale === 'en' ? 'en-GB' : 'fr-FR';
    return [
      {
        id: `card-margins-${Date.now()}`,
        kind: 'margins',
        title: locale === 'en' ? `Margins & Profitability (${output.siteLabel})` : `Marges & Rentabilité (${output.siteLabel})`,
        metrics: [
          {
            label: locale === 'en' ? 'Mark rate' : 'Taux de marque',
            value: output.kpis.markRate !== null ? `${output.kpis.markRate}%` : '—',
            tone: 'brand',
          },
          { label: locale === 'en' ? 'Gross margin' : 'Marge brute', value: eur(output.kpis.grossMargin, intl), tone: 'ok' },
          { label: locale === 'en' ? 'Stock cost HT' : 'Stock achat HT', value: eur(output.kpis.stockCost, intl) },
        ],
        items: output.items.slice(0, 8).map((it) => ({
          id: it.wineId,
          title: it.label,
          subtitle: it.detail,
          badge: `${it.markRatePct}%`,
          badgeTone: it.markRatePct < 35 ? 'bad' : it.markRatePct < 55 ? 'warn' : 'ok',
          href: `/vins?open=${it.wineId}`,
        })),
        link: {
          label: locale === 'en' ? 'Open analytics & margins' : 'Ouvrir le Pilotage',
          to: '/pilotage',
        },
      },
    ];
  },
};

/* ---------------------------------------------------------------- 5. data_quality */

interface DataQualityOutput {
  siteId: string;
  siteLabel: string;
  counts: {
    missingPrice: number;
    missingBin: number;
    missingTechSheet: number;
    missingApogee: number;
    missingAllergens: number;
    duplicateGroups: number;
  };
  truncated: boolean;
  items: {
    id: string;
    wineId: string;
    label: string;
    issue: string;
    qty: number;
  }[];
}

const dataQualityTool: AssistantTool<Record<string, unknown>, DataQualityOutput> = {
  name: 'data_quality',
  module: 'stock',
  roles: ['owner', 'manager', 'sommelier', 'accountant'],
  needsCosts: false,
  async run(ctx, input) {
    const locale = ctx.locale ?? ctx.org.locale ?? 'fr';
    const siteId = resolveSiteId(ctx.sites, input.siteId, ctx.activeSiteId);
    const limit = clampLimit(input.limit, 15);
    const requested =
      Array.isArray(input.checks) && input.checks.length > 0
        ? (input.checks as string[])
        : ['missing_price', 'missing_bin', 'missing_tech_sheet', 'missing_apogee', 'missing_allergens', 'duplicates'];
    const want = new Set(requested);

    const liveWines = ctx.wines.filter((w) => !w.isArchived);
    const qtyMap = stockByWine(ctx.stock, siteId);
    const dupGroups = findDuplicateGroups(liveWines);

    const counts = {
      missingPrice: 0,
      missingBin: 0,
      missingTechSheet: 0,
      missingApogee: 0,
      missingAllergens: 0,
      duplicateGroups: dupGroups.length,
    };

    const items: DataQualityOutput['items'] = [];

    if (want.has('duplicates')) {
      for (const g of dupGroups) {
        const first = g[0];
        items.push({
          id: `dup-${first.id}`,
          wineId: first.id,
          label: wineLabel(first),
          issue: `Doublon potentiel (${g.length} fiches proches)`,
          qty: g.reduce((n, w) => n + (qtyMap.get(w.id) ?? 0), 0),
        });
      }
    }

    for (const w of liveWines) {
      const qty = qtyMap.get(w.id) ?? 0;
      const missingIssues: string[] = [];

      const hasSellingPrice = (w.menuPriceTTC ?? 0) > 0 || (w.sellPriceHT ?? 0) > 0;
      if (!hasSellingPrice) {
        counts.missingPrice += 1;
        if (want.has('missing_price')) missingIssues.push('Sans prix de vente');
      }

      const relevantLevels = ctx.stock.filter((s) => s.wineId === w.id && s.qty > 0 && (siteId === 'all' || s.siteId === siteId));
      const missingBin = relevantLevels.some((s) => !s.bin?.trim() && (!s.bins || s.bins.length === 0));
      if (missingBin) {
        counts.missingBin += 1;
        if (want.has('missing_bin')) missingIssues.push('En stock sans casier/emplacement');
      }

      if (!w.technicalSheet || (!w.technicalSheet.nez && !w.technicalSheet.bouche && !w.technicalSheet.accords)) {
        counts.missingTechSheet += 1;
        if (want.has('missing_tech_sheet')) missingIssues.push('Sans fiche technique');
      }

      if (!w.apogeeFrom || !w.apogeeTo) {
        counts.missingApogee += 1;
        if (want.has('missing_apogee')) missingIssues.push('Sans fenêtre d’apogée');
      }

      if (!w.allergens) {
        counts.missingAllergens += 1;
        if (want.has('missing_allergens')) missingIssues.push('Allergènes non renseignés');
      }

      if (missingIssues.length > 0) {
        items.push({
          id: `qual-${w.id}`,
          wineId: w.id,
          label: wineLabel(w),
          issue: missingIssues.join(' · '),
          qty,
        });
      }
    }

    return {
      siteId,
      siteLabel: siteName(ctx.sites, siteId, locale),
      counts,
      truncated: items.length > limit,
      items: items.slice(0, limit),
    };
  },
  toCards(output, ctx) {
    const locale = ctx.locale ?? ctx.org.locale ?? 'fr';
    return [
      {
        id: `card-quality-${Date.now()}`,
        kind: 'quality',
        title: locale === 'en' ? 'Catalog Data Quality' : 'Qualité & Complétude des fiches',
        metrics: [
          { label: locale === 'en' ? 'No price' : 'Sans prix', value: String(output.counts.missingPrice), tone: output.counts.missingPrice > 0 ? 'warn' : 'ok' },
          { label: locale === 'en' ? 'No bin' : 'Sans casier', value: String(output.counts.missingBin), tone: output.counts.missingBin > 0 ? 'warn' : 'ok' },
          { label: locale === 'en' ? 'Duplicates' : 'Doublons', value: String(output.counts.duplicateGroups), tone: output.counts.duplicateGroups > 0 ? 'bad' : 'ok' },
        ],
        items: output.items.slice(0, 8).map((it) => ({
          id: it.id,
          title: it.label,
          subtitle: it.issue,
          badge: `${it.qty} btl`,
          badgeTone: 'warn',
          href: it.id.startsWith('dup-') ? '/vins?tab=duplicates' : `/vins?open=${it.wineId}`,
        })),
        link: {
          label: locale === 'en' ? 'Open catalog' : 'Ouvrir le catalogue des vins',
          to: output.counts.duplicateGroups > 0 ? '/vins?tab=duplicates' : '/vins',
        },
      },
    ];
  },
};

/* ---------------------------------------------------------------- 6. help */

interface HelpOutput {
  query: string;
  matches: {
    id: string;
    title: string;
    summary: string;
    steps: string[];
    route?: string;
  }[];
}

const helpTool: AssistantTool<Record<string, unknown>, HelpOutput> = {
  name: 'help',
  needsCosts: false,
  async run(ctx, input) {
    const locale = ctx.locale ?? ctx.org.locale ?? 'fr';
    const query = typeof input.query === 'string' ? input.query : '';
    const matches = searchHelpArticles(query, locale, ctx.org.modules, ctx.role, 3);
    return { query, matches };
  },
  toCards(output, ctx) {
    const locale = ctx.locale ?? ctx.org.locale ?? 'fr';
    const top = output.matches[0];
    if (!top) return [];
    return [
      {
        id: `card-help-${top.id}-${Date.now()}`,
        kind: 'help',
        title: top.title,
        subtitle: top.summary,
        items: top.steps.map((s, idx) => ({
          id: `${top.id}-step-${idx}`,
          title: `${idx + 1}. ${s}`,
        })),
        ...(top.route
          ? {
              link: {
                label: locale === 'en' ? 'Open screen' : 'Ouvrir l’écran correspondant',
                to: top.route,
              },
            }
          : {}),
      },
    ];
  },
};

/* ---------------------------------------------------------------- 7. navigate (inclut Étape 2 : Pré-remplissage guidé) */

interface NavigateOutput {
  allowed: boolean;
  reason?: string;
  route: string;
  label: string;
  actionKind: 'open_page' | 'prefill_new_wine' | 'prefill_movement' | 'filter_wines';
  duplicateWarning?: { wineId: string; label: string; qty: number };
  winePrefill?: WinePrefillPayload;
  movementPrefill?: MovementPrefillPayload;
}

const navigateTool: AssistantTool<Record<string, unknown>, NavigateOutput> = {
  name: 'navigate',
  needsCosts: false,
  async run(ctx, input) {
    const locale = ctx.locale ?? ctx.org.locale ?? 'fr';
    const rawRoute = typeof input.route === 'string' ? input.route.trim() : '/';
    const baseRoute = rawRoute.split('?')[0];
    const navItem = NAV.find((n) => n.path === baseRoute);

    if (navItem && !isNavVisible(navItem, ctx.org.modules, ctx.role)) {
      const modDisabled = navItem.module && !ctx.hasModule(navItem.module);
      return {
        allowed: false,
        reason: modDisabled
          ? locale === 'en'
            ? `Module "${navItem.module}" is not enabled for this organization.`
            : `Le module « ${navItem.module} » n’est pas activé pour votre établissement.`
          : locale === 'en'
            ? `Your role (${ctx.role}) does not have access to ${baseRoute}.`
            : `Votre rôle (${ctx.role}) n’a pas accès à l’écran ${baseRoute}.`,
        route: '/',
        label: '',
        actionKind: 'open_page',
      };
    }

    const actionKind =
      input.actionKind === 'prefill_new_wine' || input.actionKind === 'prefill_movement' || input.actionKind === 'filter_wines'
        ? input.actionKind
        : 'open_page';

    if (actionKind === 'prefill_new_wine' && ctx.role === 'staff') {
      return {
        allowed: false,
        reason:
          locale === 'en'
            ? 'Creating a new wine in the catalog requires a back-office role (sommelier, manager, owner).'
            : 'La création d’une nouvelle fiche vin est réservée au back-office (sommelier, responsable, propriétaire).',
        route: '/vins',
        label: '',
        actionKind: 'open_page',
      };
    }

    let finalRoute = rawRoute;
    let winePrefill: WinePrefillPayload | undefined;
    let movementPrefill: MovementPrefillPayload | undefined;
    let duplicateWarning: NavigateOutput['duplicateWarning'];

    if (actionKind === 'prefill_new_wine' && input.winePrefill && typeof input.winePrefill === 'object') {
      const wp = input.winePrefill as Record<string, unknown>;
      const siteId = resolveSiteId(ctx.sites, wp.initialSiteId, ctx.activeSiteId !== 'all' ? ctx.activeSiteId : ctx.sites[0]?.id ?? '');
      winePrefill = {
        producer: typeof wp.producer === 'string' ? wp.producer : undefined,
        name: typeof wp.name === 'string' ? wp.name : undefined,
        appellation: typeof wp.appellation === 'string' ? wp.appellation : undefined,
        cuvee: typeof wp.cuvee === 'string' ? wp.cuvee : undefined,
        vintage: typeof wp.vintage === 'string' ? wp.vintage : undefined,
        color: typeof wp.color === 'string' ? (wp.color as WineColor) : undefined,
        formatCl: typeof wp.formatCl === 'number' ? wp.formatCl : 75,
        region: typeof wp.region === 'string' ? wp.region : undefined,
        subRegion: typeof wp.subRegion === 'string' ? wp.subRegion : undefined,
        country: typeof wp.country === 'string' ? wp.country : undefined,
        grapes: typeof wp.grapes === 'string' ? wp.grapes : undefined,
        ...(ctx.canSeeCosts && typeof wp.buyPriceHT === 'number' ? { buyPriceHT: wp.buyPriceHT } : {}),
        ...(typeof wp.sellPriceHT === 'number' ? { sellPriceHT: wp.sellPriceHT } : {}),
        ...(typeof wp.menuPriceTTC === 'number' ? { menuPriceTTC: wp.menuPriceTTC } : {}),
        ...(typeof wp.initialQty === 'number' && wp.initialQty > 0 ? { initialQty: wp.initialQty, initialSiteId: siteId } : {}),
      };
      finalRoute = '/vins?new=1';

      // Vérification anti-doublon systématique avant de proposer une création
      const matches = findMatches(
        {
          producer: winePrefill.producer,
          name: winePrefill.name || winePrefill.cuvee || winePrefill.appellation,
          vintage: winePrefill.vintage,
          color: winePrefill.color,
          formatCl: winePrefill.formatCl,
        },
        ctx.wines,
        1,
      );
      if (matches.length > 0 && matches[0].score >= 0.75) {
        const m = matches[0].wine;
        duplicateWarning = {
          wineId: m.id,
          label: wineLabel(m),
          qty: qtyAt(ctx.stock, m.id, 'all'),
        };
      }
    } else if (actionKind === 'prefill_movement' && input.movementPrefill && typeof input.movementPrefill === 'object') {
      const mp = input.movementPrefill as Record<string, unknown>;
      const mType = mp.type === 'out' || mp.type === 'transfer' || mp.type === 'adjust' ? mp.type : 'in';
      const siteId = resolveSiteId(ctx.sites, mp.siteId, ctx.activeSiteId !== 'all' ? ctx.activeSiteId : ctx.sites[0]?.id ?? '');
      let matchedWine = typeof mp.wineId === 'string' ? ctx.wines.find((w) => w.id === mp.wineId) : undefined;
      if (!matchedWine && typeof mp.wineLabel === 'string') {
        const found = findMatches({ name: mp.wineLabel }, ctx.wines, 1);
        if (found[0]) matchedWine = found[0].wine;
      }
      movementPrefill = {
        wineId: matchedWine?.id ?? (typeof mp.wineId === 'string' ? mp.wineId : undefined),
        wineLabel: matchedWine ? wineLabel(matchedWine) : typeof mp.wineLabel === 'string' ? mp.wineLabel : undefined,
        type: mType,
        qty: typeof mp.qty === 'number' && mp.qty !== 0 ? mp.qty : 1,
        reason: typeof mp.reason === 'string' ? (mp.reason as MovementPrefillPayload['reason']) : mType === 'in' ? 'achat' : 'vente',
        ...(ctx.canSeeCosts && typeof mp.unitCostHT === 'number' ? { unitCostHT: mp.unitCostHT } : {}),
        siteId,
        bin: typeof mp.bin === 'string' ? mp.bin : undefined,
        note: typeof mp.note === 'string' ? mp.note : undefined,
      };
      finalRoute = `/stock?new=${mType}`;
    } else if (actionKind === 'filter_wines' && input.filterParams && typeof input.filterParams === 'object') {
      const fp = input.filterParams as Record<string, unknown>;
      const sp = new URLSearchParams();
      for (const k of ['q', 'color', 'region', 'subRegion', 'producer', 'vintage', 'stock', 'tab'] as const) {
        if (typeof fp[k] === 'string' && fp[k]) sp.set(k, fp[k] as string);
      }
      if (fp.apogee) sp.set('apogee', '1');
      const qs = sp.toString();
      finalRoute = `${baseRoute === '/stock' ? '/stock' : '/vins'}${qs ? `?${qs}` : ''}`;
    }

    const defaultLabel =
      actionKind === 'prefill_new_wine'
        ? locale === 'en'
          ? 'Open pre-filled wine form'
          : 'Ouvrir la fiche vin pré-remplie'
        : actionKind === 'prefill_movement'
          ? locale === 'en'
            ? 'Open pre-filled stock movement'
            : 'Ouvrir le mouvement pré-rempli'
          : locale === 'en'
            ? `Open ${baseRoute}`
            : `Ouvrir ${baseRoute}`;

    return sanitizeForRole(
      {
        allowed: true,
        route: finalRoute,
        label: typeof input.label === 'string' && input.label.trim() ? input.label.trim() : defaultLabel,
        actionKind,
        duplicateWarning,
        winePrefill,
        movementPrefill,
      },
      ctx.canSeeCosts,
    );
  },
  toCards(output, ctx) {
    if (!output.allowed) return [];
    const locale = ctx.locale ?? ctx.org.locale ?? 'fr';
    const intl = locale === 'en' ? 'en-GB' : 'fr-FR';

    if (output.actionKind === 'prefill_new_wine' && output.winePrefill) {
      const wp = output.winePrefill;
      const details = [
        wp.producer,
        wp.name || wp.cuvee || wp.appellation,
        wp.vintage,
        wp.formatCl ? formatLabel(wp.formatCl) : '',
        wp.initialQty ? `+${wp.initialQty} btl` : '',
        ctx.canSeeCosts && wp.buyPriceHT ? `${eur(wp.buyPriceHT, intl)} HT` : '',
      ]
        .filter(Boolean)
        .join(' · ');

      const cards: ResultCard[] = [];
      if (output.duplicateWarning) {
        cards.push({
          id: `card-dup-warn-${Date.now()}`,
          kind: 'action',
          title: locale === 'en' ? 'Existing wine detected in catalog' : 'Ce vin existe déjà dans le catalogue',
          subtitle: `${output.duplicateWarning.label} (${output.duplicateWarning.qty} btl en stock)`,
          link: {
            label:
              locale === 'en'
                ? `Add stock to existing wine (+${wp.initialQty ?? 1} btl)`
                : `Ajouter au stock existant (+${wp.initialQty ?? 1} btl)`,
            to: '/stock?new=in',
            state: {
              movementPrefill: {
                wineId: output.duplicateWarning.wineId,
                wineLabel: output.duplicateWarning.label,
                type: 'in',
                qty: wp.initialQty ?? 1,
                reason: 'achat',
                unitCostHT: ctx.canSeeCosts ? wp.buyPriceHT : undefined,
                siteId: wp.initialSiteId,
              },
            },
          },
        });
      }

      cards.push({
        id: `card-prefill-wine-${Date.now()}`,
        kind: 'action',
        title: locale === 'en' ? 'Ready to pre-fill new wine' : 'Prêt à pré-remplir la nouvelle fiche vin',
        subtitle: details || output.label,
        link: {
          label: output.label,
          to: output.route,
          state: { winePrefill: wp },
        },
      });
      return cards;
    }

    if (output.actionKind === 'prefill_movement' && output.movementPrefill) {
      const mp = output.movementPrefill;
      const details = [
        mp.wineLabel,
        mp.type === 'in' ? `+${mp.qty ?? 1} btl` : `${mp.qty ?? 1} btl`,
        mp.reason,
        ctx.canSeeCosts && mp.unitCostHT ? `${eur(mp.unitCostHT, intl)} HT` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return [
        {
          id: `card-prefill-mv-${Date.now()}`,
          kind: 'action',
          title: locale === 'en' ? 'Ready to pre-fill stock movement' : 'Mouvement de stock prêt à vérifier',
          subtitle: details,
          link: {
            label: output.label,
            to: output.route,
            state: { movementPrefill: mp },
          },
        },
      ];
    }

    return [
      {
        id: `card-nav-${Date.now()}`,
        kind: 'action',
        title: output.label,
        subtitle: output.route,
        link: {
          label: output.label,
          to: output.route,
        },
      },
    ];
  },
};

export const TOOLS: AssistantTool<any, any>[] = [
  findWinesTool,
  stockAlertsTool,
  rotationTool,
  marginsTool,
  dataQualityTool,
  helpTool,
  navigateTool,
];

/**
 * Calcule la liste des outils autorisés pour l'utilisateur courant,
 * directement dérivée de `registry.ts` (modules + rôles) et de `canSeeCosts`.
 */
export function availableTools(ctx: Pick<AssistantToolContext, 'hasModule' | 'role' | 'canSeeCosts'>): AssistantTool<any, any>[] {
  return TOOLS.filter(
    (t) =>
      (!t.module || ctx.hasModule(t.module)) &&
      hasRole(ctx.role, t.roles) &&
      (!t.needsCosts || ctx.canSeeCosts),
  );
}

export function getToolByName(name: string): AssistantTool<any, any> | undefined {
  return TOOLS.find((t) => t.name === name);
}
