import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Bookmark, SlidersHorizontal, X } from 'lucide-react';
import type { Wine } from '@/types';
import { WINE_COLORS } from '@/types';
import { useI18n } from '@/i18n';
import { Button, Checkbox, Field, Input, Modal, SearchInput, Select, cx, useToast } from '@/ui';
import {
  EMPTY_FILTERS,
  QUICK_FILTERS,
  filterCount,
  loadViews,
  quickActive,
  saveViews,
  type SavedView,
  type WineFilters as Filters,
  type WineGroupBy,
  type WineSort,
} from '@/lib/wineFilters';

function useDesktop(): boolean {
  const query = '(min-width: 768px)';
  const [desktop, setDesktop] = useState(() => typeof matchMedia === 'undefined' || matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const h = () => setDesktop(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);
  return desktop;
}

const chip = (active: boolean) =>
  cx('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition', active ? 'border-brand bg-brand text-brand-fg' : 'border-border bg-surface text-ink hover:border-muted');

export function WineFilters({ wines, value, onChange, query, onQuery, group, onGroup, sort, onSort, count, qty, viewsKey, extra }: {
  wines: Wine[]; value: Filters; onChange: (f: Filters) => void; query: string; onQuery: (q: string) => void;
  group: WineGroupBy; onGroup: (g: WineGroupBy) => void; sort: WineSort; onSort: (s: WineSort) => void; count: number; qty: number;
  /** Clé de stockage des vues enregistrées (ex. `${orgId}:wines`). */
  viewsKey: string;
  /** Contrôles additionnels affichés à droite de la recherche (ex. bouton carte). */
  extra?: ReactNode;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const desktop = useDesktop();
  const [expanded, setExpanded] = useState(false);
  const [views, setViews] = useState<SavedView[]>(() => loadViews(viewsKey));
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState('');
  const id = useId();
  useEffect(() => setViews(loadViews(viewsKey)), [viewsKey]);
  const set = <K extends keyof Filters>(key: K, v: Filters[K]) => onChange({ ...value, [key]: v });
  const scoped = useMemo(() => wines.filter((w) => (!value.region || w.region === value.region) && (!value.subRegion || w.subRegion === value.subRegion)), [wines, value.region, value.subRegion]);
  const options = (rows: Wine[], key: 'region' | 'subRegion' | 'producer' | 'country' | 'vintage') => [...new Set(rows.map((w) => w[key]).filter((v): v is string => !!v))].sort();
  const select = (key: 'region' | 'subRegion' | 'producer' | 'country' | 'vintage', rows = wines) => (
    <Field label={t(`discover.${key}`)}>
      <Select aria-label={t(`discover.${key}`)} value={value[key]} onChange={(e) => {
        if (key === 'region') onChange({ ...value, region: e.target.value, subRegion: '', producer: '' });
        else if (key === 'subRegion') onChange({ ...value, subRegion: e.target.value, producer: '' });
        else set(key, e.target.value);
      }}>
        <option value="">{t('discover.all')}</option>
        {options(rows, key).map((v) => <option key={v} value={v}>{v}</option>)}
      </Select>
    </Field>
  );
  const active = filterCount(value);
  const labels: Record<string, string> = Object.fromEntries(Object.keys(EMPTY_FILTERS).map((k) => [k, t(`discover.${k}`)]));
  const reset = () => { onChange({ ...EMPTY_FILTERS }); onQuery(''); };
  const applyView = (v: SavedView) => { onChange({ ...EMPTY_FILTERS, ...v.filters }); onQuery(v.q); onGroup(v.group); onSort(v.sort); };
  const storeView = () => {
    const name = viewName.trim();
    if (!name) return;
    const next = [...views.filter((v) => v.name !== name), { id: `${Date.now()}`, name, filters: value, q: query, group, sort }];
    setViews(next);
    saveViews(viewsKey, next);
    setNaming(false);
    setViewName('');
    toast(t('ux.viewSaved'));
  };
  const removeView = (v: SavedView) => {
    const next = views.filter((x) => x.id !== v.id);
    setViews(next);
    saveViews(viewsKey, next);
  };

  const display = (
    <div className="flex flex-wrap gap-3 sm:col-span-2">
      <Field label={t('discover.group')}><Select aria-label={t('discover.group')} value={group} onChange={(e) => onGroup(e.target.value as WineGroupBy)}>{(['terroir', 'producer', 'none'] as const).map((g, i) => <option key={g} value={g}>{t(['discover.terroir', 'discover.domain', 'discover.flat'][i])}</option>)}</Select></Field>
      <Field label={t('discover.sort')}><Select aria-label={t('discover.sort')} value={sort} onChange={(e) => onSort(e.target.value as WineSort)}>{(['producer', 'vintage', 'qty', 'price'] as const).map((s, i) => <option key={s} value={s}>{t(['discover.sortProducer', 'discover.sortVintage', 'discover.sortQty', 'discover.sortPrice'][i])}</option>)}</Select></Field>
    </div>
  );

  const panel = (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {select('region')}
      {select('subRegion', wines.filter((w) => !value.region || w.region === value.region))}
      {select('producer', scoped)}
      <Field label={t('discover.color')}><Select aria-label={t('discover.color')} value={value.color} onChange={(e) => set('color', e.target.value)}><option value="">{t('discover.all')}</option>{WINE_COLORS.map((c) => <option key={c} value={c}>{t(`color.${c}`)}</option>)}</Select></Field>
      {select('country')}{select('vintage')}
      <Field label={t('discover.grapes')}><Input value={value.grapes} onChange={(e) => set('grapes', e.target.value)} /></Field>
      <Field label={t('discover.format')}><Select aria-label={t('discover.format')} value={value.format} onChange={(e) => set('format', e.target.value)}><option value="">{t('discover.all')}</option>{[...new Set(wines.map((w) => w.formatCl))].sort((a, b) => a - b).map((v) => <option key={v} value={v}>{v} cl</option>)}</Select></Field>
      <Field label={t('discover.stock')}><Select aria-label={t('discover.stock')} value={value.stock} onChange={(e) => set('stock', e.target.value)}><option value="">{t('discover.all')}</option>{['in', 'low', 'out', 'normal'].map((s) => <option key={s} value={s}>{t(`discover.${s}`)}</option>)}</Select></Field>
      {(['minQty', 'maxQty', 'minPrice', 'maxPrice'] as const).map((k) => <Field key={k} label={t(`discover.${k}`)}><Input type="number" inputMode="decimal" min={0} step={k.includes('Qty') ? 1 : '0.01'} value={value[k]} onChange={(e) => set(k, e.target.value)} /></Field>)}
      <Field label={t('discover.price')}><Select aria-label={t('discover.price')} value={value.price} onChange={(e) => set('price', e.target.value as Filters['price'])}>{(['sellPriceHT', 'buyPriceHT', 'menuPriceTTC'] as const).map((p, i) => <option key={p} value={p}>{t(['wines.sellPrice', 'wines.buyPrice', 'wines.menuPrice'][i])}</option>)}</Select></Field>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        {[12, 24, 48, 60].map((n) => <Button key={n} size="sm" variant={value.minQty === String(n) ? 'primary' : 'secondary'} onClick={() => set('minQty', value.minQty === String(n) ? '' : String(n))}>≥ {n} {t('common.bottles')}</Button>)}
        <Checkbox checked={value.apogee} onChange={(v) => set('apogee', v)} label={t('discover.apogee')} />
      </div>
      <Field label={t('discover.characteristics')} hint={t('discover.documented')} className="sm:col-span-2 xl:col-span-4"><Input value={value.characteristics} onChange={(e) => set('characteristics', e.target.value)} /></Field>
      {!desktop && display}
    </div>
  );

  return (
    <section className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={onQuery} placeholder={t('discover.search')} className="min-w-48 flex-1" />
        <Button onClick={() => setExpanded(!expanded)} aria-label={t('discover.filters')} aria-expanded={expanded} aria-controls={id} icon={<SlidersHorizontal className="size-4" />}>
          <span className="hidden sm:inline">{t('discover.filters')}</span>
          {active > 0 && <span className="rounded-full bg-brand px-1.5 text-[11px] text-brand-fg">{active}</span>}
        </Button>
        {extra}
      </div>

      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label={t('ux.views')}>
        {QUICK_FILTERS.map((f) => {
          const on = quickActive(value, f.patch);
          return (
            <button key={f.id} type="button" aria-pressed={on} className={chip(on)} onClick={() => onChange({ ...value, ...(on ? Object.fromEntries(Object.keys(f.patch).map((k) => [k, EMPTY_FILTERS[k as keyof Filters]])) : f.patch) })}>
              {t(`ux.quick.${f.id}`)}
            </button>
          );
        })}
        {views.map((v) => (
          <span key={v.id} className={cx(chip(false), 'pr-1')}>
            <button type="button" className="inline-flex items-center gap-1.5" onClick={() => applyView(v)}>
              <Bookmark className="size-3 text-accent" />
              {v.name}
            </button>
            <button type="button" aria-label={t('ux.deleteView', { name: v.name })} className="rounded-full p-0.5 text-muted hover:text-ink" onClick={() => removeView(v)}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        {(active > 0 || query) && (
          <>
            <button type="button" className={cx(chip(false), 'text-muted')} onClick={() => setNaming(true)}>
              <Bookmark className="size-3" />
              {t('ux.saveView')}
            </button>
            <button type="button" className={cx(chip(false), 'text-muted')} onClick={reset}>
              <X className="size-3" />
              {t('discover.reset')}
            </button>
          </>
        )}
      </div>

      {active > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(value).filter(([key, v]) => key !== 'price' && v !== '' && v !== false).map(([key, v]) => (
            <button type="button" key={key} className="inline-flex max-w-full items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs text-brand" onClick={() => {
              const next = { ...value, [key]: EMPTY_FILTERS[key as keyof Filters] };
              if (key === 'region') { next.subRegion = ''; next.producer = ''; }
              if (key === 'subRegion') next.producer = '';
              onChange(next);
            }}>
              <span className="truncate">{labels[key]}{typeof v === 'boolean' ? '' : ` : ${key === 'color' ? t(`color.${v}`) : key === 'stock' ? t(`discover.${v}`) : v}`}</span>
              <X className="size-3 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {desktop && expanded && <div id={id} className="rounded-2xl border border-border bg-surface p-4">{panel}</div>}
      {!desktop && (
        <Modal
          open={expanded}
          sheet
          onClose={() => setExpanded(false)}
          title={t('discover.filters')}
          footer={
            <>
              <Button variant="ghost" onClick={reset}>{t('discover.reset')}</Button>
              <Button variant="primary" onClick={() => setExpanded(false)}>{t('ux.showResults', { n: count })}</Button>
            </>
          }
        >
          <div id={id}>{panel}</div>
        </Modal>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <p role="status" className="text-xs text-muted">{t('discover.results', { n: count, qty })}</p>
        {desktop && display}
      </div>

      <Modal
        open={naming}
        size="sm"
        onClose={() => setNaming(false)}
        title={t('ux.saveView')}
        footer={
          <>
            <Button onClick={() => setNaming(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" disabled={!viewName.trim()} onClick={storeView}>{t('common.save')}</Button>
          </>
        }
      >
        <Field label={t('ux.viewName')}>
          <Input autoFocus value={viewName} maxLength={40} onChange={(e) => setViewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && storeView()} placeholder={t('ux.viewNamePh')} />
        </Field>
      </Modal>
    </section>
  );
}
