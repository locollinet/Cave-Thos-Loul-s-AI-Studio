import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownToLine, ArrowUpFromLine, BookOpen, CalendarClock, CheckCircle2, ClipboardCheck, GlassWater, History, Hourglass } from 'lucide-react';
import type { Movement } from '@/types';
import { useCollection, useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Badge, cx } from '@/ui';
import { stockByWine, stockValue } from '@/data/stock';
import { num, today } from '@/lib/utils';
import { wineLabel } from '@/lib/wine';
import type { WineList } from '@/modules/carte/types';
import { CHART, ChartFrame, ChartLegend, ChartTooltip, axisProps, cursorProps, gridProps, monthLabel } from '@/modules/pilotage/charts';
import { COLOR_DOT } from '../Wines';
import { cellarInsight, drinkingWindow, listShortages, monthlyExits, openBottles, stockAlerts, todayMovements, type OpenBottleDoc, type OpenBottleRow, type WindowRow } from './compute';
import { AlertList, Invite, Ledger, MovementList, Panel, PanelLink, QuickActions, Skeleton, type QuickAction } from './parts';
import { Shell } from './Shell';

export function useServiceActions(): QuickAction[] {
  const { t } = useI18n();
  const { hasModule } = useOrg();
  const out: QuickAction[] = [];
  if (hasModule('carte')) out.push({ to: '/service', label: t('nav.service'), hint: t('home.quick.serviceHint'), icon: GlassWater, primary: true });
  out.push({ to: '/stock?new=in', label: t('stock.type.in'), hint: t('home.quick.inHint'), icon: ArrowDownToLine });
  out.push({ to: '/stock?new=out', label: t('stock.type.out'), hint: t('home.quick.outHint'), icon: ArrowUpFromLine });
  out.push({ to: '/inventaire', label: t('nav.inventory'), hint: t('home.quick.inventoryHint'), icon: ClipboardCheck });
  return out;
}

const FRESH_TONE = { fresh: 'ok', watch: 'warn', late: 'bad' } as const;

export function OpenBottlesList({ rows, limit = 5 }: { rows: OpenBottleRow[]; limit?: number }) {
  const { t, intl } = useI18n();
  return (
    <ul className="divide-y divide-border/60">
      {rows.slice(0, limit).map((b) => (
        <li key={b.id} className="flex items-center gap-3 py-2.5 text-sm">
          <span className={cx('size-2 shrink-0 rounded-full', b.freshness === 'fresh' ? 'bg-ok' : b.freshness === 'watch' ? 'bg-warn' : 'bg-bad')} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{b.label}</span>
            <span className="block text-xs text-muted">
              {b.ageDays < 1 ? t('home.glass.today') : t('home.glass.age', { n: num(Math.floor(b.ageDays), intl) })}
              {b.glassesLeft !== null && ` · ${t('home.glass.left', { n: b.glassesLeft })}`}
            </span>
          </span>
          <Badge tone={FRESH_TONE[b.freshness]}>{t(`home.fresh.${b.freshness}`)}</Badge>
        </li>
      ))}
    </ul>
  );
}

