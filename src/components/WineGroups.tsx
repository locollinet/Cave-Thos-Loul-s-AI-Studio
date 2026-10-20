import { Fragment, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Wine } from '@/types';
import { useI18n } from '@/i18n';
import { Table, cx } from '@/ui';
import { buildWineSections, type WineGroupBy } from '@/lib/wineFilters';

interface Props {
  wines: Wine[];
  by: WineGroupBy;
  qty: Map<string, number>;
  /** Nombre de colonnes du tableau (pour les intertitres). */
  columns: number;
  head: ReactNode;
  row: (w: Wine) => ReactNode;
  card: (w: Wine) => ReactNode;
}

/** Liste compacte : une ligne par vin, intertitres discrets ; région repliable. */
export function WineGroups({ wines, by, qty, columns, head, row, card }: Props) {
  const { t } = useI18n();
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const sections = buildWineSections(wines, by, t('discover.unknown'));
  const toggle = (key: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const bottles = (list: Wine[]) => list.reduce((sum, w) => sum + (qty.get(w.id) ?? 0), 0);
  const eyebrow = t(by === 'terroir' ? 'discover.region' : 'discover.producer');

  const header = (key: string, title: string, list: Wine[], compact = false) => (
    <button
      type="button"
      aria-expanded={!closed.has(key)}
      onClick={() => toggle(key)}
      className={cx('flex w-full items-end justify-between gap-3 text-left', compact ? 'px-1 pb-2 pt-1' : 'px-3 pb-2 pt-6')}
    >
      <span className="min-w-0">
        <span className="block text-[9px] uppercase tracking-[0.24em] text-muted">{eyebrow}</span>
        <span className="block truncate font-display text-2xl leading-tight">{title}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2 pb-1 text-xs text-muted">
        {t('discover.results', { n: list.length, qty: bottles(list) })}
        <ChevronDown className={cx('size-4 transition', closed.has(key) && '-rotate-90')} />
      </span>
    </button>
  );

  return (
    <>
      <div className="space-y-6 md:hidden">
        {sections.map((s) => (
          <section key={s.key}>
            {s.title && header(s.key, s.title, s.wines, true)}
            {!closed.has(s.key) &&
              s.subgroups.map((g) => (
                <div key={g.key} className="mt-2">
                  {g.label && <p className="px-1 pb-1.5 text-[10px] uppercase tracking-[0.16em] text-muted">{g.label}</p>}
                  <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">{g.wines.map((w) => <Fragment key={w.id}>{card(w)}</Fragment>)}</div>
                </div>
              ))}
          </section>
        ))}
      </div>
      <Table className="hidden md:block">
        <thead>{head}</thead>
        {sections.map((s) => (
          <tbody key={s.key}>
            {s.title && (
              <tr className="border-t border-border first:border-t-0">
                <td colSpan={columns} className="p-0">
                  {header(s.key, s.title, s.wines)}
                </td>
              </tr>
            )}
            {!closed.has(s.key) &&
              s.subgroups.map((g) => (
                <Fragment key={g.key}>
                  {g.label && (
                    <tr>
                      <td colSpan={columns} className="px-3 pb-1 pt-3 text-[10px] uppercase tracking-[0.16em] text-muted">
                        {g.label}
                      </td>
                    </tr>
                  )}
                  {g.wines.map((w) => (
                    <Fragment key={w.id}>{row(w)}</Fragment>
                  ))}
                </Fragment>
              ))}
          </tbody>
        ))}
      </Table>
    </>
  );
}
