import { useMemo, useState } from 'react';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { eur } from '@/lib/utils';
import { Card, PageHeader, Spinner, Stat } from '@/ui';
import { computeResult } from './result';
import YearSelect, { Disclaimer } from './Shared';
import { currentYear, useCompta } from './useCompta';

export default function OverviewPage() {
  const { t, intl } = useI18n();
  const { org, hasModule } = useOrg();
  const counter = !hasModule('negoce');
  const data = useCompta();
  const [year, setYear] = useState(currentYear());
  const f = (n: number) => eur(n, org.currency, intl);
  const r = useMemo(
    () =>
      computeResult({
        year,
        docs: data.docs,
        payments: data.payments,
        purchases: data.purchases,
        expenses: data.expenses,
        assets: data.assets,
        counterSales: counter ? data.movements : undefined,
        counterVatRate: org.defaultVatRate,
      }),
    [year, data.docs, data.payments, data.purchases, data.expenses, data.assets, data.movements, counter, org.defaultVatRate],
  );

  if (data.loading) return <Spinner className="mx-auto mt-20" />;

  const row = (label: string, value: number, strong?: boolean, minus?: boolean) => (
    <div className={`flex justify-between px-4 py-2.5 text-sm ${strong ? 'bg-surface-2/50 font-semibold' : ''}`}>
      <span className={strong ? '' : 'text-muted'}>{label}</span>
      <span className="tabular">{minus ? '− ' : ''}{f(value)}</span>
    </div>
  );

  return (
    <>
      <PageHeader title={t('compta.overview.title')} subtitle={t('compta.overview.subtitle')} actions={<YearSelect value={year} onChange={setYear} />} />
      <Disclaimer text={t('compta.disclaimer')} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('compta.overview.result')} value={f(r.result)} tone={r.result < 0 ? 'bad' : 'ok'} />
        <Stat label={t('compta.overview.cash')} value={f(r.cash)} tone={r.cash < 0 ? 'bad' : undefined} sub={t('compta.overview.cashHint')} />
        <Stat label={t('compta.overview.receivables')} value={f(r.receivables)} />
        <Stat label={t('compta.overview.payables')} value={f(r.payables)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="divide-y divide-border">
          <h2 className="px-4 py-3 font-display text-lg font-semibold">{t('compta.overview.resultTitle')}</h2>
          {row(t('compta.overview.revenue'), r.revenueHT)}
          {row(t('compta.overview.purchases'), r.purchasesHT, false, true)}
          {row(t('compta.overview.expenses'), r.expensesHT, false, true)}
          {row(t('compta.overview.depreciation'), r.depreciation, false, true)}
          {row(t('compta.overview.result'), r.result, true)}
        </Card>
        <Card className="divide-y divide-border">
          <h2 className="px-4 py-3 font-display text-lg font-semibold">{t('compta.overview.cashTitle')}</h2>
          {row(t('compta.overview.cashIn'), r.cashIn)}
          {row(t('compta.overview.cashOut'), r.cashOut, false, true)}
          {row(t('compta.overview.cash'), r.cash, true)}
        </Card>
      </div>
      <p className="mt-3 text-xs text-muted">{t('compta.overview.stockNote')}</p>
      {counter && <p className="mt-1 text-xs text-muted">{t('compta.overview.counterNote')}</p>}
    </>
  );
}
