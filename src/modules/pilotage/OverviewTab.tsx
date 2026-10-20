import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from '@/i18n';
import { Card, EmptyState, Stat } from '@/ui';
import { eur, pct } from '@/lib/utils';
import { BarChart3 } from 'lucide-react';
import { useOrg } from '@/app/org';
import type { PilotageView } from './usePilotage';
import { CHART, ChartFrame, ChartLegend, ChartTooltip, axisProps, compactNumber, cursorProps, gridProps, monthLabel } from './charts';

const nf = (n: number | null, suffix = '') => (n === null ? '—' : `${n}${suffix}`);

export default function OverviewTab({ view }: { view: PilotageView }) {
  const { t, intl } = useI18n();
  const { org } = useOrg();
  const { kpis: k } = view;
  const f = (n: number) => eur(n, org.currency, intl);
  const restaurant = view.input.restaurantMode;
  const monthlyEmpty = view.monthly.every((p) => !p.revenueHT && !p.margin);

  if (!view.hasSales && k.stockBottles === 0) return <EmptyState icon={<BarChart3 className="size-8" />} title={t('pilotage.empty')} hint={t('pilotage.emptyHint')} />;

  return (
    <div className="space-y-5">
      {restaurant && <p className="rounded-lg bg-info/10 px-3 py-2 text-xs text-info">{t('pilotage.restaurantNote')}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t(restaurant ? 'pilotage.kpi.theoreticalRevenue' : 'pilotage.kpi.revenue')} value={view.hasSales || k.servicesHT ? f(k.revenueHT) : '—'} sub={k.servicesHT ? t('pilotage.kpi.services', { n: f(k.servicesHT) }) : view.hasSales ? t('common.ht') : t('pilotage.noSalesShort')} />
        <Stat label={t(restaurant ? 'pilotage.kpi.materialCost' : 'pilotage.kpi.cogs')} value={view.hasSales ? f(k.cogs) : '—'} />
        <Stat label={t('pilotage.kpi.margin')} value={view.hasSales ? f(k.grossMargin) : '—'} tone={!view.hasSales ? undefined : k.grossMargin < 0 ? 'bad' : 'ok'} sub={t('pilotage.kpi.afterShrink', { n: f(k.marginAfterShrink) })} />
        <Stat label={t('pilotage.kpi.rates')} value={k.markRate === null ? '—' : pct(k.markRate)} sub={t('pilotage.kpi.markupRate', { n: k.marginRate === null ? '—' : pct(k.marginRate) })} />
        <Stat label={t('pilotage.kpi.stockCost')} value={f(k.stockCost)} sub={t('pilotage.kpi.stockBottles', { n: k.stockBottles })} />
        <Stat label={t('pilotage.kpi.stockSell')} value={f(k.stockSell)} sub={t('common.ht')} />
        <Stat label={t('pilotage.kpi.turnover')} value={nf(k.turnover, '×')} sub={t('pilotage.kpi.perYear')} />
        <Stat label={t('pilotage.kpi.coverage')} value={nf(k.coverageDays, ` ${t('pilotage.days')}`)} sub={t('pilotage.kpi.shrink', { n: f(k.shrinkCost) })} />
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">{t('pilotage.monthly')}</h2>
          {monthlyEmpty ? null : (
            <ChartLegend
              items={[
                { label: t(restaurant ? 'pilotage.kpi.theoreticalRevenue' : 'pilotage.kpi.revenue'), color: CHART.brand },
                { label: t('pilotage.kpi.margin'), color: CHART.accent, kind: 'line' },
              ]}
            />
          )}
        </div>
        <ChartFrame label={t('pilotage.monthly')} empty={monthlyEmpty} emptyTitle={t('pilotage.chart.emptyTitle')} emptyHint={t('pilotage.chart.emptyHint')} className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={view.monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="month" {...axisProps} tickFormatter={(k: string) => monthLabel(k, intl)} />
              <YAxis {...axisProps} width={48} tickFormatter={(v: number) => compactNumber(v, intl)} />
              <Tooltip cursor={cursorProps} content={(p) => <ChartTooltip {...p} formatValue={(v) => f(v)} formatLabel={(l) => monthLabel(l, intl, true)} />} />
              <Bar dataKey="revenueHT" name={t(restaurant ? 'pilotage.kpi.theoreticalRevenue' : 'pilotage.kpi.revenue')} fill={CHART.brand} radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Line dataKey="margin" name={t('pilotage.kpi.margin')} stroke={CHART.accent} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartFrame>
      </Card>
    </div>
  );
}
