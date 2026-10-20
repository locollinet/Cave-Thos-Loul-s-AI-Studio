import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownToLine, CheckCircle2, FilePlus2, FileText, Receipt, ShieldCheck, Users, Wine as WineIcon } from 'lucide-react';
import type { Movement } from '@/types';
import { useCollection, useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Badge, Button } from '@/ui';
import { stockByWine, stockValue } from '@/data/stock';
import { eur, num, today } from '@/lib/utils';
import { wineLabel } from '@/lib/wine';
import type { Payment, SaleDocument } from '@/modules/negoce/types';
import { periodPresets } from '@/modules/pilotage/kpis';
import { CHART, ChartFrame, ChartTooltip, axisProps, compactNumber, cursorProps, gridProps, monthLabel } from '@/modules/pilotage/charts';
import { negoceInsight, receivables, revenueSummary, staleQuotes, stockAlerts, topClients, topWines } from './compute';
import { AlertList, Invite, Ledger, Panel, PanelLink, RankList, Skeleton, percent } from './parts';
import { Shell } from './Shell';

export default function NegoceDashboard() {
  const { t, intl } = useI18n();
  const { org, wines, stock, activeSiteId, can, hasModule } = useOrg();
  const docs = useCollection<SaleDocument>('documents');
  const payments = useCollection<Payment>('payments');
  const movements = useCollection<Movement>('movements');
  const loading = docs.loading || payments.loading || movements.loading;
  const asOf = today();
  const sales = hasModule('negoce');
  const f = (n: number) => eur(n, org.currency, intl);
  const f0 = (n: number) => new Intl.NumberFormat(intl, { style: 'currency', currency: org.currency, maximumFractionDigits: 0 }).format(n);

  const live = useMemo(() => wines.filter((w) => !w.isArchived), [wines]);
  const byId = useMemo(() => new Map(wines.map((w) => [w.id, w])), [wines]);
  const qty = useMemo(() => stockByWine(stock, activeSiteId), [stock, activeSiteId]);
  const value = useMemo(() => stockValue(live, stock, activeSiteId), [live, stock, activeSiteId]);
  const alerts = useMemo(() => stockAlerts(live, stock, activeSiteId), [live, stock, activeSiteId]);

  const revenue = useMemo(() => revenueSummary({ wines, docs: docs.rows, movements: movements.rows, asOf }), [wines, docs.rows, movements.rows, asOf]);
  const recv = useMemo(() => receivables(docs.rows, payments.rows, asOf), [docs.rows, payments.rows, asOf]);
  const quotes = useMemo(() => staleQuotes(docs.rows, asOf), [docs.rows, asOf]);
  const clients = useMemo(() => topClients(docs.rows, periodPresets(asOf).last12), [docs.rows, asOf]);
  const best = useMemo(() => topWines(revenue.sales12, (id) => (byId.get(id) ? wineLabel(byId.get(id)!) : '—')), [revenue.sales12, byId]);

  const insight = negoceInsight({ wines: live.length, revenue: loading ? null : revenue, receivables: loading ? null : recv, stale: quotes.length, out: alerts.out.length });
  const thisMonth = asOf.slice(0, 7);
  const alertRows = [...alerts.out.map((wine) => ({ wine, kind: 'out' as const })), ...alerts.low.map((wine) => ({ wine, kind: 'low' as const })), ...alerts.past.map((wine) => ({ wine, kind: 'past' as const }))];

  const actions = (
    <>
      {sales && (
        <Link to="/negoce?new=quote">
          <Button size="sm" variant="primary" icon={<FilePlus2 className="size-4" />}>
            {t('home.action.quote')}
          </Button>
        </Link>
      )}
      {sales && (
        <Link to="/negoce?new=invoice">
          <Button size="sm" icon={<FileText className="size-4" />}>
            {t('home.action.invoice')}
          </Button>
        </Link>
      )}
      {can('sommelier') && (
        <Link to="/stock?new=in">
          <Button size="sm" icon={<ArrowDownToLine className="size-4" />}>
            {t('stock.type.in')}
          </Button>
        </Link>
      )}
    </>
  );

  return (
    <Shell insight={insight} actions={actions} empty={live.length === 0}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Chiffre d'affaires : la carte phare */}
        <Panel
          highlight
          className="lg:col-span-8"
          eyebrow={t('home.revenue.eyebrow')}
          title={revenue.total12 > 0 ? <span className="tabular block text-5xl leading-none md:text-6xl">{f0(revenue.current)}</span> : t('home.revenue.title')}
          action={hasModule('pilotage') ? <PanelLink to="/pilotage">{t('home.revenue.analyse')}</PanelLink> : undefined}
        >
          {loading ? (
            <Skeleton lines={4} />
          ) : (
            <>
              {revenue.total12 > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                  {revenue.delta !== null ? (
                    <Badge tone={revenue.delta >= 0 ? 'ok' : 'warn'}>{percent(revenue.delta, intl, true)}</Badge>
                  ) : null}
                  <span>{revenue.delta !== null ? t('home.revenue.vsToDate', { n: f0(revenue.previousToDate) }) : t('home.revenue.noPrevious')}</span>
                  <span aria-hidden>·</span>
                  <span>{t('home.revenue.lastMonth', { n: f0(revenue.previous) })}</span>
                  <span aria-hidden>·</span>
                  <span>{t('home.revenue.year', { n: f0(revenue.total12) })}</span>
                </div>
              )}
              <ChartFrame
                label={t('home.revenue.chart')}
                empty={revenue.total12 <= 0}
                emptyTitle={t('home.revenue.emptyTitle')}
                emptyHint={t('home.revenue.emptyHint')}
                emptyAction={
                  sales ? (
                    <Link to="/negoce?new=quote">
                      <Button size="sm" variant="primary" icon={<FilePlus2 className="size-4" />}>
                        {t('home.action.quote')}
                      </Button>
                    </Link>
                  ) : undefined
                }
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenue.monthly} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="month" {...axisProps} tickFormatter={(k: string) => monthLabel(k, intl)} interval="preserveStartEnd" />
                    <YAxis {...axisProps} width={44} tickFormatter={(v: number) => compactNumber(v, intl)} />
                    <Tooltip cursor={cursorProps} content={(p) => <ChartTooltip {...p} formatValue={(v) => f(v)} formatLabel={(l) => monthLabel(l, intl, true)} />} />
                    <Bar isAnimationActive={false} dataKey="revenueHT" name={t('pilotage.kpi.revenue')} radius={[3, 3, 0, 0]} maxBarSize={30}>
                      {revenue.monthly.map((p) => (
                        <Cell key={p.month} fill={p.month === thisMonth ? CHART.accent : CHART.brand} fillOpacity={p.month === thisMonth ? 1 : 0.82} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            </>
          )}
        </Panel>

        {/* Encours clients */}
        <Panel className="lg:col-span-4" eyebrow={t('home.recv.eyebrow')} title={t('home.recv.title')} action={sales ? <PanelLink to="/negoce/payments">{t('home.recv.see')}</PanelLink> : undefined}>
          {loading ? (
            <Skeleton />
          ) : recv.outstanding <= 0 ? (
            <Invite icon={ShieldCheck} title={t('home.recv.clearTitle')} hint={t('home.recv.clearHint')} />
          ) : (
            <div className="flex flex-1 flex-col gap-4">
              <div>
                <div className="tabular font-display text-4xl leading-none">{f0(recv.outstanding)}</div>
                <p className="mt-1 text-sm text-muted">{t('home.recv.outstanding', { n: recv.outstandingCount })}</p>
              </div>
              {recv.overdue > 0 ? (
                <div className="rounded-lg border border-bad/25 bg-bad/8 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-bad">{t('home.recv.overdue', { n: recv.overdueCount })}</span>
                    <span className="tabular font-display text-xl text-bad">{f0(recv.overdue)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{t('home.recv.oldest', { n: recv.maxDaysLate })}</p>
                </div>
              ) : (
                <p className="flex items-center gap-2 text-sm text-ok">
                  <CheckCircle2 className="size-4" aria-hidden />
                  {t('home.recv.noneLate')}
                </p>
              )}
              <div className="mt-auto" aria-hidden>
                <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="bg-brand/60" style={{ width: `${((recv.outstanding - recv.overdue) / recv.outstanding) * 100}%` }} />
                  <div className="bg-bad" style={{ width: `${(recv.overdue / recv.outstanding) * 100}%` }} />
                </div>
              </div>
            </div>
          )}
        </Panel>

        {/* Devis à relancer */}
        <Panel className="lg:col-span-7" eyebrow={t('home.quotes.eyebrow')} title={t('home.quotes.title')} action={sales ? <PanelLink to="/negoce">{t('home.quotes.see')}</PanelLink> : undefined}>
          {loading ? (
            <Skeleton />
          ) : quotes.length === 0 ? (
            <Invite icon={FileText} title={t('home.quotes.emptyTitle')} hint={t('home.quotes.emptyHint')} to={sales ? '/negoce?new=quote' : undefined} cta={t('home.action.quote')} />
          ) : (
            <ul className="divide-y divide-border/60">
              {quotes.slice(0, 5).map((q) => (
                <li key={q.doc.id}>
                  <Link to={`/negoce/view/${q.doc.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:text-brand focus-visible:outline-2 focus-visible:outline-brand">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{q.doc.partnerName || '—'}</span>
                      <span className="block truncate text-xs text-muted">
                        {q.doc.number || t('home.quotes.draftNo')} · {t('home.quotes.age', { n: q.age })}
                      </span>
                    </span>
                    {q.expired && <Badge tone="warn">{t('home.quotes.expired')}</Badge>}
                    <span className="tabular shrink-0 font-medium">{f0(q.doc.totalHT)}</span>
                  </Link>
                </li>
              ))}
              {quotes.length > 5 && <li className="pt-2 text-xs text-muted">{t('home.more', { n: quotes.length - 5 })}</li>}
            </ul>
          )}
        </Panel>

        {/* Stock */}
        <Panel className="lg:col-span-5" eyebrow={t('home.stock.eyebrow')} title={t('home.stock.title')} action={<PanelLink to="/stock">{t('dash.seeStock')}</PanelLink>}>
          <Ledger
            rows
            items={[
              { label: t('dash.bottles'), value: num(value.bottles, intl), sub: t('dash.refs', { n: live.filter((w) => (qty.get(w.id) ?? 0) > 0).length }) },
              { label: t('dash.stockCost'), value: f0(value.costHT), sub: t('common.ht') },
              { label: t('dash.stockSell'), value: f0(value.sellHT), sub: t('dash.potentialMargin', { n: f0(value.sellHT - value.costHT) }) },
            ]}
          />
          <div className="mt-5">
            {alertRows.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-ok">
                <CheckCircle2 className="size-4" aria-hidden />
                {t('dash.allGood')}
              </p>
            ) : (
              <>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{t('dash.alertsSub', { out: alerts.out.length, low: alerts.low.length })}</p>
                <AlertList rows={alertRows} qty={qty} limit={5} />
              </>
            )}
          </div>
        </Panel>

        {/* Meilleurs clients & vins */}
        <Panel className="lg:col-span-6" eyebrow={t('home.top.eyebrow')} title={t('home.top.clients')} action={<PanelLink to="/contacts">{t('home.top.seeClients')}</PanelLink>}>
          {loading ? (
            <Skeleton lines={4} />
          ) : clients.length === 0 ? (
            <Invite icon={Users} title={t('home.top.clientsEmpty')} hint={t('home.top.clientsEmptyHint')} to={sales ? '/negoce?new=invoice' : undefined} cta={t('home.action.invoice')} />
          ) : (
            <RankList items={clients.map((c) => ({ id: c.id, label: c.label, value: f0(c.amount), sub: t('home.top.invoices', { n: c.qty }), ratio: c.amount / clients[0].amount }))} />
          )}
        </Panel>
        <Panel className="lg:col-span-6" eyebrow={t('home.top.eyebrow')} title={t('home.top.wines')} action={<PanelLink to="/vins">{t('home.top.seeWines')}</PanelLink>}>
          {loading ? (
            <Skeleton lines={4} />
          ) : best.length === 0 ? (
            <Invite icon={WineIcon} title={t('home.top.winesEmpty')} hint={t('home.top.winesEmptyHint')} />
          ) : (
            <RankList
              items={best.map((w) => ({ id: w.id, label: w.label, value: f0(w.amount), sub: t('home.top.bottles', { n: num(w.qty, intl) }), ratio: best[0].amount > 0 ? w.amount / best[0].amount : 0, to: `/vins?open=${w.id}` }))}
            />
          )}
        </Panel>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Receipt className="size-3.5" aria-hidden />
        {t('home.footnote.ht')}
      </p>
    </Shell>
  );
}
