import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, Boxes, Download, ReceiptText, SlidersHorizontal } from 'lucide-react';
import type { Movement, MovementType, Wine } from '@/types';
import { useCollection, useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Badge, Button, EmptyState, PageHeader, SearchInput, SortTh, Table, Tabs, Td, Th, cx } from '@/ui';
import { stockByWine, wineAlerts } from '@/data/stock';
import { norm, wineLabel } from '@/lib/wine';
import { dateFr, downloadBlob, eur, toCsv } from '@/lib/utils';
import { MovementModal } from './stock/MovementModal';
import { WineDrawer } from './wines/WineDrawer';
import { COLOR_DOT } from './Wines';
import { WineFilters } from '@/components/WineFilters';
import { WineGroups } from '@/components/WineGroups';
import { EMPTY_FILTERS, matchesWine, sortWines, type WineGroupBy, type WineSort } from '@/lib/wineFilters';
import { CellarMap } from '@/components/cellar/CellarMap';
import { PosReconciliationModal } from '@/components/pos/PosReconciliationModal';

const MOVE_TONE: Record<MovementType, 'ok' | 'neutral' | 'info' | 'warn'> = { in: 'ok', out: 'neutral', transfer: 'info', adjust: 'warn' };
const isMove = (v: string | null): v is MovementType => v === 'in' || v === 'out' || v === 'transfer' || v === 'adjust';

