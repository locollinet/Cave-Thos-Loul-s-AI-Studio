import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, BookOpen, Download, FileUp, Layers, ListChecks, Map as MapIcon, Percent, Plus, Send, Sparkles, Tag, Wine as WineIcon, X } from 'lucide-react';
import type { Wine, WineColor } from '@/types';
import { useCollection, useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Badge, Button, Card, Checkbox, EmptyState, Field, Modal, NumberInput, PageHeader, Segmented, Select, SortTh, Tabs, Td, Th, cx, useToast } from '@/ui';
import { stockByWine, wineAlerts } from '@/data/stock';
import { EMPTY_FILTERS, matchesWine, sortWines, type WineGroupBy, type WineSort } from '@/lib/wineFilters';
import { WineFilters } from '@/components/WineFilters';
import { WineGroups } from '@/components/WineGroups';
import { TerroirMap } from '@/components/TerroirMap';
import { WineThumb } from '@/components/WinePhoto';
import { downloadBlob, eur, round2, toCsv } from '@/lib/utils';
import { listOp } from '@/modules/carte/publish';
import type { WineList } from '@/modules/carte/types';
import { WineFormModal } from './wines/WineForm';
import { WineDrawer } from './wines/WineDrawer';
import { ImportWinesModal } from './wines/ImportWines';
import { DuplicatesPanel, findDuplicateGroups } from './wines/Duplicates';
import { BatchTechSheetModal } from './wines/BatchTechSheetModal';
import { AllocationsPanel } from '@/components/allocations/AllocationsPanel';
import { ShelfTalkerModal } from './wines/ShelfTalkerModal';

export const COLOR_DOT: Record<WineColor, string> = {
  rouge: 'bg-[#7a1f2b]',
  blanc: 'bg-[#e8d98a]',
  rose: 'bg-[#e9a1ad]',
  bulles: 'bg-[#d9c27a]',
  orange: 'bg-[#d9843b]',
  doux: 'bg-[#c9922b]',
  spiritueux: 'bg-[#8a5a2b]',
  autre: 'bg-border',
};

const ROUNDINGS = [0.01, 0.1, 0.5, 1];

/** Nouveau prix de vente HT selon la méthode ; `undefined` si le prix de référence manque. */
export function adjustedPrice(w: Pick<Wine, 'sellPriceHT' | 'buyPriceHT'>, mode: 'pct' | 'coef', value: number, rounding: number): number | undefined {
  const base = mode === 'pct' ? w.sellPriceHT : w.buyPriceHT;
  if (base === undefined || !Number.isFinite(value)) return undefined;
  const raw = mode === 'pct' ? base * (1 + value / 100) : base * value;
  return Math.max(0, round2(Math.round(raw / rounding) * rounding));
}

