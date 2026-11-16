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

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Vins arrivés depuis longtemps sans se vendre</h2>
          <p className="text-xs text-muted">
            Flacons entrés en cave depuis plus de 3 mois sans aucune sortie récente (≥ 90 j). Les vins de garde volontaire (apogée future) sont séparés pour ne pas fausser l’alerte.
          </p>
        </div>

        {view.dormant.length > 0 && (() => {
          const idle = view.dormant.filter((r) => !r.isAgingReserve);
          const reserve = view.dormant.filter((r) => r.isAgingReserve);
          const idleCost = idle.reduce((s, r) => s + r.costValue, 0);
          const idleBtl = idle.reduce((s, r) => s + r.stock, 0);
          const reserveCost = reserve.reduce((s, r) => s + r.costValue, 0);
          const reserveBtl = reserve.reduce((s, r) => s + r.stock, 0);

          return (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  À déstocker — Prêts à boire qui dorment
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-2xl font-semibold text-ink tabular">{f(idleCost)}</span>
                  <span className="text-xs text-muted">HT immobilisés · {idleBtl} btl ({idle.length} réf.)</span>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-surface-2/40 p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Garde voulue — Apogée pas encore atteinte
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-2xl font-semibold text-ink tabular">{f(reserveCost)}</span>
                  <span className="text-xs text-muted">HT en vieillissement · {reserveBtl} btl ({reserve.length} réf.)</span>
                </div>
              </div>
            </div>
          );
        })()}

        {view.dormant.length === 0 ? (
          <p className="text-sm text-muted">{t('pilotage.noDormant')}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('pilotage.wine')}</Th>
                <Th>Arrivé en cave</Th>
                <Th>Ventes / Sorties</Th>
                <Th>Statut</Th>
                <Th right>{t('pilotage.stock')}</Th>
                <Th right>Valeur immobilisée</Th>
              </tr>
            </thead>
            <tbody>
              {view.dormant.map((r) => {
                const monthsHeld = r.holdingDays != null ? Math.max(1, Math.round(r.holdingDays / 30)) : null;
                return (
                  <tr key={r.wineId}>
                    <Td className="max-w-72 truncate font-medium">{r.label}</Td>
                    <Td className="whitespace-nowrap text-xs text-muted">
                      {r.firstIn ? `${dateFr(r.firstIn, intl)} · ` : ''}
                      <span className="font-semibold text-ink">
                        {monthsHeld !== null ? `il y a ${monthsHeld} mois` : '—'}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {r.lastOut ? (
                        <span className="text-xs text-muted">
                          {dateFr(r.lastOut, intl)} ({t('pilotage.daysAgo', { n: r.daysSince ?? 0 })})
                        </span>
                      ) : (
                        <Badge tone="bad">Jamais vendu</Badge>
                      )}
                    </Td>
                    <Td>
                      {r.isAgingReserve ? (
                        <Badge tone="neutral">Garde voulue · {r.apogeeFrom}</Badge>
                      ) : (
                        <Badge tone="warn">À déstocker</Badge>
                      )}
                    </Td>
                    <Td right>{r.stock}</Td>
                    <Td right className="font-mono font-medium">{f(r.costValue)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
