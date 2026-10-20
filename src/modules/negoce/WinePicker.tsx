import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Wine } from '@/types';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { qtyAt } from '@/data/stock';
import { eur } from '@/lib/utils';
import { norm, wineLabel } from '@/lib/wine';
import { Badge, SearchInput, cx } from '@/ui';

interface Props {
  siteId: string;
  onPick: (w: Wine) => void;
}

export default function WinePicker({ siteId, onPick }: Props) {
  const { wines, stock } = useOrg();
  const { t, intl } = useI18n();
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const n = norm(q);
    if (!n) return [];
    const words = n.split(' ');
    return wines
      .filter((w) => !w.isArchived)
      .filter((w) => {
        const hay = norm(`${w.producer} ${w.name} ${w.vintage} ${w.region ?? ''} ${w.ean ?? ''}`);
        return words.every((x) => hay.includes(x));
      })
      .slice(0, 8);
  }, [q, wines]);

  const pick = (w: Wine) => {
    onPick(w);
    setQ('');
  };

  return (
    <div className="relative">
      <SearchInput value={q} onChange={setQ} placeholder={t('negoce.addWine')} />
      {q && (
        <ul className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-border bg-surface shadow-lg" role="listbox" aria-label={t('negoce.addWine')}>
          {results.length === 0 && <li className="px-3 py-3 text-sm text-muted">{t('negoce.noWine')}</li>}
          {results.map((w, i) => {
            const avail = qtyAt(stock, w.id, siteId);
            return (
              <li key={w.id} role="option" aria-selected={i === 0}>
                <button
                  type="button"
                  onClick={() => pick(w)}
                  className={cx('flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none', i === 0 && 'bg-surface-2/60')}
                >
                  <Plus className="size-4 shrink-0 text-brand" />
                  <span className="min-w-0 flex-1 truncate text-sm">{wineLabel(w)}</span>
                  <Badge tone={avail <= 0 ? 'bad' : avail <= w.alertThreshold ? 'warn' : 'ok'}>{t('negoce.stockAvail', { n: avail })}</Badge>
                  <span className="tabular w-20 text-right text-sm font-medium">{eur(w.sellPriceHT, 'EUR', intl)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