function WindowList({ rows, empty }: { rows: WindowRow[]; empty: string }) {
  if (!rows.length) return <p className="py-2 text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border/60">
      {rows.slice(0, 5).map((r) => (
        <li key={r.wine.id}>
          <Link to={`/vins?open=${r.wine.id}`} className="flex items-center gap-2.5 py-2 text-sm hover:text-brand focus-visible:outline-2 focus-visible:outline-brand">
            <span className={cx('size-2.5 shrink-0 rounded-full', COLOR_DOT[r.wine.color])} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{wineLabel(r.wine)}</span>
            <span className="tabular shrink-0 text-xs text-muted">{r.year}</span>
            <span className="tabular w-8 shrink-0 text-right font-medium">{r.qty}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DrinkingWindowPanel({ wines, qty, className }: { wines: Parameters<typeof drinkingWindow>[0]; qty: Map<string, number>; className?: string }) {
  const { t } = useI18n();
  const year = new Date().getFullYear();
  const win = useMemo(() => drinkingWindow(wines, qty, year), [wines, qty, year]);
  const total = win.entering.length + win.leaving.length + win.past.length;
  return (
    <Panel className={className} eyebrow={t('home.window.eyebrow')} title={t('home.window.title')}>
      {total === 0 ? (
        <Invite icon={CalendarClock} title={t('home.window.emptyTitle')} hint={t('home.window.emptyHint')} to="/vins" cta={t('home.window.emptyCta')} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <section className="min-w-0">
            <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-warn">
              <Hourglass className="size-3.5" aria-hidden />
              {t('home.window.leaving', { n: win.leaving.length + win.past.length })}
            </h3>
            <WindowList rows={[...win.past, ...win.leaving]} empty={t('home.window.none')} />
          </section>
          <section className="min-w-0">
            <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ok">
              <CalendarClock className="size-3.5" aria-hidden />
              {t('home.window.entering', { n: win.entering.length })}
            </h3>
            <WindowList rows={win.entering} empty={t('home.window.none')} />
          </section>
        </div>
      )}
    </Panel>
  );
}

export default function CellarDashboard() {
  const { t, intl } = useI18n();
  const { org, wines, stock, activeSiteId, hasModule, can } = useOrg();
  const movements = useCollection<Movement>('movements');
  const lists = useCollection<WineList>('wineLists');
  const bottles = useCollection<OpenBottleDoc>('openBottles');
  const carte = hasModule('carte');
  const asOf = today();
  const f0 = (n: number) => new Intl.NumberFormat(intl, { style: 'currency', currency: org.currency, maximumFractionDigits: 0 }).format(n);

  const live = useMemo(() => wines.filter((w) => !w.isArchived), [wines]);
  const qty = useMemo(() => stockByWine(stock, activeSiteId), [stock, activeSiteId]);
  const value = useMemo(() => stockValue(live, stock, activeSiteId), [live, stock, activeSiteId]);
  const alerts = useMemo(() => stockAlerts(live, stock, activeSiteId), [live, stock, activeSiteId]);
  const published = useMemo(() => lists.rows.filter((l) => l?.published), [lists.rows]);
  const shortages = useMemo(() => listShortages(published, live, stock), [published, live, stock]);
  const open = useMemo(() => openBottles(bottles.rows, wines, Date.now(), activeSiteId), [bottles.rows, wines, activeSiteId]);
  const todays = useMemo(() => todayMovements(movements.rows, asOf, activeSiteId), [movements.rows, asOf, activeSiteId]);
  const exits = useMemo(() => monthlyExits(movements.rows, asOf, activeSiteId), [movements.rows, asOf, activeSiteId]);
  const year = new Date().getFullYear();
  const win = useMemo(() => drinkingWindow(live, qty, year), [live, qty, year]);
  const actions = useServiceActions();

  const insight = cellarInsight({
    wines: live.length,
    shortages: shortages.length,
    late: open.filter((b) => b.freshness === 'late').length,
    leaving: win.leaving.length + win.past.length,
    out: alerts.out.length,
    low: alerts.low.length,
  });
  const alertRows = [...alerts.out.map((wine) => ({ wine, kind: 'out' as const })), ...alerts.low.map((wine) => ({ wine, kind: 'low' as const }))];
  const exitsEmpty = exits.every((p) => !p.served && !p.losses);

  return (
    <Shell
      insight={insight}
      empty={live.length === 0}
      actions={
        <div className="w-full">
          <QuickActions actions={actions} large />
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {carte && (
          <Panel
            highlight
            className="lg:col-span-7"
            eyebrow={t('home.list.eyebrow')}
            title={t('home.list.title')}
            action={<PanelLink to="/carte">{t('home.list.see')}</PanelLink>}
          >
            {lists.loading ? (
              <Skeleton />
            ) : published.length === 0 ? (
              <Invite icon={BookOpen} title={t('home.list.noneTitle')} hint={t('home.list.noneHint')} to="/carte" cta={t('home.list.noneCta')} />
            ) : shortages.length === 0 ? (
              <div className="flex flex-1 items-center gap-3">
                <CheckCircle2 className="size-8 shrink-0 text-ok" aria-hidden />
                <div>
                  <p className="font-display text-xl">{t('home.list.allGood')}</p>
                  <p className="text-sm text-muted">{t('home.list.allGoodHint', { n: published.length })}</p>
                </div>
              </div>
            ) : (
              <>
                <p className="-mt-2 mb-2 text-sm text-muted">{t('home.list.shortHint', { n: shortages.length })}</p>
                <ul className="divide-y divide-border/60">
                  {shortages.slice(0, 6).map((s) => (
                    <li key={s.wine.id}>
                      <Link to={`/vins?open=${s.wine.id}`} className="flex items-center gap-3 py-2 text-sm hover:text-brand focus-visible:outline-2 focus-visible:outline-brand">
                        <span className={cx('size-2.5 shrink-0 rounded-full', COLOR_DOT[s.wine.color])} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{wineLabel(s.wine)}</span>
                          <span className="block truncate text-xs text-muted">{s.lists.join(' · ')}</span>
                        </span>
                        <Badge tone={s.hidden ? 'neutral' : 'bad'}>{t(s.hidden ? 'home.list.hidden' : 'home.list.shown')}</Badge>
                      </Link>
                    </li>
                  ))}
                  {shortages.length > 6 && <li className="pt-2 text-xs text-muted">{t('home.more', { n: shortages.length - 6 })}</li>}
                </ul>
              </>
            )}
          </Panel>
        )}

        {carte && (
          <Panel className="lg:col-span-5" eyebrow={t('home.glass.eyebrow')} title={t('home.glass.title')} action={<PanelLink to="/service">{t('home.glass.see')}</PanelLink>}>
            {bottles.loading ? (
              <Skeleton />
            ) : open.length === 0 ? (
              <Invite icon={GlassWater} title={t('home.glass.emptyTitle')} hint={t('home.glass.emptyHint')} to="/service" cta={t('home.glass.emptyCta')} />
            ) : (
              <OpenBottlesList rows={open} />
            )}
          </Panel>
        )}

        <DrinkingWindowPanel wines={live} qty={qty} className="lg:col-span-7" />

        <Panel className="lg:col-span-5" eyebrow={t('home.today.eyebrow')} title={t('home.today.title')} action={<PanelLink to="/stock">{t('home.today.see')}</PanelLink>}>
          {movements.loading ? (
            <Skeleton />
          ) : todays.length === 0 ? (
            <Invite icon={History} title={t('home.today.emptyTitle')} hint={t('home.today.emptyHint')} />
          ) : (
            <MovementList rows={todays} limit={7} />
          )}
        </Panel>

        <Panel className="lg:col-span-8" eyebrow={t('home.exits.eyebrow')} title={t('home.exits.title')}>
          {!exitsEmpty && (
            <div className="-mt-2 mb-3">
              <ChartLegend items={[{ label: t('home.exits.served'), color: CHART.brand }, { label: t('home.exits.losses'), color: CHART.accent }]} />
            </div>
          )}
          <ChartFrame label={t('home.exits.title')} empty={!movements.loading && exitsEmpty} emptyTitle={t('home.exits.emptyTitle')} emptyHint={t('home.exits.emptyHint')}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={exits} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="month" {...axisProps} tickFormatter={(k: string) => monthLabel(k, intl)} interval="preserveStartEnd" />
                <YAxis {...axisProps} width={36} allowDecimals={false} />
                <Tooltip cursor={cursorProps} content={(p) => <ChartTooltip {...p} formatValue={(v) => t('home.top.bottles', { n: num(v, intl) })} formatLabel={(l) => monthLabel(l, intl, true)} />} />
                <Bar isAnimationActive={false} dataKey="served" stackId="x" name={t('home.exits.served')} fill={CHART.brand} maxBarSize={30} />
                <Bar isAnimationActive={false} dataKey="losses" stackId="x" name={t('home.exits.losses')} fill={CHART.accent} radius={[3, 3, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </Panel>

        <Panel className="lg:col-span-4" eyebrow={t('home.stock.eyebrow')} title={t('home.cellar.title')} action={<PanelLink to="/stock">{t('dash.seeStock')}</PanelLink>}>
          <Ledger
            rows
            items={[
              { label: t('dash.bottles'), value: num(value.bottles, intl), sub: t('dash.refs', { n: live.filter((w) => (qty.get(w.id) ?? 0) > 0).length }) },
              can('accountant') ? { label: t('dash.stockCost'), value: f0(value.costHT), sub: t('common.ht') } : { label: t('dash.refsTotal'), value: num(live.length, intl) },
            ]}
          />
          <div className="mt-4">
            {alertRows.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-ok">
                <CheckCircle2 className="size-4" aria-hidden />
                {t('dash.allGood')}
              </p>
            ) : (
              <AlertList rows={alertRows} qty={qty} limit={5} />
            )}
          </div>
        </Panel>
      </div>
    </Shell>
  );
}
