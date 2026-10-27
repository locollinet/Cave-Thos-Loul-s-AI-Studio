import { useEffect, useState, type ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useT } from '@/i18n';
import { Badge, Button, Modal, cx } from '@/ui';
import { durationParts, freshness, glassesRemaining } from './logic';
import type { OpenBottle } from './types';

/** Horloge rafraîchie chaque minute (durées d'ouverture, fraîcheur). */
export function useNow(periodMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), periodMs);
    return () => clearInterval(id);
  }, [periodMs]);
  return now;
}

export function useDuration(): (ms: number) => string {
  const t = useT();
  return (ms) => {
    const { days, hours, minutes } = durationParts(ms);
    if (days > 0) return t('service.dur.d', { d: days, h: hours });
    if (hours > 0) return t('service.dur.h', { h: hours, m: String(minutes).padStart(2, '0') });
    return t('service.dur.m', { m: minutes });
  };
}

/** Onglets larges, utilisables au doigt. */
export function BigTabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="no-print mb-5 grid grid-flow-col gap-1 rounded-2xl border border-border bg-surface-2 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={cx(
            'flex min-h-14 items-center justify-center gap-2 rounded-xl px-4 font-display text-xl transition focus-visible:outline-2 focus-visible:outline-brand',
            value === tab.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {tab.label}
          {tab.count !== undefined && <span className="tabular rounded-full bg-brand-soft px-2 py-0.5 font-sans text-xs font-semibold text-brand">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function FreshnessBadge({ bottle, now }: { bottle: OpenBottle; now: number }) {
  const t = useT();
  const fmt = useDuration();
  const f = freshness(bottle, now);
  const tone = f.level === 'expired' ? 'bad' : f.level === 'soon' ? 'warn' : 'ok';
  const detail = f.leftMs >= 0 ? t('service.fresh.left', { d: fmt(f.leftMs) }) : t('service.fresh.over', { d: fmt(-f.leftMs) });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {bottle.preservation === 'coravin' && (
        <span className="inline-flex items-center gap-1 rounded bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent border border-accent/30" title="Conservation sous gaz inerte / azote (Coravin) : 28 jours">
          ⚡ Coravin / Azote (28j)
        </span>
      )}
      <Badge tone={tone} className="px-2.5 py-1 text-xs">
        {t(`service.fresh.${f.level}`)}
        <span className="font-normal opacity-80">· {detail}</span>
      </Badge>
    </div>
  );
}

export function GlassProgress({ bottle }: { bottle: OpenBottle }) {
  const t = useT();
  const total = Math.max(1, bottle.glassesTotal);
  const lost = bottle.lostGlasses ?? 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={bottle.glassesTotal}
      aria-valuenow={bottle.glassesServed}
      aria-label={t('service.progress', { served: bottle.glassesServed, total: bottle.glassesTotal })}
      className="flex h-3 gap-0.5 overflow-hidden rounded-full"
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cx('flex-1 first:rounded-l-full last:rounded-r-full', i < bottle.glassesServed ? 'bg-brand' : i < bottle.glassesServed + lost ? 'bg-bad/50' : 'bg-surface-2')}
        />
      ))}
    </div>
  );
}

export function LossModal({ bottle, onClose, onConfirm }: { bottle: OpenBottle | null; onClose: () => void; onConfirm: (n: number) => void }) {
  const t = useT();
  const max = bottle ? glassesRemaining(bottle) : 0;
  const [n, setN] = useState(1);
  useEffect(() => setN(1), [bottle?.id]);
  const step = (d: number) => setN((v) => Math.min(max, Math.max(1, v + d)));
  return (
    <Modal
      open={!!bottle}
      onClose={onClose}
      title={t('service.loss.title')}
      size="sm"
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="lg" variant="danger" disabled={max < 1} onClick={() => onConfirm(n)}>
            {t('service.loss.confirm')}
          </Button>
        </>
      }
    >
      <p className="font-display text-lg leading-snug">{bottle?.wineLabel}</p>
      <p className="mt-1 text-sm text-muted">{t('service.loss.hint')}</p>
      <div className="mt-5 flex items-center justify-center gap-4" role="group" aria-label={t('service.loss.qty')}>
        <Button size="lg" className="min-h-14 min-w-14 rounded-full" aria-label={t('service.decrease')} disabled={n <= 1} onClick={() => step(-1)} icon={<Minus className="size-6" />} />
        <div className="min-w-24 text-center">
          <output aria-live="polite" className="tabular block font-display text-5xl leading-none">
            {n}
          </output>
          <span className="mt-1 block text-xs text-muted">{t('service.loss.max', { n: max })}</span>
        </div>
        <Button size="lg" className="min-h-14 min-w-14 rounded-full" aria-label={t('service.increase')} disabled={n >= max} onClick={() => step(1)} icon={<Plus className="size-6" />} />
      </div>
      <div className="mt-4 text-center">
        <Button variant="ghost" onClick={() => setN(max)} disabled={max < 1}>
          {t('service.loss.all')} ({max})
        </Button>
      </div>
    </Modal>
  );
}