export default function WinesPage() {
  const { t, intl } = useI18n();
  const { toast, confirm } = useToast();
  const navigate = useNavigate();
  const { wines, stock, activeSiteId, can, org, orgId, commit, path } = useOrg();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'catalog' | 'allocations' | 'duplicates' | 'archived'>('catalog');
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [group, setGroup] = useState<WineGroupBy>('terroir');
  const [sort, setSort] = useState<WineSort>('producer');
  const [reverse, setReverse] = useState(false);
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [importing, setImporting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(params.get('open'));
  const [showMap, setShowMap] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [bulk, setBulk] = useState<'carte' | 'price' | 'techSheet' | null>(null);
  const [shelfOpen, setShelfOpen] = useState(false);

  useEffect(() => {
    if (params.get('new') === '1') setCreating(true);
    const o = params.get('open');
    if (o) setOpenId(o);
  }, [params]);

  const qty = useMemo(() => stockByWine(stock, activeSiteId), [stock, activeSiteId]);
  const duplicateGroups = useMemo(() => findDuplicateGroups(wines), [wines]);
  const pool = useMemo(() => wines.filter((w) => (tab === 'archived' ? !!w.isArchived : !w.isArchived)), [wines, tab]);
  const list = useMemo(() => sortWines(pool.filter((w) => matchesWine(w, qty.get(w.id) ?? 0, filters, q)), qty, sort, filters.price, reverse), [pool, q, filters, qty, sort, reverse]);
  const chosen = useMemo(() => list.filter((w) => selected.has(w.id)), [list, selected]);
  const canBulk = tab === 'catalog' && can('sommelier');
  const canOffer = org.modules.includes('negoce') && can('manager');
  const canCarte = org.modules.includes('carte');

  const open = (id: string | null) => {
    setOpenId(id);
    if (params.has('open') || params.has('new')) setParams({}, { replace: true });
  };
  const opened = wines.find((w) => w.id === openId);
  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const clear = () => { setSelected(new Set()); setSelecting(false); };
  const sortBy = (s: WineSort, basis?: typeof filters.price) => {
    if (basis && basis !== filters.price) setFilters({ ...filters, price: basis });
    if (sort === s && (!basis || basis === filters.price)) setReverse(!reverse);
    else { setSort(s); setReverse(false); }
  };
  const allChosen = list.length > 0 && list.every((w) => selected.has(w.id));

  const exportSelection = () =>
    downloadBlob(
      'vins.csv',
      toCsv([
        [t('wines.producer'), t('wines.cuvee'), t('wines.vintage'), t('wines.color'), t('wines.format'), t('wines.region'), t('discover.subRegion'), 'Appellation', t('common.qty'), t('wines.buyPrice'), t('wines.sellPrice')],
        ...chosen.map((w) => [w.producer, w.name, w.vintage, t(`color.${w.color}`), w.formatCl, w.region ?? '', w.subRegion ?? '', w.appellation ?? '', qty.get(w.id) ?? 0, w.buyPriceHT ?? '', w.sellPriceHT ?? '']),
      ]),
      'text/csv;charset=utf-8',
    );
  const archive = async () => {
    const ok = await confirm({ title: t('ux.bulk.archiveTitle', { n: chosen.length }), message: t('ux.bulk.archiveMsg'), confirmLabel: t('common.archive') });
    if (!ok) return;
    await commit(chosen.map((w) => ({ op: 'set' as const, path: path('wines', w.id), data: { isArchived: true, updatedAt: Date.now() }, merge: true })));
    toast(t('ux.bulk.archived', { n: chosen.length }));
    clear();
  };

  const grouped = group !== 'none';
  const selCol = canBulk; // tableau (ordinateur) : cases toujours visibles
  const selMobile = canBulk && (selecting || selected.size > 0);
  const columns = (selCol ? 1 : 0) + 1 + 1 + 1 + (grouped ? 0 : 2) + 2 + 1 + 1;
  const head = (
    <tr>
      {selCol && (
        <Th className="w-8">
          <Checkbox checked={allChosen} onChange={(v) => setSelected(v ? new Set(list.map((w) => w.id)) : new Set())} label={<span className="sr-only">{t('ux.selectAll')}</span>} />
        </Th>
      )}
      <Th className="w-6" />
      {!grouped && <SortTh active={sort === 'producer'} reverse={reverse} onClick={() => sortBy('producer')}>{t('wines.producer')}</SortTh>}
      <SortTh active={grouped && sort === 'producer'} reverse={reverse} onClick={() => sortBy('producer')}>{t('wines.cuvee')}</SortTh>
      <SortTh active={sort === 'vintage'} reverse={reverse} onClick={() => sortBy('vintage')}>{t('wines.vintage')}</SortTh>
      {!grouped && <Th className="hidden xl:table-cell">{t('wines.region')}</Th>}
      <SortTh right active={sort === 'price' && filters.price === 'buyPriceHT'} reverse={reverse} onClick={() => sortBy('price', 'buyPriceHT')}>{t('wines.buyPrice')}</SortTh>
      <SortTh right active={sort === 'price' && filters.price === 'sellPriceHT'} reverse={reverse} onClick={() => sortBy('price', 'sellPriceHT')}>{t('wines.sellPrice')}</SortTh>
      <SortTh right active={sort === 'qty'} reverse={reverse} onClick={() => sortBy('qty')}>{t('common.qty')}</SortTh>
      <Th />
    </tr>
  );
  const row = (w: Wine) => {
    const n = qty.get(w.id) ?? 0;
    const al = wineAlerts(w, n);
    const on = selected.has(w.id);
    return (
      <tr onClick={() => (selected.size ? toggle(w.id) : open(w.id))} className={cx('cursor-pointer hover:bg-surface-2/60', on && 'bg-brand-soft/60')}>
        {selCol && (
          <Td className="w-8" onClick={(e) => { e.stopPropagation(); toggle(w.id); }}>
            <Checkbox checked={on} onChange={() => toggle(w.id)} label={<span className="sr-only">{t('ux.selectWine', { name: `${w.producer} ${w.name} ${w.vintage}` })}</span>} />
          </Td>
        )}
        <Td className="w-6">
          <span className={cx('block size-2.5 rounded-full', COLOR_DOT[w.color])} />
        </Td>
        {!grouped && <Td className="font-medium">{w.producer}</Td>}
        <Td className={cx('max-w-80 truncate', grouped && 'font-medium')}>
          {w.hasImage && <WineThumb wine={w} className="mr-2 inline-block size-7 align-middle" />}
          {w.name}
          {w.formatCl !== 75 && <Badge className="ml-2">{w.formatCl === 150 ? 'Magnum' : `${w.formatCl} cl`}</Badge>}
        </Td>
        <Td className="tabular">{w.vintage}</Td>
        {!grouped && <Td className="hidden text-muted xl:table-cell">{w.region}</Td>}
        <Td right className="text-muted">{w.buyPriceHT !== undefined ? eur(w.buyPriceHT, 'EUR', intl) : '—'}</Td>
        <Td right>{w.sellPriceHT !== undefined ? eur(w.sellPriceHT, 'EUR', intl) : '—'}</Td>
        <Td right className={cx('font-semibold', n <= 0 && 'text-bad')}>{n}</Td>
        <Td>
          <span className="flex gap-1">
            {al.includes('low') && <Badge tone="warn">{t('alert.low')}</Badge>}
            {al.includes('past') && <Badge tone="bad">{t('alert.past')}</Badge>}
            {al.includes('apogee') && <Badge tone="ok">{t('alert.apogee')}</Badge>}
          </span>
        </Td>
      </tr>
    );
  };
  const card = (w: Wine) => {
    const n = qty.get(w.id) ?? 0;
    const on = selected.has(w.id);
    return (
      <div className={cx('flex items-center gap-3 px-3 py-2.5', on && 'bg-brand-soft/60')}>
        {selMobile && <Checkbox checked={on} onChange={() => toggle(w.id)} label={<span className="sr-only">{t('ux.selectWine', { name: `${w.producer} ${w.name} ${w.vintage}` })}</span>} />}
        <button type="button" onClick={() => (selMobile ? toggle(w.id) : open(w.id))} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {w.hasImage ? <WineThumb wine={w} className="size-9 shrink-0" /> : <span className={cx('size-2.5 shrink-0 rounded-full', COLOR_DOT[w.color])} />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{w.name}</span>
            <span className="block truncate text-xs text-muted">
              {grouped ? '' : `${w.producer} · `}
              {w.vintage}
              {w.formatCl !== 75 ? ` · ${w.formatCl === 150 ? 'Magnum' : `${w.formatCl} cl`}` : ''}
            </span>
          </span>
          <span className={cx('tabular font-display text-xl', n <= 0 && 'text-bad')}>{n}</span>
        </button>
      </div>
    );
  };

  return (
    <div className={cx(selected.size > 0 && 'pb-24')}>
      <PageHeader
        title={t('nav.wines')}
        subtitle={t('wines.subtitle', { n: wines.filter((w) => !w.isArchived).length })}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" icon={<Layers className="size-4 text-brand" />} onClick={() => navigate('/stock?tab=cellar')}>
              {t('stock.cellarPlan')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<Tag className="size-4 text-brand" />}
              onClick={() => setShelfOpen(true)}
              title="Générer des étiquettes de rayon & stop-rayons à imprimer"
            >
              <span className="hidden sm:inline">Stop-rayons</span>
            </Button>
            {can('manager') && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Sparkles className="size-4 text-accent" />}
                  onClick={() => setBulk('techSheet')}
                  title="Enrichir les fiches techniques par lot avec l'IA"
                >
                  <span className="hidden sm:inline">Fiches IA par lot</span>
                </Button>
                <Button size="sm" icon={<FileUp className="size-4" />} onClick={() => setImporting(true)}>
                  <span className="hidden sm:inline">{t('common.import')}</span>
                </Button>
                <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                  {t('wines.new')}
                </Button>
              </>
            )}
          </div>
        }
      />
      <Tabs
        value={tab}
        onChange={(v) => { setTab(v); clear(); }}
        tabs={[
          { value: 'catalog', label: t('wines.catalog') },
          { value: 'allocations', label: 'Allocations vignerons' },
          { value: 'duplicates', label: t('wines.duplicates'), count: duplicateGroups.length },
          { value: 'archived', label: t('wines.archived') },
        ]}
      />

      {tab === 'allocations' ? (
        <AllocationsPanel />
      ) : tab === 'duplicates' ? (
        <DuplicatesPanel groups={duplicateGroups} />
      ) : (
        <>
          <WineFilters
            wines={pool}
            value={filters}
            onChange={setFilters}
            query={q}
            onQuery={setQ}
            group={group}
            onGroup={setGroup}
            sort={sort}
            onSort={(s) => { setSort(s); setReverse(false); }}
            count={list.length}
            qty={list.reduce((sum, w) => sum + (qty.get(w.id) ?? 0), 0)}
            viewsKey={`${orgId}:wines`}
            extra={
              <>
                <Button aria-pressed={showMap} variant={showMap ? 'primary' : 'secondary'} icon={<MapIcon className="size-4" />} onClick={() => setShowMap(!showMap)}>
                  <span className="hidden sm:inline">{t('ux.map')}</span>
                </Button>
                {canBulk && (
                  <Button className="md:hidden" aria-label={t('ux.select')} aria-pressed={selecting} variant={selecting ? 'primary' : 'secondary'} icon={<ListChecks className="size-4" />} onClick={() => (selecting ? clear() : setSelecting(true))} />
                )}
              </>
            }
          />
          {showMap && (
            <Card className="mb-5 p-4">
              <TerroirMap wines={pool} qty={qty} selected={filters.region} onSelect={(region) => setFilters({ ...filters, region, subRegion: '', producer: '' })} />
            </Card>
          )}

          {list.length === 0 ? (
            <EmptyState
              icon={<WineIcon className="size-8" />}
              title={t('wines.empty')}
              hint={t('wines.emptyHint')}
              action={can('manager') && <Button variant="primary" onClick={() => setCreating(true)}>{t('wines.new')}</Button>}
            />
          ) : (
            <WineGroups wines={list} by={group} qty={qty} columns={columns} head={head} row={row} card={card} />
          )}
        </>
      )}

      {selected.size > 0 && (
        <div className="no-print fixed inset-x-0 bottom-20 z-40 flex justify-center px-3 md:bottom-6">
          <div role="toolbar" aria-label={t('ux.selected', { n: chosen.length })} className="animate-in flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-surface p-1.5 shadow-xl">
            <span className="whitespace-nowrap px-2 text-sm font-medium">{t('ux.selected', { n: chosen.length })}</span>
            {canCarte && <Button size="sm" variant="ghost" icon={<BookOpen className="size-4" />} onClick={() => setBulk('carte')}>{t('ux.bulk.carte')}</Button>}
            {canOffer && <Button size="sm" variant="ghost" icon={<Send className="size-4" />} onClick={() => navigate(`/negoce/offres/new?wines=${chosen.map((w) => w.id).join(',')}`)}>{t('ux.bulk.offer')}</Button>}
            {can('manager') && <Button size="sm" variant="ghost" icon={<Percent className="size-4" />} onClick={() => setBulk('price')}>{t('ux.bulk.price')}</Button>}
            {can('manager') && <Button size="sm" variant="ghost" icon={<Sparkles className="size-4 text-accent" />} onClick={() => setBulk('techSheet')}>{t('ux.bulk.techSheet')}</Button>}
            <Button size="sm" variant="ghost" icon={<Tag className="size-4 text-brand" />} onClick={() => setShelfOpen(true)}>Stop-rayons</Button>
            <Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={exportSelection}>{t('ux.bulk.export')}</Button>
            {can('manager') && <Button size="sm" variant="ghost" icon={<Archive className="size-4" />} onClick={archive}>{t('ux.bulk.archive')}</Button>}
            <Button size="sm" variant="ghost" aria-label={t('ux.bulk.clear')} icon={<X className="size-4" />} onClick={clear} />
          </div>
        </div>
      )}

      {bulk === 'carte' && <AddToListModal wines={chosen} onClose={() => setBulk(null)} onDone={clear} />}
      {bulk === 'price' && <PriceModal wines={chosen} onClose={() => setBulk(null)} onDone={clear} />}
      {bulk === 'techSheet' && <BatchTechSheetModal wines={chosen.length > 0 ? chosen : pool} onClose={() => setBulk(null)} onDone={clear} />}
      {shelfOpen && <ShelfTalkerModal open={shelfOpen} onClose={() => setShelfOpen(false)} wines={chosen.length > 0 ? chosen : list} />}
      {creating && <WineFormModal onClose={() => { setCreating(false); if (params.has('new')) setParams({}, { replace: true }); }} onSaved={(w) => setOpenId(w.id)} />}
      {importing && <ImportWinesModal onClose={() => setImporting(false)} />}
      {opened && <WineDrawer wine={opened} onClose={() => open(null)} />}
    </div>
  );
}

