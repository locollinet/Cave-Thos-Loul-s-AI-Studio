import { useI18n } from '@/i18n';
import { dateFr, eur } from '@/lib/utils';
import { Badge, Table, Td, Th } from '@/ui';
import { useOrg } from '@/app/org';
import type { WinePerf } from './types';
import type { PilotageView } from './usePilotage';

function PerfTable({ rows, empty }: { rows: WinePerf[]; empty: string }) {
  const { t, intl } = useI18n();
  const { org } = useOrg();
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <Table>
      <thead>
        <tr>
          <Th>{t('pilotage.wine')}</Th>
          <Th right>{t('common.qty')}</Th>
          <Th right>{t('pilotage.kpi.revenue')}</Th>
          <Th right>{t('pilotage.kpi.margin')}</Th>
          <Th right>{t('pilotage.stock')}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.wineId}>
            <Td className="max-w-72 truncate">{r.label}</Td>
            <Td right>{r.qty}</Td>
            <Td right>{eur(r.revenueHT, org.currency, intl)}</Td>
            <Td right className={r.margin < 0 ? 'text-bad' : ''}>{eur(r.margin, org.currency, intl)}</Td>
            <Td right>{r.stock}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

const TONE = { A: 'ok', B: 'warn', C: 'neutral' } as const;

export default function WinesTab({ view }: { view: PilotageView }) {
  const { t, intl } = useI18n();
  const { org } = useOrg();
  const f = (n: number) => eur(n, org.currency, intl);

  return (
    <div className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <h2 className="mb-2 font-display text-lg font-semibold">{t('pilotage.top')}</h2>
          <PerfTable rows={view.ranking.top} empty={t('pilotage.noSales')} />
        </section>
        <section>
          <h2 className="mb-2 font-display text-lg font-semibold">{t('pilotage.flop')}</h2>
          <PerfTable rows={view.ranking.flop} empty={t('pilotage.noSales')} />
        </section>
      </div>

      <section>
        <h2 className="font-display text-lg font-semibold">{t('pilotage.abc')}</h2>
        <p className="mb-2 text-xs text-muted">{t('pilotage.abcHint')}</p>
        {view.abc.length === 0 ? (
          <p className="text-sm text-muted">{t('pilotage.noSales')}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('pilotage.class')}</Th>
                <Th>{t('pilotage.wine')}</Th>
                <Th right>{t('pilotage.kpi.margin')}</Th>
                <Th right>{t('pilotage.cumul')}</Th>
              </tr>
            </thead>
            <tbody>
              {view.abc.map((r) => (
                <tr key={r.wineId}>
                  <Td>
                    <Badge tone={TONE[r.cls]}>{r.cls}</Badge>
                  </Td>
                  <Td className="max-w-72 truncate">{r.label}</Td>
                  <Td right>{f(r.margin)}</Td>
                  <Td right>{r.cumulPct} %</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold">{t('pilotage.dormant')}</h2>
        <p className="mb-2 text-xs text-muted">{t('pilotage.dormantHint')}</p>
        {view.dormant.length === 0 ? (
          <p className="text-sm text-muted">{t('pilotage.noDormant')}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('pilotage.wine')}</Th>
                <Th right>{t('pilotage.stock')}</Th>
                <Th right>{t('pilotage.kpi.stockCost')}</Th>
                <Th>{t('pilotage.lastOut')}</Th>
              </tr>
            </thead>
            <tbody>
              {view.dormant.map((r) => (
                <tr key={r.wineId}>
                  <Td className="max-w-72 truncate">{r.label}</Td>
                  <Td right>{r.stock}</Td>
                  <Td right>{f(r.costValue)}</Td>
                  <Td>{r.lastOut ? `${dateFr(r.lastOut, intl)} (${t('pilotage.daysAgo', { n: r.daysSince ?? 0 })})` : t('pilotage.never')}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
