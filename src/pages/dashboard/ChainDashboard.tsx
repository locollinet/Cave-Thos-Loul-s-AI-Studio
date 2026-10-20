import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeftRight, BarChart3, Building2, CheckCircle2, ClipboardCheck, History, MapPinned } from 'lucide-react';
import type { Movement } from '@/types';
import { useCollection, useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Badge, Button, cx } from '@/ui';
import { stockByWine } from '@/data/stock';
import { num } from '@/lib/utils';
import { CHART, ChartFrame, ChartTooltip, axisProps, compactNumber, cursorProps, gridProps } from '@/modules/pilotage/charts';
import { chainInsight, siteComparison } from './compute';
import { DrinkingWindowPanel } from './CellarDashboard';
import { Invite, Ledger, MovementList, Panel, PanelLink, Skeleton } from './parts';
import { Shell } from './Shell';

export default function ChainDashboard() {
  const { t, intl } = useI18n();
  const navigate = useNavigate();
  const { org, wines, stock, sites, hasModule, can, setActiveSiteId } = useOrg();
  const recent = useCollection<Movement>('movements', { orderBy: ['createdAt', 'desc'], limit: 8 });
  const f0 = (n: number) => new Intl.NumberFormat(intl, { style: 'currency', currency: org.currency, maximumFractionDigits: 0 }).format(n);

  const live = useMemo(() => wines.filter((w) => !w.isArchived), [wines]);
  const allQty = useMemo(() => stockByWine(stock, 'all'), [stock]);
  const cmp = useMemo(() => siteComparison(sites, live, stock), [sites, live, stock]);
  const siteName = (name: string, kind: string) => name || t(`site.${kind}`);
  const chartData = cmp.rows.map((r) => ({ name: siteName(r.site.name, r.site.kind), value: r.costHT, bottles: r.bottles }));
  const maxValue = Math.max(...chartData.map((d) => d.value));
  const ranked = [...cmp.rows].sort((a, b) => b.out + b.low - (a.out + a.low));
  const maxShare = Math.max(0.0001, ...cmp.rows.map((r) => r.share));

  const openSite = (id: string) => {
    setActiveSiteId(id);
    navigate('/stock');
  };

  const insight = chainInsight({ wines: live.length, rows: cmp.rows.map((r) => ({ ...r, site: { ...r.site, name: siteName(r.site.name, r.site.kind) } })) });

  const actions = (
    <>
      <Link to="/stock?new=transfer">
        <Button size="sm" variant="primary" icon={<ArrowLeftRight className="size-4" />}>
          {t('stock.type.transfer')}
        </Button>
      </Link>
      <Link to="/inventaire">
        <Button size="sm" icon={<ClipboardCheck className="size-4" />}>
          {t('nav.inventory')}
        </Button>
      </Link>
      {hasModule('pilotage') && can('accountant') && (
        <Link to="/pilotage">
          <Button size="sm" icon={<BarChart3 className="size-4" />}>
            {t('nav.pilotage')}
          </Button>
        </Link>
      )}
    </>
  );

  return (
    <Shell insight={insight} actions={actions} empty={live.length === 0}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Panel highlight className="lg:col-span-8" eyebrow={t('home.chain.eyebrow')} title={t('home.chain.title', { n: cmp.rows.length })}>
          <Ledger
            items={[
              { label: t('dash.bottles'), value: num(cmp.total.bottles, intl), sub: t('dash.refs', { n: cmp.total.refs }) },
              { label: t('dash.stockCost'), value: f0(cmp.total.costHT), sub: t('common.ht') },
              { label: t('dash.stockSell'), value: f0(cmp.total.sellHT), sub: t('common.ht') },
              { label: t('dash.alerts'), value: num(cmp.total.out + cmp.total.low, intl), sub: t('dash.alertsSub', { out: cmp.total.out, low: cmp.total.low }), tone: cmp.total.out + cmp.total.low ? 'warn' : 'ok' },
            ]}
          />
          <ChartFrame className="mt-5 h-48" label={t('home.chain.chart')} empty={cmp.total.bottles <= 0} emptyTitle={t('home.chain.emptyTitle')} emptyHint={t('home.chain.emptyHint')}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} vertical horizontal={false} />
                <XAxis type="number" {...axisProps} tickFormatter={(v: number) => compactNumber(v, intl)} />
                <YAxis type="category" dataKey="name" {...axisProps} width={110} />
                <Tooltip cursor={cursorProps} content={(p) => <ChartTooltip {...p} formatValue={(v) => f0(v)} />} />
                <Bar isAnimationActive={false} dataKey="value" name={t('dash.stockCost')} radius={[0, 3, 3, 0]} maxBarSize={22}>
                  {chartData.map((d, i) => (
                    <Cell key={d.name + i} fill={d.value === maxValue ? CHART.accent : CHART.brand} fillOpacity={d.value === maxValue ? 1 : 0.82} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </Panel>

        <Panel className="lg:col-span-4" eyebrow={t('home.chain.alertsEyebrow')} title={t('home.chain.alertsTitle')}>
          {ranked.every((r) => r.out + r.low === 0) ? (
            <Invite icon={CheckCircle2} title={t('home.chain.noAlerts')} hint={t('home.chain.noAlertsHint')} />
          ) : (
            <ul className="divide-y divide-border/60">
              {ranked.map((r) => (
                <li key={r.site.id}>
                  <button
                    type="button"
                    onClick={() => openSite(r.site.id)}
                    className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    <Building2 className="size-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{siteName(r.site.name, r.site.kind)}</span>
                    {r.out > 0 && <Badge tone="bad">{t('home.chain.out', { n: r.out })}</Badge>}
                    {r.low > 0 && <Badge tone="warn">{t('home.chain.low', { n: r.low })}</Badge>}
                    {r.out + r.low === 0 && <Badge tone="ok">{t('home.chain.ok')}</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="lg:col-span-12" eyebrow={t('home.chain.cmpEyebrow')} title={t('home.chain.cmpTitle')} action={<PanelLink to="/stock">{t('dash.seeStock')}</PanelLink>}>
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">{t('home.chain.cmpTitle')}</caption>
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.12em] text-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">{t('common.site')}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t('dash.bottles')}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t('dash.refsTotal')}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t('dash.stockCost')}</th>
                  <th scope="col" className="w-40 py-2 pr-3 font-medium">{t('home.chain.share')}</th>
                  <th scope="col" className="py-2 text-right font-medium">{t('dash.alerts')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {cmp.rows.map((r) => (
                  <tr key={r.site.id}>
                    <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                      <button type="button" onClick={() => openSite(r.site.id)} className="group text-left focus-visible:outline-2 focus-visible:outline-brand">
                        <span className="block font-medium group-hover:text-brand">{siteName(r.site.name, r.site.kind)}</span>
                        <span className="block text-xs text-muted">{t(`site.${r.site.kind}`)}</span>
                      </button>
                    </th>
                    <td className="tabular py-2.5 pr-3 text-right">{num(r.bottles, intl)}</td>
                    <td className="tabular py-2.5 pr-3 text-right">{num(r.refs, intl)}</td>
                    <td className="tabular py-2.5 pr-3 text-right">{f0(r.costHT)}</td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 rounded-full bg-surface-2" aria-hidden>
                          <div className="h-1.5 rounded-full bg-brand/70" style={{ width: `${(r.share / maxShare) * 100}%` }} />
                        </div>
                        <span className="tabular w-9 text-right text-xs text-muted">{Math.round(r.share * 100)} %</span>
                      </div>
                    </td>
                    <td className={cx('tabular py-2.5 text-right', r.out ? 'text-bad' : r.low ? 'text-warn' : 'text-muted')}>{r.out + r.low}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold">
                  <th scope="row" className="py-2.5 pr-3 text-left font-display text-base">{t('pilotage.consolidated')}</th>
                  <td className="tabular py-2.5 pr-3 text-right">{num(cmp.total.bottles, intl)}</td>
                  <td className="tabular py-2.5 pr-3 text-right">{num(cmp.total.refs, intl)}</td>
                  <td className="tabular py-2.5 pr-3 text-right">{f0(cmp.total.costHT)}</td>
                  <td className="py-2.5 pr-3" />
                  <td className="tabular py-2.5 text-right">{cmp.total.out + cmp.total.low}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>

        <DrinkingWindowPanel wines={live} qty={allQty} className="lg:col-span-7" />

        <Panel className="lg:col-span-5" eyebrow={t('home.recent.eyebrow')} title={t('dash.recent')} action={<PanelLink to="/stock">{t('home.today.see')}</PanelLink>}>
          {recent.loading ? (
            <Skeleton />
          ) : recent.rows.length === 0 ? (
            <Invite icon={History} title={t('home.today.emptyTitle')} hint={t('home.today.emptyHint')} />
          ) : (
            <MovementList rows={recent.rows} limit={7} showDate />
          )}
        </Panel>
      </div>
      {sites.length <= 1 && (
        <Invite icon={MapPinned} title={t('home.chain.addSite')} hint={t('home.chain.addSiteHint')} to="/reglages?tab=sites" cta={t('home.chain.addSiteCta')} />
      )}
    </Shell>
  );
}