function AddToListModal({ wines, onClose, onDone }: { wines: Wine[]; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { orgId, commit, path } = useOrg();
  const { rows: lists } = useCollection<WineList>('wineLists');
  const [listId, setListId] = useState('');
  const [pin, setPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const target = lists.find((l) => l.id === (listId || lists[0]?.id));
  const hidden = wines.filter((w) => w.hideFromMenu);
  const apply = async () => {
    if (!target) return;
    setBusy(true);
    const ids = new Set(wines.map((w) => w.id));
    const next: WineList = {
      ...target,
      excludedWineIds: target.excludedWineIds.filter((id) => !ids.has(id)),
      pinnedWineIds: pin ? [...new Set([...target.pinnedWineIds, ...ids])] : target.pinnedWineIds,
      updatedAt: Date.now(),
    };
    await commit([listOp(orgId, next), ...hidden.map((w) => ({ op: 'set' as const, path: path('wines', w.id), data: { hideFromMenu: false, updatedAt: Date.now() }, merge: true }))]);
    toast(t('ux.carte.done', { n: wines.length, name: target.name }));
    setBusy(false);
    onDone();
    onClose();
  };
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={t('ux.carte.title')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={!target} onClick={apply}>{t('ux.carte.title')}</Button>
        </>
      }
    >
      {lists.length === 0 ? (
        <p className="text-sm text-muted">{t('ux.carte.none')}</p>
      ) : (
        <div className="space-y-4">
          <Field label={t('ux.carte.list')}>
            <Select value={target?.id ?? ''} onChange={(e) => setListId(e.target.value)}>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name || t('carte.untitled')}</option>)}
            </Select>
          </Field>
          <Checkbox checked={pin} onChange={setPin} label={t('ux.carte.pin')} />
          {hidden.length > 0 && <p className="text-xs text-muted">{t('ux.carte.hiddenNote', { n: hidden.length })}</p>}
        </div>
      )}
    </Modal>
  );
}

