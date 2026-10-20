import { useId, useMemo, useState, type CSSProperties } from 'react';
import { MapPin, X } from 'lucide-react';
import type { Wine } from '@/types';
import { useI18n } from '@/i18n';
import { num } from '@/lib/utils';
import { cx } from '@/ui';
import { CORSICA_PATH, FRANCE_PATH, FRENCH_REGIONS, MAP_HEIGHT, MAP_WIDTH, isRegionSelected, project, terroirStats } from '@/modules/pilotage/terroir';

export { matchRegion, terroirStats, wineTerroir } from '@/modules/pilotage/terroir';

const MIN_D = 16;
const MAX_D = 66;

const pctX = (x: number) => (x / MAP_WIDTH) * 100;
const pctY = (y: number) => (y / MAP_HEIGHT) * 100;

const SEAS: { key: string; lon: number; lat: number; rotate?: number }[] = [
  { key: 'terroir.sea.manche', lon: -2.6, lat: 50.0, rotate: -8 },
  { key: 'terroir.sea.atlantique', lon: -3.9, lat: 45.6, rotate: -70 },
  { key: 'terroir.sea.mediterranee', lon: 5.3, lat: 42.35 },
];

/** Carte stylisée des terroirs français : cercles proportionnels aux bouteilles, sélection d'une région au clic. */
export function TerroirMap({ wines, qty, selected, onSelect }: { wines: Wine[]; qty: Map<string, number>; selected: string; onSelect: (region: string) => void }) {
  const { t, intl } = useI18n();
  const { french, others } = useMemo(() => terroirStats(wines, qty), [wines, qty]);
  const [active, setActive] = useState<string | null>(null);
  const hatch = `terroir-hatch-${useId().replace(/[^a-z0-9]/gi, '')}`;
  const max = Math.max(1, ...[...french.values()].map((s) => s.bottles));
  const anySelected = !!selected;

  const regions = FRENCH_REGIONS.map((r) => {
    const [x, y] = project(r.lon, r.lat);
    const stat = french.get(r.name);
    const d = stat ? MIN_D + (MAX_D - MIN_D) * Math.sqrt(stat.bottles / max) : 6;
    return { r, x: pctX(x), y: pctY(y), d: (d / MAP_WIDTH) * 100, stat, on: stat ? isRegionSelected(stat, selected) : false };
  });
  const tip = regions.find((g) => g.r.name === active && g.stat);

  return (
    <figure className="w-full" aria-label={t('terroir.title')}>
      <div className="relative mx-auto w-full max-w-[560px] select-none" style={{ aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`, containerType: 'inline-size' } as CSSProperties}>
        <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} className="absolute inset-0 size-full" aria-hidden focusable="false">
          <defs>
            <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--border)" strokeWidth="0.8" strokeOpacity="0.6" />
            </pattern>
          </defs>
          {SEAS.map((s) => {
            const [x, y] = project(s.lon, s.lat);
            return (
              <text
                key={s.key}
                x={x}
                y={y}
                transform={s.rotate ? `rotate(${s.rotate} ${x} ${y})` : undefined}
                textAnchor="middle"
                fill="var(--muted)"
                fillOpacity="0.7"
                fontSize="13"
                fontStyle="italic"
                letterSpacing="2"
                style={{ fontFamily: 'var(--app-display)' }}
              >
                {t(s.key)}
              </text>
            );
          })}
          {[FRANCE_PATH, CORSICA_PATH].map((d) => (
            <g key={d}>
              <path d={d} fill="var(--surface-2)" />
              <path d={d} fill={`url(#${hatch})`} stroke="var(--muted)" strokeOpacity="0.45" strokeWidth="1.1" strokeLinejoin="round" />
            </g>
          ))}
        </svg>

        {regions.map(({ r, x, y, d, stat, on }) =>
          !stat ? (
            <span key={r.name} aria-hidden className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted/35" style={{ left: `${x}%`, top: `${y}%` }} />
          ) : (
            <button
              key={r.name}
              type="button"
              aria-pressed={on}
              aria-label={t('terroir.aria', { region: r.name, refs: stat.refs, bottles: num(stat.bottles, intl) })}
              onClick={() => onSelect(on ? '' : stat.value)}
              onMouseEnter={() => setActive(r.name)}
              onMouseLeave={() => setActive((a) => (a === r.name ? null : a))}
              onFocus={() => setActive(r.name)}
              onBlur={() => setActive((a) => (a === r.name ? null : a))}
              className={cx(
                'absolute aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                on ? 'z-20 border-accent bg-accent/35 shadow-[0_0_0_3px_var(--surface)]' : 'z-10 border-brand/70 bg-brand/15 hover:bg-brand/30',
                anySelected && !on && 'opacity-55 hover:opacity-100 focus-visible:opacity-100',
                stat.bottles === 0 && !on && 'border-dashed bg-transparent',
              )}
              style={{ left: `${x}%`, top: `${y}%`, width: `${d}%` }}
            >
              <span className={cx('absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full', on ? 'bg-accent' : 'bg-brand')} aria-hidden />
              <span
                aria-hidden
                className={cx(
                  'pointer-events-none absolute hidden whitespace-nowrap font-display text-[13px] leading-none sm:block',
                  on ? 'font-semibold text-ink' : 'text-ink/80',
                  r.label === 'left' && 'right-full top-1/2 mr-1.5 -translate-y-1/2',
                  r.label === 'right' && 'left-full top-1/2 ml-1.5 -translate-y-1/2',
                  r.label === 'top' && 'bottom-full left-1/2 mb-1 -translate-x-1/2',
                  r.label === 'bottom' && 'left-1/2 top-full mt-1 -translate-x-1/2',
                )}
              >
                {r.name}
              </span>
            </button>
          ),
        )}

        {tip?.stat && (
          <div
            role="tooltip"
            className={cx(
              'pointer-events-none absolute z-30 w-max max-w-[14rem] -translate-y-full rounded-lg border border-border bg-surface/95 px-3 py-2 text-xs shadow-lg backdrop-blur',
              tip.x < 22 ? '-translate-x-4' : tip.x > 78 ? '-translate-x-[calc(100%-1rem)]' : '-translate-x-1/2',
            )}
            style={{ left: `${tip.x}%`, top: `calc(${tip.y}% - ${tip.d / 2}cqw - 6px)` }}
          >
            <div className="font-display text-base leading-tight text-ink">{tip.r.name}</div>
            <div className="mt-0.5 text-muted">
              {t('terroir.refs', { n: tip.stat.refs })} · {t('terroir.bottles', { n: num(tip.stat.bottles, intl) })}
            </div>
            <div className="mt-1 text-[11px] text-brand">{t(tip.on ? 'terroir.clickClear' : 'terroir.clickFilter')}</div>
          </div>
        )}
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="flex items-center gap-2">
          <span className="inline-flex items-end gap-0.5" aria-hidden>
            <span className="size-2 rounded-full border border-brand/70 bg-brand/15" />
            <span className="size-3 rounded-full border border-brand/70 bg-brand/15" />
            <span className="size-4 rounded-full border border-brand/70 bg-brand/15" />
          </span>
          {french.size ? t('terroir.legend') : t('terroir.noFrench')}
        </span>
        {anySelected && (
          <button type="button" onClick={() => onSelect('')} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand">
            <X className="size-3.5" aria-hidden />
            {t('terroir.clear')}
          </button>
        )}
      </figcaption>

      {others.length > 0 && (
        <div className="mt-4 border-t border-border/70 pt-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{t('terroir.others')}</p>
          <ul className="flex flex-wrap gap-1.5">
            {others.map((o) => {
              const on = selected === o.value;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={t('terroir.aria', { region: o.country ? `${o.value}, ${o.country}` : o.value, refs: o.refs, bottles: num(o.bottles, intl) })}
                    onClick={() => onSelect(on ? '' : o.value)}
                    className={cx(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
                      on ? 'border-accent bg-accent/20 text-ink' : 'border-border bg-surface hover:border-brand/50 hover:bg-brand-soft',
                    )}
                  >
                    <MapPin className="size-3 text-muted" aria-hidden />
                    <span className="font-display text-sm leading-none">{o.value}</span>
                    {o.country && <span className="text-muted">· {o.country}</span>}
                    <span className="tabular ml-0.5 rounded-full bg-surface-2 px-1.5 text-[11px] text-muted">{num(o.bottles, intl)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </figure>
  );
}
