import { useMemo, useRef, useState } from 'react';
import { Link2, ScanBarcode, Search } from 'lucide-react';
import type { Wine } from '@/types';
import { useOrg } from '@/app/org';
import { useT } from '@/i18n';
import { stockByWine } from '@/data/stock';
import { norm, wineLabel } from '@/lib/wine';
import { findWineByBarcode, sameBarcode } from '@/lib/barcode';
import { Button, cx, useToast } from '@/ui';
import { Scanner } from '@/components/Scanner';

/** Sélecteur de vin avec recherche multi-termes (nom, EAN…), stock en direct et lecture de code-barres. */
export function WinePicker({
  value,
  onChange,
  siteId = 'all',
  placeholder,
  autoFocus,
  onlyInStock,
  scannable = true,
}: {
  value?: string;
  onChange: (w: Wine) => void;
  siteId?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onlyInStock?: boolean;
  /** Bouton « Scanner » (caméra ou saisie du code-barres). */
  scannable?: boolean;
}) {
  const t = useT();
  const { toast } = useToast();
  const { wines, stock, can, commit, path } = useOrg();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkWine, setLinkWine] = useState<Wine | undefined>();
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const qty = useMemo(() => stockByWine(stock, siteId), [stock, siteId]);
  const current = wines.find((w) => w.id === value);
  const canLink = can('sommelier');

  const results = useMemo(() => {
    const terms = norm(q).split(' ').filter(Boolean);
    return wines
      .filter((w) => !w.isArchived && (!onlyInStock || (qty.get(w.id) ?? 0) > 0))
      .filter((w) => {
        if (!terms.length) return true;
        const hay = norm(`${w.producer} ${w.name} ${w.vintage} ${w.region ?? ''} ${w.grapes ?? ''} ${w.ean ?? ''}`);
        return terms.every((t) => hay.includes(t));
      })
      .slice(0, 8);
  }, [q, wines, onlyInStock, qty]);

  const pick = (w: Wine) => {
    onChange(w);
    setQ('');
    setOpen(false);
  };

  const closeUnknown = () => {
    setUnknown(null);
    setLinking(false);
    setLinkWine(undefined);
  };

  const onScan = (code: string) => {
    setScanning(false);
    const w = findWineByBarcode(wines.filter((x) => !x.isArchived), code);
    if (!w) {
      setUnknown(code);
      setLinking(false);
      setLinkWine(undefined);
      return;
    }
    closeUnknown();
    if (onlyInStock && (qty.get(w.id) ?? 0) <= 0) {
      toast(t('scan.notInStock', { wine: wineLabel(w) }), 'bad');
      return;
    }
    pick(w);
    toast(t('scan.matched', { wine: wineLabel(w) }));
  };

  const link = async () => {
    if (!unknown || !linkWine || !canLink) return;
    setBusy(true);
    try {
      await commit([{ op: 'set', path: path('wines', linkWine.id), data: { ean: unknown, updatedAt: Date.now() }, merge: true }]);
      toast(t('scan.associated', { wine: wineLabel(linkWine) }));
      const linked = { ...linkWine, ean: unknown };
      closeUnknown();
      if (!onlyInStock || (qty.get(linked.id) ?? 0) > 0) pick(linked);
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          ref={ref}
          autoFocus={autoFocus}
          value={open ? q : current ? wineLabel(current) : q}
          onFocus={() => {
            setOpen(true);
            setQ('');
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIdx((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && open && results[idx]) {
              e.preventDefault();
              pick(results[idx]);
            }
          }}
          placeholder={placeholder}
          className={cx('h-10 w-full rounded-lg border border-border bg-surface pl-9 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20', scannable ? 'pr-11' : 'pr-3')}
        />
        {scannable && (
          <button
            type="button"
            onClick={() => setScanning(true)}
            title={t('scan.open')}
            aria-label={t('scan.open')}
            className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted transition hover:bg-surface-2 hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
          >
            <ScanBarcode className="size-[18px]" />
          </button>
        )}
        {open && (
          <div className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl">
            {results.length === 0 && <div className="px-3 py-3 text-sm text-muted">—</div>}
            {results.map((w, i) => (
              <button
                type="button"
                key={w.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(w)}
                onMouseEnter={() => setIdx(i)}
                className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm', i === idx ? 'bg-brand-soft' : 'hover:bg-surface-2')}
              >
                <span className="min-w-0 flex-1 truncate">{wineLabel(w)}</span>
                <span className={cx('tabular text-xs', (qty.get(w.id) ?? 0) > 0 ? 'text-muted' : 'text-bad')}>{qty.get(w.id) ?? 0}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {unknown && (
        <div
          role="status"
          className="mt-2 rounded-xl border border-warn/40 bg-warn/8 p-3 text-sm"
          onClick={(e) => {
            // Évite que le <label> parent (Field) ne redonne le focus au champ principal.
            if (!(e.target as HTMLElement).closest('button,input,a')) e.preventDefault();
          }}
        >
          <p>{t('scan.unknown', { code: unknown })}</p>
          {!canLink ? (
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted">{t('scan.askManager')}</p>
              <Button size="sm" variant="ghost" onClick={closeUnknown}>
                {t('scan.dismiss')}
              </Button>
            </div>
          ) : linking ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-muted">{t('scan.associatePick', { code: unknown })}</p>
              <WinePicker value={linkWine?.id} onChange={setLinkWine} scannable={false} placeholder={t('common.search')} autoFocus />
              {linkWine?.ean && !sameBarcode(linkWine.ean, unknown) && <p className="text-xs text-warn">{t('scan.associateReplace', { code: linkWine.ean })}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" onClick={closeUnknown}>
                  {t('common.cancel')}
                </Button>
                <Button size="sm" variant="primary" icon={<Link2 className="size-3.5" />} disabled={!linkWine} loading={busy} onClick={link}>
                  {t('scan.associateConfirm')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={closeUnknown}>
                {t('scan.dismiss')}
              </Button>
              <Button size="sm" variant="primary" icon={<Link2 className="size-3.5" />} onClick={() => setLinking(true)}>
                {t('scan.associate')}
              </Button>
            </div>
          )}
        </div>
      )}
      {scannable && <Scanner open={scanning} onClose={() => setScanning(false)} onResult={onScan} />}
    </div>
  );
}
