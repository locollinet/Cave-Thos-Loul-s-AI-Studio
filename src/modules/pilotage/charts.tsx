import type { ReactNode } from 'react';
import { BarChart3 } from 'lucide-react';
import { cx } from '@/ui';

/** Charte des graphiques : couleurs issues des variables CSS (suivent le thème clair/sombre et la marque). */
export const CHART = {
  brand: 'var(--brand)',
  accent: 'var(--accent)',
  muted: 'var(--muted)',
  border: 'var(--border)',
  surface: 'var(--surface)',
  text: 'var(--text)',
  font: "'Inter', ui-sans-serif, system-ui, sans-serif",
} as const;

export const axisProps = {
  tick: { fontSize: 11, fill: CHART.muted, fontFamily: CHART.font },
  axisLine: false,
  tickLine: false,
  tickMargin: 8,
} as const;

export const gridProps = { stroke: CHART.border, strokeOpacity: 0.7, strokeDasharray: '2 4', vertical: false } as const;

export const cursorProps = { fill: 'var(--brand-soft)', fillOpacity: 0.55 } as const;

/** « 2026-03 » → « mars » sur l'axe, ou « mars 2026 » (`long`) dans l'infobulle. */
export const monthLabel = (key: string, intl: string, long = false): string => {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return long ? d.toLocaleDateString(intl, { month: 'long', year: 'numeric', timeZone: 'UTC' }) : d.toLocaleDateString(intl, { month: 'short', timeZone: 'UTC' }).replace('.', '');
};

/** Valeurs d'axe compactes : 12 500 → « 12,5 k ». */
export const compactNumber = (n: number, intl: string): string => new Intl.NumberFormat(intl, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

interface TooltipEntry {
  name?: unknown;
  value?: unknown;
  color?: string;
  dataKey?: unknown;
}

/** Infobulle sobre et élégante pour recharts (`content={(p) => <ChartTooltip {...p} … />}`). */
export function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
  formatLabel,
}: {
  active?: boolean;
  payload?: readonly TooltipEntry[];
  label?: unknown;
  formatValue?: (v: number, name: string) => string;
  formatLabel?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const l = String(label ?? '');
  return (
    <div className="min-w-36 rounded-lg border border-border bg-surface/95 px-3 py-2 text-xs shadow-lg backdrop-blur" style={{ fontFamily: CHART.font }}>
      {l && <div className="mb-1.5 font-display text-sm capitalize text-ink">{formatLabel ? formatLabel(l) : l}</div>}
      <ul className="space-y-1">
        {payload.map((p, i) => (
          <li key={`${String(p.dataKey)}-${i}`} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
              {String(p.name ?? '')}
            </span>
            <span className="tabular font-medium text-ink">{formatValue ? formatValue(Number(p.value), String(p.name ?? '')) : String(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Légende discrète, en HTML, au-dessus des graphiques. */
export function ChartLegend({ items }: { items: { label: string; color: string; kind?: 'bar' | 'line' }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span className={cx(it.kind === 'line' ? 'h-0.5 w-3.5' : 'size-2.5 rounded-sm')} style={{ background: it.color }} aria-hidden />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/** Cadre de graphique : hauteur fixe, libellé accessible, et état vide engageant au lieu d'une courbe plate à zéro. */
export function ChartFrame({
  label,
  empty,
  emptyTitle,
  emptyHint,
  emptyAction,
  className,
  children,
}: {
  label: string;
  empty: boolean;
  emptyTitle: string;
  emptyHint?: string;
  emptyAction?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  if (empty)
    return (
      <div className={cx('relative flex h-56 flex-col items-center justify-center overflow-hidden rounded-lg px-6 text-center', className)}>
        <svg className="absolute inset-x-0 bottom-6 h-24 w-full text-border" viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden>
          <path d="M0 70 C40 66 60 50 95 52 S150 30 185 34 S240 14 300 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
          <line x1="0" x2="300" y1="78" y2="78" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
        <BarChart3 className="relative mb-2 size-6 text-muted" aria-hidden />
        <p className="relative font-display text-lg">{emptyTitle}</p>
        {emptyHint && <p className="relative mt-1 max-w-sm text-sm text-muted">{emptyHint}</p>}
        {emptyAction && <div className="relative mt-3">{emptyAction}</div>}
      </div>
    );
  return (
    <div className={cx('h-56 w-full', className)} role="img" aria-label={label}>
      {children}
    </div>
  );
}
