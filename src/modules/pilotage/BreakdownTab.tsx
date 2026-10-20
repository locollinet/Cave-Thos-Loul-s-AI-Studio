import { useMemo, useState } from 'react';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { eur, pct } from '@/lib/utils';
import { formatLabel } from '@/lib/wine';
import { Card, Segmented, Table, Td, Th } from '@/ui';
import { BREAKDOWN_KEYS, marginBy } from './kpis';
import type { PilotageView } from './usePilotage';

type Dim = keyof typeof BREAKDOWN_KEYS;

export function BreakdownTab({ view }: { view: PilotageView }) {
  const { t, intl } = useI18n();
  const { org, wines } = useOrg();
  const [dim, setDim] = useState<Dim>('producer');
  const rows = useMemo(() => marginBy(view.data.sales, wines, BREAKDOWN_KEYS[dim]), [view.data.sales, wines, dim]);
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.margin)));
  const label = (key: string) => (!key ? '—' : dim === 'color' ? t(`pilotage.color.${key}`) : dim === 'format' ? formatLabel(Number(key)) : key);

  return (
    <div className="space-y-4">
      <Segmented<Dim>
        value={dim}
        onChange={setDim}
        options={(['producer', 'region', 'color', 'format'] as Dim[]).map((d) => ({ value: d, label: t(`pilotage.dim.${d}`) }))}
      />
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t('pilotage.noSales')}</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t(`pilotage.dim.${dim}`)}</Th>
              <Th right>{t('common.qty')}</Th>
              <Th right>{t('pilotage.kpi.revenue')}</Th>
              <Th right>{t('pilotage.kpi.margin')}</Th>
              <Th right>{t('pilotage.markRate')}</Th>
              <Th className="w-40" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <Td>{label(r.key)}</Td>
                <Td right>{r.qty}</Td>
                <Td right>{eur(r.revenueHT, org.currency, intl)}</Td>
                <Td right>{eur(r.margin, org.currency, intl)}</Td>
                <Td right>{r.markRate === null ? '—' : pct(r.markRate)}</Td>
                <Td>
                  <div className="h-2 rounded-full bg-surface-2" aria-hidden>
                    <div className={`h-2 rounded-full ${r.margin < 0 ? 'bg-bad' : 'bg-brand'}`} style={{ width: `${(Math.abs(r.margin) / max) * 100}%` }} />
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

export function SitesTab({ view }: { view: PilotageView }) {
  const { t, intl } = useI18n();
  const { org, sites } = useOrg();
  const f = (n: number) => eur(n, org.currency, intl);
  const total = view.siteRows.reduce((s, r) => ({ revenueHT: s.revenueHT + r.revenueHT, margin: s.margin + r.margin, stockCost: s.stockCost + r.stockCost, stockBottles: s.stockBottles + r.stockBottles }), {
    revenueHT: 0,
    margin: 0,
    stockCost: 0,
    stockBottles: 0,
  });
  return (
    <Card className="overflow-hidden">
      <Table className="border-0">
        <thead>
          <tr>
            <Th>{t('common.site')}</Th>
            <Th right>{t('pilotage.kpi.revenue')}</Th>
            <Th right>{t('pilotage.kpi.margin')}</Th>
            <Th right>{t('pilotage.kpi.stockCost')}</Th>
            <Th right>{t('pilotage.stock')}</Th>
          </tr>
        </thead>
        <tbody>
          {view.siteRows.map((r) => (
            <tr key={r.siteId}>
              <Td>{sites.find((s) => s.id === r.siteId)?.name ?? r.siteId}</Td>
              <Td right>{f(r.revenueHT)}</Td>
              <Td right>{f(r.margin)}</Td>
              <Td right>{f(r.stockCost)}</Td>
              <Td right>{r.stockBottles}</Td>
            </tr>
          ))}
          <tr className="bg-surface-2/50 font-semibold">
            <Td>{t('pilotage.consolidated')}</Td>
            <Td right>{f(total.revenueHT)}</Td>
            <Td right>{f(total.margin)}</Td>
            <Td right>{f(total.stockCost)}</Td>
            <Td right>{total.stockBottles}</Td>
          </tr>
        </tbody>
      </Table>
    </Card>
  );
}
