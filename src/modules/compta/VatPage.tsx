import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { downloadBlob, eur, pct, toCsv } from '@/lib/utils';
import { Button, Card, Field, PageHeader, Segmented, Select, Spinner, Stat, Table, Td, Th } from '@/ui';
import { currentYear, useCompta } from './useCompta';
import { periodFor, vatCsvRows, vatReturn } from './vat';
import YearSelect, { Disclaimer } from './Shared';

type Kind = 'month' | 'quarter';

export default function VatPage() {
  const { t, intl } = useI18n();
  const { org } = useOrg();
  const data = useCompta();
  const now = new Date();
  const [kind, setKind] = useState<Kind>('quarter');
  const [year, setYear] = useState(currentYear());
  const [idx, setIdx] = useState(kind === 'month' ? now.getMonth() + 1 : Math.floor(now.getMonth() / 3) + 1);
  const f = (n: number) => eur(n, org.currency, intl);
  const period = useMemo(() => periodFor(kind, year, idx), [kind, year, idx]);
  const v = useMemo(() => vatReturn({ docs: data.docs, purchases: data.purchases, expenses: data.expenses, assets: data.assets, period }), [data.docs, data.purchases, data.expenses, data.assets, period]);

  const changeKind = (k: Kind) => {
    setKind(k);
    setIdx(k === 'month' ? now.getMonth() + 1 : Math.floor(now.getMonth() / 3) + 1);
  };

  const exportCsv = () => {
    const rows = vatCsvRows(v, period, {
      rate: t('compta.vat.rate'),
      base: t('compta.vat.base'),
      vat: t('compta.vat.amount'),
      collected: t('compta.vat.collected'),
      purchases: t('compta.vat.dedPurchases'),
      expenses: t('compta.vat.dedExpenses'),
      assets: t('compta.vat.dedAssets'),
      deductible: t('compta.vat.deductible'),
      balance: v.balance >= 0 ? t('compta.vat.toPay') : t('compta.vat.credit'),
      period: t('compta.vat.period'),
    });
    downloadBlob(`TVA_${period.from}_${period.to}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  };

  if (data.loading) return <Spinner className="mx-auto mt-20" />;

  return (
    <>
      <PageHeader
        title={t('compta.vat.title')}
        subtitle={t('compta.vat.subtitle')}
        actions={
          <Button icon={<Download className="size-4" />} onClick={exportCsv}>
            {t('compta.exportCsv')}
          </Button>
        }
      />
      <Disclaimer text={t('compta.disclaimer')} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Segmented<Kind> value={kind} onChange={changeKind} options={[{ value: 'month', label: t('compta.month') }, { value: 'quarter', label: t('compta.quarter') }]} />
        <YearSelect value={year} onChange={setYear} />
        <Field label={t(kind === 'month' ? 'compta.month' : 'compta.quarter')}>
          <Select value={idx} onChange={(e) => setIdx(Number(e.target.value))} className="w-36">
            {(kind === 'month' ? Array.from({ length: 12 }, (_, i) => i + 1) : [1, 2, 3, 4]).map((n) => (
              <option key={n} value={n}>
                {kind === 'month' ? new Date(2000, n - 1, 1).toLocaleDateString(intl, { month: 'long' }) : `T${n}`}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('compta.vat.collected')} value={f(v.totalCollected)} />
        <Stat label={t('compta.vat.deductible')} value={f(v.deductible.total)} />
        <Stat label={v.balance >= 0 ? t('compta.vat.toPay') : t('compta.vat.credit')} value={f(Math.abs(v.balance))} tone={v.balance > 0 ? 'warn' : 'ok'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 font-display text-lg font-semibold">{t('compta.vat.collected')}</h2>
          <Table>
            <thead>
              <tr>
                <Th>{t('compta.vat.rate')}</Th>
                <Th right>{t('compta.vat.base')}</Th>
                <Th right>{t('compta.vat.amount')}</Th>
              </tr>
            </thead>
            <tbody>
              {v.collected.length === 0 && (
                <tr>
                  <Td colSpan={3} className="text-center text-muted">
                    {t('compta.noData')}
                  </Td>
                </tr>
              )}
              {v.collected.map((r) => (
                <tr key={r.rate}>
                  <Td>{pct(r.rate)}</Td>
                  <Td right>{f(r.baseHT)}</Td>
                  <Td right>{f(r.vat)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
        <section>
          <h2 className="mb-2 font-display text-lg font-semibold">{t('compta.vat.deductible')}</h2>
          <Card className="divide-y divide-border text-sm">
            {(
              [
                ['compta.vat.dedPurchases', v.deductible.purchases],
                ['compta.vat.dedExpenses', v.deductible.expenses],
                ['compta.vat.dedAssets', v.deductible.assets],
              ] as const
            ).map(([k, n]) => (
              <div key={k} className="flex justify-between px-4 py-2.5">
                <span className="text-muted">{t(k)}</span>
                <span className="tabular">{f(n)}</span>
              </div>
            ))}
            <div className="flex justify-between px-4 py-2.5 font-semibold">
              <span>{t('compta.vat.deductible')}</span>
              <span className="tabular">{f(v.deductible.total)}</span>
            </div>
          </Card>
        </section>
      </div>
    </>
  );
}