function PriceModal({ wines, onClose, onDone }: { wines: Wine[]; onClose: () => void; onDone: () => void }) {
  const { t, intl } = useI18n();
  const { toast } = useToast();
  const { commit, path, org } = useOrg();
  const [mode, setMode] = useState<'pct' | 'coef'>('pct');
  const [value, setValue] = useState<number | undefined>(5);
  const [rounding, setRounding] = useState(0.1);
  const [busy, setBusy] = useState(false);
  const preview = wines.map((w) => ({ w, next: value === undefined ? undefined : adjustedPrice(w, mode, value, rounding) }));
  const changes = preview.filter((p) => p.next !== undefined);
  const apply = async () => {
    setBusy(true);
    await commit(changes.map(({ w, next }) => ({ op: 'set' as const, path: path('wines', w.id), data: { sellPriceHT: next, updatedAt: Date.now() }, merge: true })));
    toast(t('ux.price.done', { n: changes.length }));
    setBusy(false);
    onDone();
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('ux.price.title')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={!changes.length} onClick={apply}>{t('ux.price.apply', { n: changes.length })}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('ux.price.mode')}>
          <Segmented value={mode} onChange={(m) => { setMode(m); setValue(m === 'pct' ? 5 : org.defaultCoefficient); }} options={[{ value: 'pct', label: t('ux.price.pct') }, { value: 'coef', label: t('ux.price.coef') }]} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('ux.price.value')}>
            <NumberInput value={value} onChange={setValue} step={mode === 'pct' ? 1 : 0.05} />
          </Field>
          <Field label={t('ux.price.rounding')}>
            <Select value={rounding} onChange={(e) => setRounding(Number(e.target.value))}>
              {ROUNDINGS.map((r) => <option key={r} value={r}>{eur(r, 'EUR', intl)}</option>)}
            </Select>
          </Field>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{t('ux.price.preview')}</p>
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {preview.slice(0, 6).map(({ w, next }) => (
              <li key={w.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate">{w.producer} · {w.name} {w.vintage}</span>
                <span className="tabular shrink-0 text-muted">
                  {w.sellPriceHT !== undefined ? eur(w.sellPriceHT, 'EUR', intl) : '—'} → <span className="text-ink">{next !== undefined ? eur(next, 'EUR', intl) : '—'}</span>
                </span>
              </li>
            ))}
          </ul>
          {preview.length > changes.length && <p className="mt-2 text-xs text-warn">{t('ux.price.skipped', { n: preview.length - changes.length })}</p>}
        </div>
      </div>
    </Modal>
  );
}
