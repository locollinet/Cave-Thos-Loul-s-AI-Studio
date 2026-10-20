import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import type { Movement, Wine } from '@/types';
import { useI18n } from '@/i18n';
import { useOrg } from '@/app/org';
import { useAuth } from '@/app/auth';
import { Badge, Card, cx } from '@/ui';
import { num } from '@/lib/utils';
import { wineLabel } from '@/lib/wine';
import { COLOR_DOT } from '../Wines';
import type { Insight } from './compute';

/* ------------------------------------------------------------ hero */

export const percent = (n: number, intl: string, signed = false): string =>
  new Intl.NumberFormat(intl, { style: 'percent', maximumFractionDigits: 0, signDisplay: signed ? 'exceptZero' : 'auto' }).format(n / 100);

export function useInsightText(i: Insight): string {
  const { t, intl } = useI18n();
  const { org } = useOrg();
  return t(i.key, { n: num(i.n ?? 0, intl), amount: new Intl.NumberFormat(intl, { style: 'currency', currency: org.currency, maximumFractionDigits: 0 }).format(i.amount ?? 0), pct: percent(i.pct ?? 0, intl), site: i.site || '—' });
}

export function Hero({ insight, actions }: { insight: Insight; actions?: ReactNode }) {
  const { t, intl } = useI18n();
  const { user } = useAuth();
  const { org, sites, activeSiteId } = useOrg();
  const text = useInsightText(insight);
  const now = new Date();
  const hour = now.getHours();
  const first = user?.name?.split(' ')[0] ?? '';
  const site = activeSiteId !== 'all' ? sites.find((s) => s.id === activeSiteId)?.name : '';
  const date = now.toLocaleDateString(intl, { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <header className="relative border-b border-border/70 pb-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
        <span className="capitalize">{date}</span>
        <span aria-hidden> · </span>
        {org.name}
        {site ? <span> · {site}</span> : null}
      </p>
      <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight md:text-5xl">
        {hour < 18 ? t('dash.hello') : t('dash.evening')}
        {first ? `, ${first}` : ''}
      </h1>
      <p className="mt-2 flex max-w-3xl items-baseline gap-2.5 font-display text-xl italic leading-snug text-muted md:text-2xl" aria-live="polite">
        <span
          aria-hidden
          className={cx('relative top-[-0.15em] inline-block size-2 shrink-0 rounded-full', insight.tone === 'attention' ? 'bg-warn' : insight.tone === 'good' ? 'bg-ok' : 'bg-accent')}
        />
        <span>{text}</span>
      </p>
      {actions && <div className="mt-5 flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/* ------------------------------------------------------------ cartes */

export function Panel({ title, eyebrow, action, className, children, highlight }: { title: ReactNode; eyebrow?: ReactNode; action?: ReactNode; className?: string; children: ReactNode; highlight?: boolean }) {
  return (
    <Card className={cx('flex flex-col p-5', highlight && 'bg-[linear-gradient(135deg,var(--brand-soft)_0%,var(--surface)_55%)]', className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{eyebrow}</p>}
          <h2 className="font-display text-xl leading-tight md:text-2xl">{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </Card>
  );
}

export function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded text-xs font-medium text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand">
      {children}
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

/** Petits chiffres alignés comme dans un registre (plutôt qu'une rangée de boîtes identiques). */
export function Ledger({ items, rows, className }: { items: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'bad' | 'warn' | 'ok' }[]; rows?: boolean; className?: string }) {
  const tone = (t?: 'bad' | 'warn' | 'ok') => cx(t === 'bad' && 'text-bad', t === 'warn' && 'text-warn', t === 'ok' && 'text-ok');
  if (rows)
    return (
      <dl className={cx('divide-y divide-border/60', className)}>
        {items.map((it) => (
          <div key={it.label} className="flex items-baseline justify-between gap-3 py-2 first:pt-0">
            <dt className="min-w-0">
              <span className="block text-sm">{it.label}</span>
              {it.sub && <span className="block text-xs text-muted">{it.sub}</span>}
            </dt>
            <dd className={cx('tabular shrink-0 font-display text-2xl leading-none', tone(it.tone))}>{it.value}</dd>
          </div>
        ))}
      </dl>
    );
  return (
    <dl className={cx('grid gap-x-4 gap-y-3', items.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : items.length === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2', className)}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0 border-l border-border pl-3">
          <dt className="text-[11px] font-medium uppercase leading-snug tracking-[0.12em] text-muted">{it.label}</dt>
          <dd className={cx('tabular mt-0.5 font-display text-2xl leading-tight', tone(it.tone))}>{it.value}</dd>
          {it.sub && <dd className="text-xs text-muted">{it.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** État vide qui invite à agir, à la place d'un « 0 ». */
export function Invite({ icon: Icon, title, hint, to, cta, className }: { icon: LucideIcon; title: string; hint?: string; to?: string; cta?: string; className?: string }) {
  return (
    <div className={cx('flex items-start gap-3 rounded-lg border border-dashed border-border bg-surface-2/40 p-4', className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand" aria-hidden>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
        {to && cta && (
          <Link to={to} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand">
            {cta}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="animate-pulse space-y-2.5" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-4 rounded bg-surface-2" style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ actions rapides */

export interface QuickAction {
  to: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  primary?: boolean;
}

export function QuickActions({ actions, large }: { actions: QuickAction[]; large?: boolean }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t('home.quick')} className={cx('grid gap-2.5', actions.length >= 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3')}>
      {actions.map((a) => (
        <Link
          key={a.to + a.label}
          to={a.to}
          className={cx(
            'group flex items-center gap-3 rounded-xl border px-4 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
            large ? 'min-h-16 py-3' : 'min-h-12 py-2.5',
            a.primary ? 'border-brand bg-brand text-brand-fg hover:opacity-90' : 'border-border bg-surface hover:border-brand/40 hover:bg-brand-soft/60',
          )}
        >
          <span className={cx('grid size-9 shrink-0 place-items-center rounded-full', a.primary ? 'bg-white/15' : 'bg-brand-soft text-brand')} aria-hidden>
            <a.icon className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium leading-tight">{a.label}</span>
            {a.hint && <span className={cx('block truncate text-xs', a.primary ? 'opacity-80' : 'text-muted')}>{a.hint}</span>}
          </span>
        </Link>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------ listes */

export interface RankItem {
  id: string;
  label: string;
  value: string;
  sub?: string;
  ratio: number;
  to?: string;
}

export function RankList({ items }: { items: RankItem[] }) {
  return (
    <ol className="space-y-3">
      {items.map((it, i) => {
        const body = (
          <>
            <div className="flex items-baseline gap-3 text-sm">
              <span className="w-4 shrink-0 font-display text-base text-muted tabular">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              <span className="tabular shrink-0 font-medium">{it.value}</span>
            </div>
            <div className="ml-7 mt-1 flex items-center gap-2">
              <div className="h-1 flex-1 rounded-full bg-surface-2" aria-hidden>
                <div className={cx('h-1 rounded-full', i === 0 ? 'bg-accent' : 'bg-brand/60')} style={{ width: `${Math.max(3, it.ratio * 100)}%` }} />
              </div>
              {it.sub && <span className="shrink-0 text-[11px] text-muted">{it.sub}</span>}
            </div>
          </>
        );
        return <li key={it.id}>{it.to ? <Link to={it.to} className="block rounded hover:text-brand focus-visible:outline-2 focus-visible:outline-brand">{body}</Link> : body}</li>;
      })}
    </ol>
  );
}

export type AlertKey = 'out' | 'low' | 'past';

export function AlertList({ rows, qty, limit = 6 }: { rows: { wine: Wine; kind: AlertKey }[]; qty: Map<string, number>; limit?: number }) {
  const { t } = useI18n();
  return (
    <ul className="divide-y divide-border/60">
      {rows.slice(0, limit).map(({ wine: w, kind }) => (
        <li key={`${kind}-${w.id}`}>
          <Link to={`/vins?open=${w.id}`} className="flex items-center gap-3 py-2 text-sm hover:text-brand focus-visible:outline-2 focus-visible:outline-brand">
            <span className={cx('size-2.5 shrink-0 rounded-full', COLOR_DOT[w.color])} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{wineLabel(w)}</span>
            <span className="tabular text-muted">{qty.get(w.id) ?? 0}</span>
            <Badge tone={kind === 'low' ? 'warn' : 'bad'}>{t(`alert.${kind}`)}</Badge>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function MovementList({ rows, limit = 6, showDate }: { rows: Movement[]; limit?: number; showDate?: boolean }) {
  const { t, intl } = useI18n();
  return (
    <ul className="divide-y divide-border/60">
      {rows.slice(0, limit).map((m) => (
        <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
          <Badge tone={m.type === 'in' ? 'ok' : m.type === 'out' ? 'bad' : 'neutral'}>{t(`stock.type.${m.type}`)}</Badge>
          <span className="min-w-0 flex-1 truncate">{m.wineLabel}</span>
          <span className="tabular font-semibold">
            {m.type === 'out' ? '−' : m.type === 'adjust' && m.qty < 0 ? '−' : '+'}
            {Math.abs(m.qty)}
          </span>
          <span className="hidden w-14 text-right text-xs text-muted sm:block">
            {showDate ? new Date(`${m.date}T12:00:00`).toLocaleDateString(intl, { day: 'numeric', month: 'short' }) : m.createdAt ? new Date(m.createdAt).toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}
