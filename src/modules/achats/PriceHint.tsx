import type { PricePoint } from './types';
import { useI18n } from '@/i18n';
import { eur, pct } from '@/lib/utils';

function Sparkline({ points }: { points: PricePoint[] }) {
  const w = 64;
  const h = 20;
  const vals = points.map((p) => p.price);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const d = vals.map((v, i) => `${((i / (vals.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 3 - ((v - min) / span) * (h - 6)).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="text-brand">
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Aide à la décision : dernier prix d'achat connu, écart et mini historique. */
export function PriceHint({ history, current, fallbackLast }: { history: PricePoint[]; current: number; fallbackLast?: number }) {
  const { t, intl } = useI18n();
  const last = history.length ? history[history.length - 1].price : fallbackLast;
  if (!last) return <p className="text-xs text-muted">{t('achats.price.none')}</p>;
  const delta = current > 0 ? ((current - last) / last) * 100 : 0;
  const tone = Math.abs(delta) < 0.05 ? 'text-muted' : delta > 0 ? 'text-bad' : 'text-ok';
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
      <span>{t('achats.price.last', { price: eur(last, 'EUR', intl) })}</span>
      {current > 0 && (
        <span className={`font-medium ${tone}`}>
          {delta > 0 ? '+' : ''}
          {pct(delta)}
        </span>
      )}
      {history.length > 1 && <Sparkline points={history.slice(-8)} />}
    </p>
  );
}
