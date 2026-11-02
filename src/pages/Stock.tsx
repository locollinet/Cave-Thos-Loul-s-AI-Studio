import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, Boxes, Download, Eye, Layers, ReceiptText, SlidersHorizontal } from 'lucide-react';
import type { Movement, MovementType, Site, StockLevel, Wine } from '@/types';
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
import { CellarPlan } from './stock/CellarPlan';
import { QuickBinModal } from './stock/QuickBinPopover';

const MOVE_TONE: Record<MovementType, 'ok' | 'neutral' | 'info' | 'warn'> = { in: 'ok', out: 'neutral', transfer: 'info', adjust: 'warn' };
const isMove = (v: string | null): v is MovementType => v === 'in' || v === 'out' || v === 'transfer' || v === 'adjust';

export default function StockPage() {
  const { t, intl } = useI18n();
  const { wines, stock, sites, activeSiteId, can, orgId, canSeeCosts } = useOrg();
  const [params, setParams] = useSearchParams();
  const urlTab = params.get('tab');
  const [tab, setTab] = useState<'levels' | 'cellar' | 'journal'>(() => (urlTab === 'cellar' || urlTab === 'journal' ? urlTab : 'levels'));
  const [cellarMode, setCellarMode] = useState<'plan' | '3d'>('plan');
  const [posModal, setPosModal] = useState(false);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [group, setGroup] = useState<WineGroupBy>('terroir');
  const [sort, setSort] = useState<WineSort>('producer');
  const [reverse, setReverse] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [quickBinTarget, setQuickBinTarget] = useState<{ wine: Wine; site: Site; level?: StockLevel } | null>(null);
  const [modal, setModal] = useState<MovementType | null>(() => (isMove(params.get('new')) ? (params.get('new') as MovementType) : null));
  const { rows: movements, loading } = useCollection<Movement>('movements', { orderBy: ['createdAt', 'desc'], limit: 500 });

  useEffect(() => {
    const t = params.get('tab');
    if (t === 'cellar' || t === 'journal' || t === 'levels') setTab(t);
  }, [params]);

  useEffect(() => {
    const n = params.get('new');
    if (isMove(n)) setModal(n);
  }, [params]);

  const switchTab = (nextTab: 'levels' | 'cellar' | 'journal') => {
    setTab(nextTab);
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (nextTab === 'levels') p.delete('tab');
        else p.set('tab', nextTab);
        return p;
      },
      { replace: true },
    );
  };

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
        toCsv([[t('stock.wine'), ...visibleSites.map((s) => s.name), t('common.total'), ...(canSeeCosts ? [t('stock.value')] : [])], ...rows.map((r) => [wineLabel(r.w), ...r.per, r.total, ...(canSeeCosts ? [(r.total * (r.w.buyPriceHT ?? 0)).toFixed(2)] : [])])]),
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
  const isSingleSite = visibleSites.length === 1;
  const singleSite = isSingleSite ? visibleSites[0] : null;
  const columns = 2 + visibleSites.length + (canSeeCosts ? 3 : 2) + (isSingleSite ? 1 : 0);
  const head = (
    <tr>
      <Th className="w-6" />
      <SortTh active={sort === 'producer'} reverse={reverse} onClick={() => sortBy('producer')}>{t('stock.wine')}</SortTh>
      {isSingleSite && <Th>{t('stock.bin')}</Th>}
      {visibleSites.map((s) => <Th key={s.id} right>{s.name}</Th>)}
      <SortTh right active={sort === 'qty'} reverse={reverse} onClick={() => sortBy('qty')}>{t('common.total')}</SortTh>
      {canSeeCosts && <Th right>{t('stock.value')}</Th>}
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
    const singleLevel = singleSite ? stock.find((l) => l.wineId === w.id && l.siteId === singleSite.id) : null;
    return (
      <tr onClick={() => setOpenId(w.id)} className="cursor-pointer hover:bg-surface-2/60">
        <Td className="w-6"><span className={cx('block size-2.5 rounded-full', COLOR_DOT[w.color])} /></Td>
        <Td className="max-w-96 truncate font-medium">
          {grouped ? `${w.name} · ${w.vintage}` : wineLabel(w)}
          {w.formatCl !== 75 && <Badge className="ml-2">{w.formatCl === 150 ? 'Magnum' : `${w.formatCl} cl`}</Badge>}
        </Td>
        {isSingleSite && (
          <Td className="text-xs font-mono text-muted whitespace-nowrap">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (singleSite) setQuickBinTarget({ wine: w, site: singleSite, level: singleLevel ?? undefined });
              }}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface-3 hover:text-brand cursor-pointer"
              title="Modifier l'emplacement"
            >
              {singleLevel?.bin ? (
                <span className="text-ink font-semibold">{singleLevel.bin}</span>
              ) : (
                <span className="text-muted/70 italic">+ Emplacement</span>
              )}
            </button>
          </Td>
        )}
        {r.per.map((n, i) => <Td key={i} right className={cx(n <= 0 && 'text-muted')}>{n}</Td>)}
        <Td right className="font-semibold">{r.total}</Td>
        {canSeeCosts && <Td right className="text-muted">{eur(r.total * (w.buyPriceHT ?? 0), 'EUR', intl)}</Td>}
        <Td>{alerts(r.alerts)}</Td>
      </tr>
    );
  };
  const card = (w: Wine) => {
    const r = rowsById.get(w.id)!;
    const singleLevel = singleSite ? stock.find((l) => l.wineId === w.id && l.siteId === singleSite.id) : null;
    return (
      <button type="button" onClick={() => setOpenId(w.id)} className="w-full px-3 py-2.5 text-left hover:bg-surface-2">
        <span className="flex items-center gap-3">
          <span className={cx('size-2.5 shrink-0 rounded-full', COLOR_DOT[w.color])} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{w.name}</span>
            <span className="block truncate text-xs text-muted">
              {grouped ? '' : `${w.producer} · `}{w.vintage}
              {singleLevel?.bin && ` · 📍 ${singleLevel.bin}`}
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
            {canSeeCosts && (
              <Button size="sm" variant="secondary" icon={<ReceiptText className="size-4 text-brand" />} onClick={() => setPosModal(true)}>
                Ventes caisse
              </Button>
            )}
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
        onChange={switchTab}
        tabs={[
          { value: 'levels', label: t('stock.levels') },
          { value: 'cellar', label: t('stock.cellarPlan') },
          { value: 'journal', label: t('stock.journal'), count: journal.length },
        ]}
      />

      {tab === 'cellar' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
            <p className="text-sm text-muted">
              {cellarMode === 'plan'
                ? 'Configuration des armoires, alvéoles et affectation rapide des bouteilles.'
                : 'Cartographie de prestige avec casiers en chêne 2D et scène WebGL 3D réaliste.'}
            </p>
            <div className="flex gap-1.5 rounded-lg border border-border bg-surface-2/40 p-1">
              <Button
                size="sm"
                variant={cellarMode === 'plan' ? 'secondary' : 'ghost'}
                icon={<Layers className="size-4" />}
                onClick={() => setCellarMode('plan')}
              >
                Gestion Casiers & Alvéoles
              </Button>
              <Button
                size="sm"
                variant={cellarMode === '3d' ? 'secondary' : 'ghost'}
                icon={<Eye className="size-4 text-brand" />}
                onClick={() => setCellarMode('3d')}
              >
                Vue 2D / 3D Réaliste
              </Button>
            </div>
          </div>
          {cellarMode === 'plan' ? (
            <CellarPlan />
          ) : (
            <CellarMap onOpenWine={(id) => setOpenId(id)} onConfigure={() => setCellarMode('plan')} />
          )}
        </div>
      ) : tab === 'levels' ? (
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
            count={rows.length}
            qty={rows.reduce((sum, r) => sum + r.total, 0)}
            viewsKey={`${orgId}:stock`}
            extra={<Button className="md:hidden" aria-label={t('common.export')} icon={<Download className="size-4" />} onClick={exportCsv} />}
          />
          {rows.length === 0 ? (
            <EmptyState icon={<Boxes className="size-8" />} title={t('stock.empty')} hint={t('stock.emptyHint')} />
          ) : (
            <WineGroups wines={rows.map((r) => r.w)} by={group} qty={qty} columns={columns} head={head} row={row} card={card} />
          )}
        </>
      ) : (
        <>
          <div className="mb-4 space-y-2">
            <SearchInput value={q} onChange={setQ} placeholder={t('common.search')} />
            <p className="text-xs text-muted">{t('discover.journalHint')}</p>
          </div>
          {loading ? null : journal.length === 0 ? (
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
        </>
      )}

      {modal && <MovementModal initialType={modal} onClose={closeModal} />}
      {opened && <WineDrawer wine={opened} onClose={() => setOpenId(null)} />}
      {posModal && <PosReconciliationModal onClose={() => setPosModal(false)} />}
      {quickBinTarget && (
        <QuickBinModal
          wine={quickBinTarget.wine}
          site={quickBinTarget.site}
          level={quickBinTarget.level}
          onClose={() => setQuickBinTarget(null)}
        />
      )}
    </div>
  );
}
