import { useMemo, useState } from 'react';
import { GlassWater, LogOut, Search, Wine as WineIcon, X } from 'lucide-react';
import type { Wine } from '@/types';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { stockByWine } from '@/data/stock';
import { eur } from '@/lib/utils';
import { formatLabel } from '@/lib/wine';
import { Badge, Button, Card, EmptyState, cx } from '@/ui';
import { glassesPerBottle, isServable, matchesQuery } from './logic';
import type { useServiceActions } from './useServiceActions';

const MAX_RESULTS = 40;

export function ServiceTab({ siteId, actions, onOpened }: { siteId: string; actions: ReturnType<typeof useServiceActions>; onOpened: () => void }) {
  const { t, intl } = useI18n();
  const { wines, stock } = useOrg();
  const [q, setQ] = useState('');
  const qty = useMemo(() => stockByWine(stock, siteId), [stock, siteId]);

  const results = useMemo(() => {
    const list = wines.filter((w) => !w.isArchived && (q.trim() ? matchesQuery(w, q) : (qty.get(w.id) ?? 0) > 0));
    return list.sort(
      (a, b) =>
        Number((qty.get(b.id) ?? 0) > 0) - Number((qty.get(a.id) ?? 0) > 0) ||
        Number(isServable(b)) - Number(isServable(a)) ||
        a.producer.localeCompare(b.producer, intl) ||
        a.name.localeCompare(b.name, intl),
    );
  }, [wines, q, qty, intl]);
  const shown = results.slice(0, MAX_RESULTS);

  return (
    <div className="@container">
      <div className="relative mb-4">
        <label htmlFor="service-search" className="sr-only">
          {t('service.search.label')}
        </label>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-muted" aria-hidden />
        <input
          id="service-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('service.search.placeholder')}
          autoComplete="off"
          enterKeyHint="search"
          className="h-16 w-full rounded-2xl border border-border bg-surface pl-14 pr-16 text-lg text-ink shadow-sm placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            aria-label={t('service.search.clear')}
            className="absolute right-2 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink"
          >
            <X className="size-5" />
          </button>
        )}
      </div>
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted" aria-live="polite">
        {t('service.results', { n: results.length })}
      </p>

      {shown.length === 0 ? (
        <EmptyState icon={<WineIcon className="size-8" />} title={t('service.noResults')} hint={t('service.noResults.hint')} />
      ) : (
        <ul className="grid gap-3 @5xl:grid-cols-2">
          {shown.map((w) => (
            <li key={w.id}>
              <WineServiceCard wine={w} qty={qty.get(w.id) ?? 0} actions={actions} onOpened={onOpened} />
            </li>
          ))}
        </ul>
      )}
      {results.length > shown.length && <p className="mt-4 text-center text-sm text-muted">{t('service.more', { n: results.length - shown.length })}</p>}
    </div>
  );
}

function WineServiceCard({ wine: w, qty, actions, onOpened }: { wine: Wine; qty: number; actions: ReturnType<typeof useServiceActions>; onOpened: () => void }) {
  const { t, intl } = useI18n();
  const { org } = useOrg();
  const glass = isServable(w) ? w.byGlass : undefined;
  const label = `${w.producer} ${w.name} ${w.vintage}`;
  const empty = qty < 1;
  return (
    <Card className={cx('@container flex h-full flex-col p-4', empty && 'opacity-70')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium uppercase tracking-[0.14em] text-muted">{w.producer}</div>
          <div className="mt-0.5 font-display text-2xl leading-tight">{w.name}</div>
          <div className="mt-1 text-sm text-muted">
            {[w.vintage, formatLabel(w.formatCl), w.region].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={cx('tabular font-display text-4xl leading-none', empty ? 'text-bad' : qty <= (w.alertThreshold || 0) ? 'text-warn' : 'text-ink')}>{qty}</div>
          <div className="mt-1 text-xs text-muted">{t('service.inStock')}</div>
        </div>
      </div>
      {glass && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="accent" className="px-2.5 py-1 text-xs">
            <GlassWater className="size-3.5" aria-hidden />
            {t('service.byGlass')}
            {glass.priceTTC ? ` · ${t('service.glassPrice', { price: eur(glass.priceTTC, org.currency, intl) })}` : ''}
          </Badge>
          <span className="text-xs text-muted">{t('service.glassesPerBottle', { n: glassesPerBottle(w.formatCl, glass.glassCl), cl: glass.glassCl })}</span>
        </div>
      )}
      {empty && <p className="mt-3 text-sm font-medium text-bad">{t('service.stockNone')}</p>}
      <div className={cx('mt-auto grid gap-2 pt-4', glass && '@sm:grid-cols-2')}>
        <Button
          variant="primary"
          size="lg"
          className="min-h-14 text-base"
          disabled={empty}
          onClick={() => actions.bottleOut(w)}
          icon={<LogOut className="size-5" aria-hidden />}
        >
          {t('service.out')}
          <span className="sr-only"> — {label}</span>
        </Button>
        {glass && (
          <Button
            size="lg"
            className="min-h-14 text-base"
            disabled={empty}
            onClick={() => actions.openBottle(w, onOpened)}
            icon={<GlassWater className="size-5" aria-hidden />}
          >
            {t('service.openGlass')}
            <span className="sr-only"> — {label}</span>
          </Button>
        )}
      </div>
    </Card>
  );
}