export default function StockPage() {
  const { t, intl } = useI18n();
  const { wines, stock, sites, activeSiteId, can, orgId } = useOrg();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'levels' | 'map' | 'journal'>('levels');
  const [posModal, setPosModal] = useState(false);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [group, setGroup] = useState<WineGroupBy>('terroir');
  const [sort, setSort] = useState<WineSort>('producer');
  const [reverse, setReverse] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [modal, setModal] = useState<MovementType | null>(() => (isMove(params.get('new')) ? (params.get('new') as MovementType) : null));
  const { rows: movements, loading } = useCollection<Movement>('movements', { orderBy: ['createdAt', 'desc'], limit: 500 });

  useEffect(() => {
    const n = params.get('new');
    if (isMove(n)) setModal(n);
  }, [params]);

  const closeModal = () => {
    setModal(null);
    if (params.has('new')) setParams({}, { replace: true });
  };

  const visibleSites = activeSiteId === 'all' ? sites : sites.filter((s) => s.id === activeSiteId);
  const qty = useMemo(() => stockByWine(stock, activeSiteId), [stock, activeSiteId]);
  const opened = wines.find((w) => w.id === openId);
  const pool = useMemo(() => wines.filter((w) => !w.isArchived), [wines]);
  const rows = useMemo(
    () =>
      sortWines(pool.filter((w) => matchesWine(w, qty.get(w.id) ?? 0, filters, q)), qty, sort, filters.price, reverse).map((w) => {
        const per = visibleSites.map((s) => stock.find((l) => l.wineId === w.id && l.siteId === s.id)?.qty ?? 0);
        const total = per.reduce((a, b) => a + b, 0);
        return { w, per, total, alerts: wineAlerts(w, total) };
      }),
    [pool, stock, visibleSites, q, filters, qty, sort, reverse],
  );
  const rowsById = useMemo(() => new Map(rows.map((r) => [r.w.id, r])), [rows]);

  const journal = useMemo(
    () =>
      movements.filter((m) => {
        if (activeSiteId !== 'all' && m.siteId !== activeSiteId && m.toSiteId !== activeSiteId) return false;
        const terms = norm(q).split(' ').filter(Boolean);
        return !terms.length || terms.every((x) => norm(`${m.wineLabel} ${m.userName} ${m.note ?? ''}`).includes(x));
      }),
    [movements, activeSiteId, q],
  );

  const siteName = (id?: string) => sites.find((s) => s.id === id)?.name ?? '—';
  const signed = (m: Movement) => `${m.type === 'out' ? '−' : m.type === 'in' || (m.type === 'adjust' && m.qty > 0) ? '+' : ''}${m.type === 'adjust' ? m.qty : Math.abs(m.qty)}`;
  const exportCsv = () => {
    if (tab === 'levels')
      downloadBlob(
        'stock.csv',
        toCsv([[t('stock.wine'), ...visibleSites.map((s) => s.name), t('common.total'), t('stock.value')], ...rows.map((r) => [wineLabel(r.w), ...r.per, r.total, (r.total * (r.w.buyPriceHT ?? 0)).toFixed(2)])]),
        'text/csv;charset=utf-8',
      );
    else
      downloadBlob(
        'mouvements.csv',
        toCsv([[t('common.date'), t('stock.wine'), t('stock.type'), t('common.qty'), t('common.site'), t('stock.reason'), t('stock.by')], ...journal.map((m) => [m.date, m.wineLabel, m.type, m.qty, siteName(m.siteId), m.reason, m.userName])]),
        'text/csv;charset=utf-8',
      );
  };
  const sortBy = (s: WineSort) => {
    if (sort === s) setReverse(!reverse);
    else { setSort(s); setReverse(false); }
  };

  const grouped = group !== 'none';
  const columns = 2 + visibleSites.length + 3;
  const head = (
    <tr>
      <Th className="w-6" />
      <SortTh active={sort === 'producer'} reverse={reverse} onClick={() => sortBy('producer')}>{t('stock.wine')}</SortTh>
      {visibleSites.map((s) => <Th key={s.id} right>{s.name}</Th>)}
      <SortTh right active={sort === 'qty'} reverse={reverse} onClick={() => sortBy('qty')}>{t('common.total')}</SortTh>
      <Th right>{t('stock.value')}</Th>
      <Th />
    </tr>
  );
  const alerts = (list: string[]) => (
    <span className="flex flex-wrap gap-1">
      {list.includes('out') && <Badge tone="bad">{t('alert.out')}</Badge>}
      {list.includes('low') && <Badge tone="warn">{t('alert.low')}</Badge>}
      {list.includes('apogee') && <Badge tone="ok">{t('alert.apogee')}</Badge>}
      {list.includes('past') && <Badge tone="bad">{t('alert.past')}</Badge>}
    </span>
  );
  const row = (w: Wine) => {
    const r = rowsById.get(w.id)!;
    return (
      <tr onClick={() => setOpenId(w.id)} className="cursor-pointer hover:bg-surface-2/60">
        <Td className="w-6"><span className={cx('block size-2.5 rounded-full', COLOR_DOT[w.color])} /></Td>
        <Td className="max-w-96 truncate font-medium">
          {grouped ? `${w.name} · ${w.vintage}` : wineLabel(w)}
          {w.formatCl !== 75 && <Badge className="ml-2">{w.formatCl === 150 ? 'Magnum' : `${w.formatCl} cl`}</Badge>}
        </Td>
        {r.per.map((n, i) => <Td key={i} right className={cx(n <= 0 && 'text-muted')}>{n}</Td>)}
        <Td right className="font-semibold">{r.total}</Td>
        <Td right className="text-muted">{eur(r.total * (w.buyPriceHT ?? 0), 'EUR', intl)}</Td>
        <Td>{alerts(r.alerts)}</Td>
      </tr>
    );
  };
  const card = (w: Wine) => {
    const r = rowsById.get(w.id)!;
    return (
      <button type="button" onClick={() => setOpenId(w.id)} className="w-full px-3 py-2.5 text-left hover:bg-surface-2">
        <span className="flex items-center gap-3">
          <span className={cx('size-2.5 shrink-0 rounded-full', COLOR_DOT[w.color])} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{w.name}</span>
            <span className="block truncate text-xs text-muted">
              {grouped ? '' : `${w.producer} · `}{w.vintage}
              {visibleSites.length > 1 && ` · ${visibleSites.map((s, i) => `${s.name} ${r.per[i]}`).join(' · ')}`}
            </span>
          </span>
          <span className={cx('tabular font-display text-xl', r.total <= 0 && 'text-bad')}>{r.total}</span>
        </span>
        {r.alerts.some((a) => a !== 'apogee') && <span className="mt-1.5 block pl-5.5">{alerts(r.alerts)}</span>}
      </button>
    );
  };

  return (
    <div>
      <PageHeader
        title={t('nav.stock')}
        subtitle={t('stock.subtitle')}
        actions={
          <div className="hidden flex-wrap gap-2 md:flex">
            <Button size="sm" variant="secondary" icon={<ReceiptText className="size-4 text-brand" />} onClick={() => setPosModal(true)}>
              Caisse POS (Z)
            </Button>
            <Button size="sm" icon={<Download className="size-4" />} onClick={exportCsv}>{t('common.export')}</Button>
            <Button size="sm" icon={<ArrowDownToLine className="size-4" />} onClick={() => setModal('in')}>{t('stock.type.in')}</Button>
            <Button size="sm" icon={<ArrowUpFromLine className="size-4" />} onClick={() => setModal('out')}>{t('stock.type.out')}</Button>
            {sites.length > 1 && <Button size="sm" icon={<ArrowRightLeft className="size-4" />} onClick={() => setModal('transfer')}>{t('stock.type.transfer')}</Button>}
            {can('manager') && <Button size="sm" icon={<SlidersHorizontal className="size-4" />} onClick={() => setModal('adjust')}>{t('stock.type.adjust')}</Button>}
          </div>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'levels', label: t('stock.levels') },
          { value: 'map', label: 'Plan de cave (2D / 3D)' },
          { value: 'journal', label: t('stock.journal'), count: journal.length },
        ]}
      />
      {tab === 'map' ? (
        <CellarMap onOpenWine={(id) => setOpenId(id)} />
      ) : tab === 'levels' ? (
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
          count={rows.length}
          qty={rows.reduce((sum, r) => sum + r.total, 0)}
          viewsKey={`${orgId}:stock`}
          extra={
            <div className="flex gap-1 md:hidden">
              <Button aria-label="Caisse POS" icon={<ReceiptText className="size-4" />} onClick={() => setPosModal(true)} />
              <Button aria-label={t('common.export')} icon={<Download className="size-4" />} onClick={exportCsv} />
            </div>
          }
        />
      ) : (
        <div className="mb-4 space-y-2">
          <SearchInput value={q} onChange={setQ} placeholder={t('common.search')} />
          <p className="text-xs text-muted">{t('discover.journalHint')}</p>
        </div>
      )}

      {tab === 'levels' ? (
        rows.length === 0 ? (
          <EmptyState icon={<Boxes className="size-8" />} title={t('stock.empty')} hint={t('stock.emptyHint')} />
        ) : (
          <WineGroups wines={rows.map((r) => r.w)} by={group} qty={qty} columns={columns} head={head} row={row} card={card} />
        )
      ) : loading ? null : journal.length === 0 ? (
        <EmptyState icon={<Boxes className="size-8" />} title={t('stock.journalEmpty')} />
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface md:hidden">
            {journal.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.wineLabel}</span>
                  <span className="block truncate text-xs text-muted">
                    {dateFr(m.date, intl)} · {t(`reason.${m.reason}`)} · {m.type === 'transfer' ? `${siteName(m.siteId)} → ${siteName(m.toSiteId)}` : siteName(m.siteId)}
                  </span>
                </span>
                <span className={cx('tabular font-display text-xl', m.type === 'in' && 'text-ok')}>{signed(m)}</span>
              </li>
            ))}
          </ul>
          <Table className="hidden md:block">
            <thead>
              <tr>
                <Th>{t('common.date')}</Th>
                <Th>{t('stock.wine')}</Th>
                <Th>{t('stock.type')}</Th>
                <Th right>{t('common.qty')}</Th>
                <Th>{t('common.site')}</Th>
                <Th>{t('stock.reason')}</Th>
                <Th>{t('stock.by')}</Th>
              </tr>
            </thead>
            <tbody>
              {journal.map((m) => (
                <tr key={m.id} className="hover:bg-surface-2/50">
                  <Td className="whitespace-nowrap text-muted">{dateFr(m.date, intl)}</Td>
                  <Td className="max-w-72 truncate font-medium">{m.wineLabel}</Td>
                  <Td><Badge tone={MOVE_TONE[m.type]}>{t(`stock.type.${m.type}`)}</Badge></Td>
                  <Td right className="font-semibold">{signed(m)}</Td>
                  <Td className="text-muted">{m.type === 'transfer' ? `${siteName(m.siteId)} → ${siteName(m.toSiteId)}` : siteName(m.siteId)}</Td>
                  <Td className="text-muted">{t(`reason.${m.reason}`)}</Td>
                  <Td className="text-muted">{m.userName}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
      {modal && <MovementModal initialType={modal} onClose={closeModal} />}
      {opened && <WineDrawer wine={opened} onClose={() => setOpenId(null)} />}
      {posModal && <PosReconciliationModal onClose={() => setPosModal(false)} />}
    </div>
  );
}
