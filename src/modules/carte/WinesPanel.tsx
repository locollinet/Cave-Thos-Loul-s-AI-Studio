import { useMemo, useState } from 'react';
import { FileText, Star } from 'lucide-react';
import type { StockLevel, Wine } from '@/types';
import { useI18n } from '@/i18n';
import { Badge, Checkbox, EmptyState, NumberInput, SearchInput, cx } from '@/ui';
import { norm } from '@/lib/wine';
import { priceFor, qtyForSites } from './build';
import type { ListSection, WineList } from './types';
import { TechSheetModal } from './TechSheetModal';

interface Props {
  list: WineList;
  wines: Wine[];
  stock: StockLevel[];
  sections: ListSection[];
  vatRate: number;
  onChange: (patch: Partial<WineList>) => void;
}

export function WinesPanel({ list, wines, stock, sections, vatRate, onChange }: Props) {
  const { t, intl } = useI18n();
  const [q, setQ] = useState('');
  const [sheetWine, setSheetWine] = useState<Wine | null>(null);
  const qty = useMemo(() => qtyForSites(stock, list.siteIds), [stock, list.siteIds]);
  const shown = useMemo(() => new Set(sections.flatMap((s) => s.items.map((i) => i.wineId))), [sections]);
  const rows = useMemo(() => {
    const nq = norm(q);
    return wines
      .filter((w) => !w.isArchived && (!nq || norm(`${w.producer} ${w.name} ${w.vintage}`).includes(nq)))
      .sort((a, b) => a.producer.localeCompare(b.producer) || a.name.localeCompare(b.name));
  }, [wines, q]);

  const toggle = (key: 'excludedWineIds' | 'pinnedWineIds', id: string, on: boolean) =>
    onChange({ [key]: on ? [...list[key], id] : list[key].filter((x) => x !== id) });

  const setOverride = (id: string, v: number | undefined) => {
    const next = { ...list.priceOverrides };
    if (v && v > 0) next[id] = v;
    else delete next[id];
    onChange({ priceOverrides: next });
  };

  return (
    <div className="space-y-3">
      <SearchInput value={q} onChange={setQ} placeholder={t('common.search')} />
      {rows.length === 0 ? (
        <EmptyState title={t('carte.wines.empty')} hint={t('carte.wines.emptyHint')} />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {rows.map((w) => {
            const excluded = list.excludedWineIds.includes(w.id);
            const pinned = list.pinnedWineIds.includes(w.id);
            const auto = priceFor({ ...list, priceOverrides: {} }, w, vatRate);
            const n = qty.get(w.id) ?? 0;
            return (
              <li key={w.id} className={cx('space-y-2 px-3 py-2.5', !shown.has(w.id) && 'bg-surface-2/50')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs text-muted">{w.producer}</div>
                    <div className="truncate text-sm font-medium">
                      {w.name} {w.vintage}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {w.byGlass?.enabled && w.byGlass.priceTTC ? (
                      <Badge tone="brand">{t('carte.wines.glass', { price: new Intl.NumberFormat(intl, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(w.byGlass.priceTTC) })}</Badge>
                    ) : null}
                    <Badge tone={n > 0 ? 'neutral' : 'bad'}>{n}</Badge>
                    {!shown.has(w.id) && <Badge tone="warn">{t('carte.wines.hidden')}</Badge>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Checkbox checked={!excluded} onChange={(v) => toggle('excludedWineIds', w.id, !v)} label={t('carte.wines.include')} />
                  <button
                    type="button"
                    aria-pressed={pinned}
                    onClick={() => toggle('pinnedWineIds', w.id, !pinned)}
                    className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs', pinned ? 'bg-accent/20 text-accent' : 'text-muted hover:bg-surface-2')}
                  >
                    <Star className={cx('size-4', pinned && 'fill-current')} />
                    {t('carte.wines.pin')}
                  </button>
                  <div className="flex items-center gap-1.5">
                    <NumberInput
                      aria-label={t('carte.wines.override')}
                      className="h-8 w-24"
                      step={0.5}
                      min={0}
                      placeholder={auto ? String(auto) : '—'}
                      value={list.priceOverrides[w.id]}
                      onChange={(v) => setOverride(w.id, v)}
                    />
                    <span className="text-xs text-muted">€ {t('common.ttc')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSheetWine(w)}
                    className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-brand hover:bg-brand-soft"
                  >
                    <FileText className="size-4" />
                    {t('carte.wines.sheet')}
                    {w.technicalSheet?.generatedByAI && <Badge tone="warn">{t('ai.badge')}</Badge>}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {sheetWine && <TechSheetModal wine={sheetWine} onClose={() => setSheetWine(null)} />}
    </div>
  );
}
