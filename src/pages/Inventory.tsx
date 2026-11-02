import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ClipboardCheck, Minus, Plus, ScanBarcode, ScanLine } from 'lucide-react';
import type { InventorySession, Wine } from '@/types';
import { useCollection, useOrg } from '@/app/org';
import { useAuth } from '@/app/auth';
import { useI18n } from '@/i18n';
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Select, Table, Td, Th, useToast, cx } from '@/ui';
import { buildMovementOps, qtyAt } from '@/data/stock';
import { norm, wineLabel } from '@/lib/wine';
import { dateFr, uid } from '@/lib/utils';
import { findWineByBarcode } from '@/lib/barcode';
import { Scanner } from '@/components/Scanner';
import { COLOR_DOT } from './Wines';

export default function InventoryPage() {
  const { t, intl } = useI18n();
  const { toast } = useToast();
  const { user } = useAuth();
  const { sites, activeSiteId, commit, path } = useOrg();
  const { rows: sessions } = useCollection<InventorySession>('inventories', { orderBy: ['startedAt', 'desc'], limit: 50 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [siteId, setSiteId] = useState(activeSiteId !== 'all' ? activeSiteId : sites[0]?.id ?? '');

  const open = sessions.find((s) => s.id === openId);
  const start = async () => {
    if (!user) return;
    const s: InventorySession = { id: uid(), siteId, name: `${t('inv.name')} ${new Date().toLocaleDateString(intl)}`, status: 'open', counts: {}, startedAt: Date.now(), userName: user.name };
    await commit([{ op: 'set', path: path('inventories', s.id), data: s as never }]);
    setStarting(false);
    setOpenId(s.id);
    toast(t('inv.started'));
  };

  if (open) return <CountScreen session={open} onBack={() => setOpenId(null)} />;

  return (
    <div>
      <PageHeader title={t('nav.inventory')} subtitle={t('inv.subtitle')} actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setStarting(true)}>{t('inv.start')}</Button>} />
      {sessions.length === 0 ? (
        <EmptyState icon={<ClipboardCheck className="size-8" />} title={t('inv.empty')} hint={t('inv.emptyHint')} />
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <button key={s.id} onClick={() => setOpenId(s.id)} className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left hover:bg-surface-2/60">
              <ClipboardCheck className="size-5 text-brand" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{s.name}</div>
                <div className="text-xs text-muted">
                  {sites.find((x) => x.id === s.siteId)?.name} · {dateFr(s.startedAt, intl)} · {s.userName}
                </div>
              </div>
              <span className="tabular text-sm text-muted">{Object.keys(s.counts).length}</span>
              <Badge tone={s.status === 'open' ? 'warn' : 'ok'}>{t(`inv.status.${s.status}`)}</Badge>
            </button>
          ))}
        </div>
      )}
      <Modal open={starting} onClose={() => setStarting(false)} title={t('inv.start')} size="sm" footer={<><Button onClick={() => setStarting(false)}>{t('common.cancel')}</Button><Button variant="primary" onClick={start}>{t('inv.start')}</Button></>}>
        <Field label={t('common.site')}>
          <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>
    </div>
  );
}

