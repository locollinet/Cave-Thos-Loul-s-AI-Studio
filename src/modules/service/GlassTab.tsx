import { useMemo, useState } from 'react';
import { CircleCheck, GlassWater, TriangleAlert } from 'lucide-react';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { stockByWine } from '@/data/stock';
import { eur, pct } from '@/lib/utils';
import { formatLabel } from '@/lib/wine';
import { Badge, Button, Card, EmptyState, cx } from '@/ui';
import { DAY, freshness, glassesPerBottle, glassesRemaining, isServable, lossRate, openDurationMs } from './logic';
import { FreshnessBadge, GlassProgress, LossModal, useDuration } from './parts';
import type { OpenBottle } from './types';
import type { useServiceActions } from './useServiceActions';

const LEVEL_RANK = { expired: 0, soon: 1, fresh: 2 } as const;

export function GlassTab({ siteId, bottles, now, actions }: { siteId: string; bottles: OpenBottle[]; now: number; actions: ReturnType<typeof useServiceActions> }) {
  const { t, intl } = useI18n();
  const { wines, stock, org } = useOrg();
  const [lossFor, setLossFor] = useState<OpenBottle | null>(null);
  const qty = useMemo(() => stockByWine(stock, siteId), [stock, siteId]);

  const open = useMemo(
    () =>
      bottles
        .filter((b) => b.siteId === siteId && b.status === 'open')
        .sort((a, b) => LEVEL_RANK[freshness(a, now).level] - LEVEL_RANK[freshness(b, now).level] || a.openedAt - b.openedAt),
    [bottles, siteId, now],
  );
  const openIds = useMemo(() => new Set(open.map((b) => b.wineId)), [open]);
  const available = useMemo(
    () =>
      wines
        .filter((w) => !w.isArchived && isServable(w) && !openIds.has(w.id))
        .sort((a, b) => Number((qty.get(b.id) ?? 0) > 0) - Number((qty.get(a.id) ?? 0) > 0) || a.producer.localeCompare(b.producer, intl)),
    [wines, openIds, qty, intl],
  );
  const closed30 = useMemo(() => bottles.filter((b) => b.siteId === siteId && b.status !== 'open' && (b.closedAt ?? 0) >= now - 30 * DAY), [bottles, siteId, now]);

  return (
    <div className="@container space-y-8">
      <section aria-labelledby="open-bottles-title">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="open-bottles-title" className="font-display text-2xl">
            {t('service.openList.title')}
          </h2>
          {closed30.length > 0 && <span className="text-xs text-muted">{t('service.lossRate', { pct: pct(lossRate(closed30) * 100) })}</span>}
        </div>
        {open.length === 0 ? (
          <EmptyState icon={<GlassWater className="size-8" />} title={t('service.openList.empty')} hint={t('service.openList.emptyHint')} />
        ) : (
          <ul className="grid gap-3 @2xl:grid-cols-2">
            {open.map((b) => (
              <li key={b.id}>
                <OpenBottleCard bottle={b} now={now} actions={actions} onLoss={() => setLossFor(b)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="glass-wines-title">
        <h2 id="glass-wines-title" className="mb-3 font-display text-2xl">
          {t('service.available.title')}
        </h2>
        {available.length === 0 ? (
          <EmptyState icon={<GlassWater className="size-8" />} title={t('service.available.empty')} hint={t('service.available.emptyHint')} />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {available.map((w) => {
              const n = qty.get(w.id) ?? 0;
              const g = w.byGlass!;
              return (
                <li key={w.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium uppercase tracking-[0.14em] text-muted">{w.producer}</div>
                    <div className="line-clamp-2 font-display text-xl leading-tight">
                      {w.name} <span className="text-muted">{w.vintage}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {[
                        formatLabel(w.formatCl),
                        t('service.glassesPerBottle', { n: glassesPerBottle(w.formatCl, g.glassCl), cl: g.glassCl }),
                        g.priceTTC ? t('service.glassPrice', { price: eur(g.priceTTC, org.currency, intl) }) : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={cx('tabular font-display text-2xl leading-none', n < 1 && 'text-bad')}>{n}</div>
                    <div className="text-[11px] text-muted">{t('service.inStock')}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="primary" size="lg" className="min-h-12 min-w-20" disabled={n < 1} onClick={() => actions.openBottle(w, undefined, 'standard')}>
                      {t('service.open')}
                      <span className="sr-only"> — {w.producer} {w.name} {w.vintage}</span>
                    </Button>
                    <Button
                      variant="secondary"
                      size="lg"
                      className="min-h-12 px-2.5 text-xs font-semibold text-accent hover:border-accent"
                      disabled={n < 1}
                      title="Ouvrir sous azote / Coravin (conservation 28 jours)"
                      onClick={() => actions.openBottle(w, undefined, 'coravin')}
                    >
                      ⚡ Coravin
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <LossModal
        bottle={lossFor && (bottles.find((b) => b.id === lossFor.id) ?? lossFor)}
        onClose={() => setLossFor(null)}
        onConfirm={(n) => {
          const cur = bottles.find((b) => b.id === lossFor?.id);
          if (cur) actions.loss(cur, n);
          setLossFor(null);
        }}
      />
    </div>
  );
}

function OpenBottleCard({ bottle: b, now, actions, onLoss }: { bottle: OpenBottle; now: number; actions: ReturnType<typeof useServiceActions>; onLoss: () => void }) {
  const { t, intl } = useI18n();
  const { org } = useOrg();
  const fmt = useDuration();
  const left = glassesRemaining(b);
  const level = freshness(b, now).level;
  return (
    <Card className={cx('flex h-full flex-col p-4', level === 'expired' && 'border-bad/50', level === 'soon' && 'border-warn/50')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-2xl leading-tight">{b.wineLabel}</h3>
          <p className="mt-1 text-sm text-muted">
            {t('service.openedSince', { d: fmt(openDurationMs(b, now)) })}
            {b.openedBy ? ` · ${t('service.openedBy', { name: b.openedBy })}` : ''}
          </p>
        </div>
        {level !== 'fresh' && <TriangleAlert className={cx('size-6 shrink-0', level === 'expired' ? 'text-bad' : 'text-warn')} aria-hidden />}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <FreshnessBadge bottle={b} now={now} />
        {b.priceTTC ? <Badge className="px-2.5 py-1 text-xs">{t('service.glassPrice', { price: eur(b.priceTTC, org.currency, intl) })}</Badge> : null}
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-2">
        <span className="tabular font-display text-3xl leading-none">{t('service.served', { served: b.glassesServed, total: b.glassesTotal })}</span>
        <span className="text-sm text-muted">
          {t('service.remaining', { n: left })}
          {(b.lostGlasses ?? 0) > 0 ? ` · ${t('service.lost', { n: b.lostGlasses ?? 0 })}` : ''}
        </span>
      </div>
      <div className="mt-2">
        <GlassProgress bottle={b} />
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <Button
          variant="primary"
          size="lg"
          className="min-h-20 rounded-xl"
          disabled={left < 1}
          onClick={() => actions.serve(b, 1)}
          icon={<GlassWater className="size-7" aria-hidden />}
        >
          <span className="text-2xl font-semibold">{t('service.serve')}</span>
          <span className="sr-only"> — {b.wineLabel}</span>
        </Button>
        <Button
          size="lg"
          className="min-h-20 min-w-20 rounded-xl"
          disabled={b.glassesServed < 1}
          aria-label={t('service.unserve.aria', { wine: b.wineLabel })}
          onClick={() => actions.serve(b, -1)}
        >
          <span className="text-2xl">{t('service.unserve')}</span>
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button size="lg" className="min-h-12" onClick={() => void actions.finish(b)} icon={<CircleCheck className="size-5" aria-hidden />}>
          {t('service.finish')}
        </Button>
        <Button size="lg" variant="ghost" className="min-h-12 border border-bad/30 text-bad hover:bg-bad/10" disabled={left < 1} onClick={onLoss} icon={<TriangleAlert className="size-5" aria-hidden />}>
          {t('service.loss')}
        </Button>
      </div>
    </Card>
  );
}