function CountScreen({ session, onBack }: { session: InventorySession; onBack: () => void }) {
  const { t, intl } = useI18n();
  const { toast } = useToast();
  const { user } = useAuth();
  const { orgId, wines, stock, sites, commit, path, can } = useOrg();
  const [counts, setCounts] = useState<Record<string, number>>(session.counts);
  const [q, setQ] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [zeroUncounted, setZeroUncounted] = useState(false);
  const closed = session.status === 'closed';
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Source de vérité synchrone : les lectures en rafale du scanner ne doivent pas repartir d'un état périmé.
  const countsRef = useRef(counts);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<{ seq: number; code: string; wine?: Wine; n?: number } | null>(null);
  const [scanTotal, setScanTotal] = useState(0);

  const persist = (next: Record<string, number>) => {
    countsRef.current = next;
    setCounts(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commit([{ op: 'set', path: path('inventories', session.id), data: { counts: next }, merge: true }]), 500);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const candidates = useMemo(() => {
    const live = wines.filter((w) => !w.isArchived);
    return live.filter((w) => qtyAt(stock, w.id, session.siteId) > 0 || counts[w.id] !== undefined);
  }, [wines, stock, session.siteId, counts]);

  const list = useMemo(() => {
    const terms = norm(q).split(' ').filter(Boolean);
    const base = terms.length ? wines.filter((w) => !w.isArchived && terms.every((x) => norm(`${w.producer} ${w.name} ${w.vintage} ${w.ean ?? ''}`).includes(x))) : candidates;
    return [...base].sort((a, b) => wineLabel(a).localeCompare(wineLabel(b))).slice(0, 80);
  }, [q, wines, candidates]);

  const bump = (w: Wine, d: number) => {
    const n = Math.max(0, (countsRef.current[w.id] ?? 0) + d);
    persist({ ...countsRef.current, [w.id]: n });
    return n;
  };
  const onEnter = () => {
    const exact = findWineByBarcode(wines, q.trim());
    if (exact) {
      bump(exact, 1);
      setQ('');
      toast(`+1 ${wineLabel(exact)}`);
    }
  };
  const onScan = (code: string): boolean => {
    const w = findWineByBarcode(wines, code);
    const n = w ? bump(w, 1) : undefined;
    setLastScan((p) => ({ seq: (p?.seq ?? 0) + 1, code, wine: w, n }));
    if (w) setScanTotal((x) => x + 1);
    return !!w;
  };
  const openScanner = () => {
    setLastScan(null);
    setScanTotal(0);
    setScanning(true);
  };

  const diffs = useMemo(
    () =>
      wines
        .filter((w) => !w.isArchived)
        .map((w) => {
          const expected = qtyAt(stock, w.id, session.siteId);
          const counted = counts[w.id] ?? (zeroUncounted && expected > 0 ? 0 : undefined);
          return { w, expected, counted, diff: counted === undefined ? 0 : counted - expected };
        })
        .filter((r) => r.counted !== undefined && r.diff !== 0),
    [wines, stock, counts, session.siteId, zeroUncounted],
  );

  const apply = async () => {
    if (!user) return;
    clearTimeout(timer.current);
    const ops = [
      ...buildMovementOps(orgId, diffs.map((d) => ({ wine: d.w, siteId: session.siteId, type: 'adjust' as const, qty: d.diff, reason: 'inventaire' as const, note: session.name })), { userId: user.uid, userName: user.name }),
      { op: 'set' as const, path: path('inventories', session.id), data: { counts, status: 'closed', closedAt: Date.now() }, merge: true },
    ];
    await commit(ops);
    toast(t('inv.applied', { n: diffs.length }));
    onBack();
  };

  return (
    <div>
      <PageHeader
        title={session.name}
        subtitle={`${sites.find((s) => s.id === session.siteId)?.name} · ${t('inv.counted', { n: Object.keys(counts).length })}`}
        actions={
          <>
            <Button onClick={onBack}>{t('common.back')}</Button>
            {!closed && (
              <Button variant="primary" icon={<Check className="size-4" />} onClick={() => setReviewing(true)}>
                {t('inv.review')}
              </Button>
            )}
          </>
        }
      />
      {!closed && (
        <div className="sticky top-14 z-20 -mx-1 mb-3 bg-bg/90 px-1 py-2 backdrop-blur">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onEnter()}
                placeholder={t('inv.scanHint')}
                inputMode="search"
                className="h-12 w-full rounded-xl border border-border bg-surface pl-11 pr-3 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <Button variant="primary" size="lg" className="rounded-xl px-4" icon={<ScanBarcode className="size-5" />} onClick={openScanner} aria-label={t('scan.open')} title={t('scan.open')}>
              <span className="hidden sm:inline">{t('scan.short')}</span>
            </Button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {list.map((w) => {
          const c = counts[w.id];
          const expected = qtyAt(stock, w.id, session.siteId);
          return (
            <Card key={w.id} className={cx('flex items-center gap-3 p-3', c !== undefined && (c === expected ? 'border-ok/40' : 'border-warn/50'))}>
              <span className={cx('size-3 shrink-0 rounded-full', COLOR_DOT[w.color])} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{w.name}</div>
                <div className="truncate text-xs text-muted">
                  {w.producer} · {w.vintage} · {t('inv.expected')} {expected}
                </div>
              </div>
              {closed ? (
                <span className="tabular text-lg font-semibold">{c ?? '—'}</span>
              ) : (
                <div className="flex items-center gap-1">
                  <button onClick={() => bump(w, -1)} className="grid size-10 place-items-center rounded-lg bg-surface-2 active:scale-95" aria-label="−1">
                    <Minus className="size-4" />
                  </button>
                  <input
                    value={c ?? ''}
                    inputMode="numeric"
                    placeholder="—"
                    onChange={(e) => persist({ ...countsRef.current, [w.id]: Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0) })}
                    className="tabular h-10 w-14 rounded-lg border border-border bg-surface text-center text-lg font-semibold focus:border-brand focus:outline-none"
                  />
                  <button onClick={() => bump(w, 1)} className="grid size-10 place-items-center rounded-lg bg-brand text-brand-fg active:scale-95" aria-label="+1">
                    <Plus className="size-4" />
                  </button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Scanner
        open={scanning}
        continuous
        onClose={() => setScanning(false)}
        onResult={onScan}
        feedback={
          lastScan && (
            <div key={lastScan.seq} className="animate-in mx-auto max-w-md space-y-1.5">
              {lastScan.wine ? (
                <div className="flex items-center gap-3 rounded-2xl bg-white/95 px-4 py-3 text-[#1c1517] shadow-lg">
                  <span className={cx('size-3 shrink-0 rounded-full', COLOR_DOT[lastScan.wine.color])} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6f655f]">{t('scan.last')}</div>
                    <div className="truncate text-sm font-semibold">{lastScan.wine.name}</div>
                    <div className="truncate text-xs text-[#6f655f]">
                      {lastScan.wine.producer} · {lastScan.wine.vintage}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tabular font-display text-3xl leading-none text-[#6b1f2e]">{lastScan.n}</div>
                    <div className="text-[10px] uppercase tracking-wider text-[#6f655f]">{t('scan.countedLabel')}</div>
                  </div>
                </div>
              ) : (
                <div role="alert" className="rounded-2xl border border-[#ff8a8a]/60 bg-[#3a1418]/90 px-4 py-3 text-sm text-[#ffd6d6]">
                  {t('scan.unknown', { code: lastScan.code })}
                </div>
              )}
              {scanTotal > 0 && <p className="text-center text-xs text-white/70">{t('scan.session', { n: scanTotal })}</p>}
            </div>
          )
        }
      />
      <Modal open={reviewing} onClose={() => setReviewing(false)} size="lg" title={t('inv.review')} footer={<><Button onClick={() => setReviewing(false)}>{t('common.back')}</Button>{can('sommelier') ? <Button variant="primary" onClick={apply} disabled={!diffs.length}>{t('inv.apply', { n: diffs.length })}</Button> : <span className="self-center text-xs text-muted">Validation des écarts par un responsable (sommelier ou direction).</span>}</>}>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={zeroUncounted} onChange={(e) => setZeroUncounted(e.target.checked)} />
          {t('inv.zeroUncounted')}
        </label>
        {diffs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t('inv.noDiff')}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('stock.wine')}</Th>
                <Th right>{t('inv.expected')}</Th>
                <Th right>{t('inv.countedShort')}</Th>
                <Th right>{t('inv.gap')}</Th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((d) => (
                <tr key={d.w.id}>
                  <Td className="max-w-64 truncate">{wineLabel(d.w)}</Td>
                  <Td right>{d.expected}</Td>
                  <Td right>{d.counted}</Td>
                  <Td right className={cx('font-semibold', d.diff < 0 ? 'text-bad' : 'text-ok')}>
                    {d.diff > 0 ? '+' : ''}
                    {d.diff}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Modal>
    </div>
  );
}
