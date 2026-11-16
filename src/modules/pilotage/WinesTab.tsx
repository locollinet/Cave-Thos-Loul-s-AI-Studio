import { useMemo, useState } from 'react';
import { ExternalLink, Flame, Layers, TrendingDown, TrendingUp } from 'lucide-react';
import type { Wine, WineColor } from '@/types';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { dateFr, eur, pct, today } from '@/lib/utils';
import { norm } from '@/lib/wine';
import { Badge, Button, Card, SearchInput, Segmented, Select, cx } from '@/ui';
import { COLOR_DOT } from '@/pages/Wines';
import { WineDrawer } from '@/pages/wines/WineDrawer';
import { abcAnalysis, dormantWines, rankWines } from './kpis';
import type { AbcClass, WinePerf } from './types';
import type { PilotageView } from './usePilotage';

type FocusView = 'top' | 'flop' | 'abc' | 'dormant';
type DormantFilter = 'all' | 'idle' | 'reserve';

export default function WinesTab({ view }: { view: PilotageView }) {
  const { t, intl } = useI18n();
  const { org, wines } = useOrg();
  const f = (n: number) => eur(n, org.currency, intl);

  const [focus, setFocus] = useState<FocusView>('top');
  const [q, setQ] = useState('');
  const [color, setColor] = useState<WineColor | 'all'>('all');
  const [region, setRegion] = useState<string>('all');
  const [abcClass, setAbcClass] = useState<AbcClass | 'all'>('all');
  const [dormantMonths, setDormantMonths] = useState<3 | 6 | 12>(3);
  const [dormantFilter, setDormantFilter] = useState<DormantFilter>('all');
  const [openWineId, setOpenWineId] = useState<string | null>(null);

  const winesById = useMemo(() => new Map(wines.map((w) => [w.id, w])), [wines]);
  const regions = useMemo(
    () =>
      [...new Set(wines.filter((w) => !w.isArchived && w.region).map((w) => w.region!))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [wines],
  );

  const matchesWineMeta = (wineId: string, fallbackLabel: string): boolean => {
    const w = winesById.get(wineId);
    if (color !== 'all' && w?.color !== color) return false;
    if (region !== 'all' && (w?.region ?? '') !== region) return false;
    if (q.trim()) {
      const needle = norm(q);
      const hay = norm(
        w ? `${w.producer} ${w.name} ${w.appellation ?? ''} ${w.region ?? ''} ${w.vintage}` : fallbackLabel,
      );
      if (!hay.includes(needle)) return false;
    }
    return true;
  };

  // 1. Performances filtrées par couleur / région / recherche
  const filteredPerfs = useMemo(
    () => view.perfs.filter((p) => matchesWineMeta(p.wineId, p.label)),
    [view.perfs, color, region, q, winesById], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Top ventes (par marge) & Sous-performants (en stock disponibles qui tournent peu)
  const ranked = useMemo(() => {
    const top = rankWines(filteredPerfs, 20).top;
    const flop = [...filteredPerfs]
      .filter((p) => p.stock > 0)
      .sort((a, b) => a.qty - b.qty || a.margin - b.margin || b.stock - a.stock)
      .slice(0, 20);
    return { top, flop };
  }, [filteredPerfs]);

  // 2. Pareto ABC filtré
  const abcRows = useMemo(() => {
    const base = abcAnalysis(filteredPerfs);
    return abcClass === 'all' ? base : base.filter((r) => r.cls === abcClass);
  }, [filteredPerfs, abcClass]);

  // 3. Stock dormant recalculé selon le seuil choisi (3 / 6 / 12 mois) + filtres
  const dormantAll = useMemo(() => {
    const base =
      dormantMonths === 3
        ? view.dormant
        : dormantWines({
            wines: view.input.wines,
            stock: view.input.stock,
            movements: view.input.movements,
            siteId: view.input.siteId,
            asOf: today(),
            days: dormantMonths * 30,
          });
    return base.filter((r) => matchesWineMeta(r.wineId, r.label));
  }, [dormantMonths, view.dormant, view.input, color, region, q, winesById]); // eslint-disable-line react-hooks/exhaustive-deps

  const dormantIdle = useMemo(() => dormantAll.filter((r) => !r.isAgingReserve), [dormantAll]);
  const dormantReserve = useMemo(() => dormantAll.filter((r) => r.isAgingReserve), [dormantAll]);
  const dormantShown =
    dormantFilter === 'idle' ? dormantIdle : dormantFilter === 'reserve' ? dormantReserve : dormantAll;

  const idleCost = dormantIdle.reduce((s, r) => s + r.costValue, 0);
  const idleBtl = dormantIdle.reduce((s, r) => s + r.stock, 0);
  const reserveCost = dormantReserve.reduce((s, r) => s + r.costValue, 0);
  const reserveBtl = dormantReserve.reduce((s, r) => s + r.stock, 0);

  const hasFilters = Boolean(q.trim() || color !== 'all' || region !== 'all');
  const openWine = openWineId ? winesById.get(openWineId) : undefined;

  return (
    <div className="space-y-4">
      {/* 1. BARRE DE FILTRES MÉTIER (DG & CHEF SOMMELIER) */}
      <Card className="p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
            <div className="w-full sm:w-64">
              <SearchInput
                value={q}
                onChange={setQ}
                placeholder="Domaine, cuvée, millésime..."
              />
            </div>

            <Select
              aria-label="Filtrer par couleur"
              value={color}
              onChange={(e) => setColor(e.target.value as WineColor | 'all')}
              className="w-36 text-xs"
            >
              <option value="all">Toutes couleurs</option>
              <option value="rouge">Rouge</option>
              <option value="blanc">Blanc</option>
              <option value="bulles">Bulles</option>
              <option value="rose">Rosé</option>
              <option value="orange">Orange</option>
              <option value="doux">Doux</option>
            </Select>

            <Select
              aria-label="Filtrer par région"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-44 text-xs"
            >
              <option value="all">Toutes régions</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>

            {hasFilters && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setQ('');
                  setColor('all');
                  setRegion('all');
                }}
              >
                Réinitialiser
              </Button>
            )}
          </div>
        </div>

        {/* Sélecteur de vue métier (remplace les 4 gros tableaux empilés / écrasés) */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/60">
          {(
            [
              { id: 'top', label: 'Top Rentabilité', icon: TrendingUp, count: ranked.top.length },
              { id: 'flop', label: 'Rotation faible (en stock)', icon: TrendingDown, count: ranked.flop.length },
              { id: 'abc', label: 'Pareto ABC', icon: Layers, count: abcRows.length },
              { id: 'dormant', label: 'Trésorerie dormante', icon: Flame, count: dormantIdle.length },
            ] as const
          ).map((item) => {
            const active = focus === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFocus(item.id)}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition cursor-pointer',
                  active
                    ? 'border-brand bg-brand text-brand-fg shadow-xs'
                    : 'border-border bg-surface-2/50 text-muted hover:text-ink hover:border-brand/40',
                )}
              >
                <item.icon className="size-3.5" />
                <span>{item.label}</span>
                <span
                  className={cx(
                    'rounded-md px-1.5 py-0.5 font-mono text-[10px]',
                    active ? 'bg-black/25 text-white' : 'bg-surface text-ink',
                  )}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* 2. VUE TOP RENTABILITÉ OU ROTATION FAIBLE (PLEINE LARGEUR, ZERO SCROLL HORIZONTAL) */}
      {(focus === 'top' || focus === 'flop') && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border bg-surface-2/40 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-ink">
                {focus === 'top'
                  ? 'Top cuvées génératrices de marge'
                  : 'Cuvées disponibles en cave à faible rotation'}
              </h2>
              <p className="text-xs text-muted">
                {focus === 'top'
                  ? 'Classement par marge brute HT générée sur la période — cliquez sur une cuvée pour ouvrir sa fiche.'
                  : 'Vins actuellement en stock (stock > 0) qui se vendent le moins : candidats à la mise en avant au verre ou en suggestion.'}
              </p>
            </div>
          </div>

          <PerfTableFull
            rows={focus === 'top' ? ranked.top : ranked.flop}
            winesById={winesById}
            empty={t('pilotage.noSales')}
            formatMoney={f}
            onOpenWine={setOpenWineId}
          />
        </Card>
      )}

      {/* 3. VUE PARETO ABC */}
      {focus === 'abc' && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border bg-surface-2/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-ink">{t('pilotage.abc')}</h2>
              <p className="text-xs text-muted">{t('pilotage.abcHint')}</p>
            </div>
            <Segmented<AbcClass | 'all'>
              value={abcClass}
              onChange={setAbcClass}
              options={[
                { value: 'all', label: 'Toutes' },
                { value: 'A', label: 'Classe A (80 %)' },
                { value: 'B', label: 'Classe B (15 %)' },
                { value: 'C', label: 'Classe C (5 %)' },
              ]}
            />
          </div>

          {abcRows.length === 0 ? (
            <p className="p-6 text-sm text-muted">{t('pilotage.noSales')}</p>
          ) : (
            <table className="w-full table-fixed text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2/30 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  <th className="py-2.5 pl-4 pr-2 text-left w-16">Classe</th>
                  <th className="py-2.5 px-2 text-left">Cuvée</th>
                  <th className="py-2.5 px-2 text-right w-16 hidden sm:table-cell">Qté</th>
                  <th className="py-2.5 px-2 text-right w-28">Marge brute</th>
                  <th className="py-2.5 pl-2 pr-4 text-right w-24">Cumul</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {abcRows.map((r) => {
                  const w = winesById.get(r.wineId);
                  return (
                    <tr
                      key={r.wineId}
                      onClick={() => setOpenWineId(r.wineId)}
                      className="cursor-pointer hover:bg-surface-2/50 transition"
                    >
                      <td className="py-2.5 pl-4 pr-2">
                        <Badge tone={r.cls === 'A' ? 'ok' : r.cls === 'B' ? 'warn' : 'neutral'}>{r.cls}</Badge>
                      </td>
                      <td className="py-2.5 px-2 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {w && <span className={cx('size-2 rounded-full shrink-0', COLOR_DOT[w.color])} />}
                          <span className="truncate font-medium text-ink" title={r.label}>
                            {r.label}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-muted hidden sm:table-cell">{r.qty}</td>
                      <td className="py-2.5 px-2 text-right font-mono font-semibold text-ink">{f(r.margin)}</td>
                      <td className="py-2.5 pl-2 pr-4 text-right font-mono text-muted">{r.cumulPct} %</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* 4. VUE TRÉSORERIE DORMANTE (VINS ARRIVÉS DEPUIS LONGTEMPS SANS SE VENDRE) */}
      {focus === 'dormant' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setDormantFilter(dormantFilter === 'idle' ? 'all' : 'idle')}
              className={cx(
                'text-left rounded-xl border p-4 transition cursor-pointer',
                dormantFilter === 'idle'
                  ? 'border-amber-500 bg-amber-500/15 ring-1 ring-amber-500/40'
                  : 'border-amber-500/35 bg-amber-500/10 hover:border-amber-500/70',
              )}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                À déstocker — Prêts à boire qui dorment
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-2xl font-semibold text-ink tabular">{f(idleCost)}</span>
                <span className="text-xs text-muted">
                  HT immobilisés · {idleBtl} btl ({dormantIdle.length} réf.)
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setDormantFilter(dormantFilter === 'reserve' ? 'all' : 'reserve')}
              className={cx(
                'text-left rounded-xl border p-4 transition cursor-pointer',
                dormantFilter === 'reserve'
                  ? 'border-brand bg-brand-soft/40 ring-1 ring-brand/30'
                  : 'border-border bg-surface-2/40 hover:border-brand/40',
              )}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Garde voulue — Apogée pas encore atteinte
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-2xl font-semibold text-ink tabular">{f(reserveCost)}</span>
                <span className="text-xs text-muted">
                  HT en vieillissement · {reserveBtl} btl ({dormantReserve.length} réf.)
                </span>
              </div>
            </button>
          </div>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-border bg-surface-2/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-ink">
                  Vins arrivés depuis longtemps sans se vendre
                </h2>
                <p className="text-xs text-muted">
                  Flacons entrés en cave depuis au moins {dormantMonths} mois sans aucune sortie récente.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented<'3' | '6' | '12'>
                  value={String(dormantMonths) as '3' | '6' | '12'}
                  onChange={(v) => setDormantMonths(Number(v) as 3 | 6 | 12)}
                  options={[
                    { value: '3', label: '> 3 mois' },
                    { value: '6', label: '> 6 mois' },
                    { value: '12', label: '> 12 mois' },
                  ]}
                />
                <Segmented<DormantFilter>
                  value={dormantFilter}
                  onChange={setDormantFilter}
                  options={[
                    { value: 'all', label: 'Tous' },
                    { value: 'idle', label: 'À déstocker' },
                    { value: 'reserve', label: 'Garde voulue' },
                  ]}
                />
              </div>
            </div>

            {dormantShown.length === 0 ? (
              <p className="p-6 text-sm text-muted">{t('pilotage.noDormant')}</p>
            ) : (
              <table className="w-full table-fixed text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2/30 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    <th className="py-2.5 pl-4 pr-2 text-left">Cuvée</th>
                    <th className="py-2.5 px-2 text-left w-36 hidden md:table-cell">Arrivé en cave</th>
                    <th className="py-2.5 px-2 text-left w-32 hidden sm:table-cell">Ventes / Sorties</th>
                    <th className="py-2.5 px-2 text-left w-32">Statut</th>
                    <th className="py-2.5 px-2 text-right w-14">Stock</th>
                    <th className="py-2.5 pl-2 pr-4 text-right w-28">Valeur HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {dormantShown.map((r) => {
                    const w = winesById.get(r.wineId);
                    const monthsHeld = r.holdingDays != null ? Math.max(1, Math.round(r.holdingDays / 30)) : null;
                    return (
                      <tr
                        key={r.wineId}
                        onClick={() => setOpenWineId(r.wineId)}
                        className="cursor-pointer hover:bg-surface-2/50 transition"
                      >
                        <td className="py-2.5 pl-4 pr-2 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            {w && <span className={cx('size-2 rounded-full shrink-0', COLOR_DOT[w.color])} />}
                            <span className="truncate font-medium text-ink" title={r.label}>
                              {r.label}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-xs text-muted hidden md:table-cell truncate">
                          {r.firstIn ? `${dateFr(r.firstIn, intl)} · ` : ''}
                          <span className="font-semibold text-ink">
                            {monthsHeld !== null ? `${monthsHeld} mois` : '—'}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 hidden sm:table-cell">
                          {r.lastOut ? (
                            <span className="text-xs text-muted">
                              {dateFr(r.lastOut, intl)}
                            </span>
                          ) : (
                            <Badge tone="bad">Jamais vendu</Badge>
                          )}
                        </td>
                        <td className="py-2.5 px-2">
                          {r.isAgingReserve ? (
                            <Badge tone="neutral">Garde · {r.apogeeFrom}</Badge>
                          ) : (
                            <Badge tone="warn">À déstocker</Badge>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono">{r.stock}</td>
                        <td className="py-2.5 pl-2 pr-4 text-right font-mono font-semibold text-ink">
                          {f(r.costValue)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}

      {openWine && <WineDrawer wine={openWine} onClose={() => setOpenWineId(null)} />}
    </div>
  );
}

function PerfTableFull({
  rows,
  winesById,
  empty,
  formatMoney,
  onOpenWine,
}: {
  rows: WinePerf[];
  winesById: Map<string, Wine>;
  empty: string;
  formatMoney: (n: number) => string;
  onOpenWine: (wineId: string) => void;
}) {
  const { t } = useI18n();
  if (!rows.length) return <p className="p-6 text-sm text-muted">{empty}</p>;

  return (
    <table className="w-full table-fixed text-xs sm:text-sm">
      <thead>
        <tr className="border-b border-border bg-surface-2/30 text-[10px] font-semibold uppercase tracking-wider text-muted">
          <th className="py-2.5 pl-4 pr-2 text-left">{t('pilotage.wine')}</th>
          <th className="py-2.5 px-2 text-left w-32 hidden md:table-cell">Région</th>
          <th className="py-2.5 px-2 text-right w-14">{t('common.qty')}</th>
          <th className="py-2.5 px-2 text-right w-24 hidden sm:table-cell">{t('pilotage.kpi.revenue')}</th>
          <th className="py-2.5 px-2 text-right w-24">{t('pilotage.kpi.margin')}</th>
          <th className="py-2.5 px-2 text-right w-16 hidden lg:table-cell">Taux</th>
          <th className="py-2.5 pl-2 pr-4 text-right w-16">{t('pilotage.stock')}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/60">
        {rows.map((r) => {
          const w = winesById.get(r.wineId);
          const markRate = r.revenueHT > 0 ? (r.margin / r.revenueHT) * 100 : null;
          return (
            <tr
              key={r.wineId}
              onClick={() => onOpenWine(r.wineId)}
              className="group cursor-pointer hover:bg-surface-2/50 transition"
            >
              <td className="py-2.5 pl-4 pr-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  {w && <span className={cx('size-2 rounded-full shrink-0', COLOR_DOT[w.color])} />}
                  <span className="truncate font-medium text-ink group-hover:text-brand" title={r.label}>
                    {r.label}
                  </span>
                  <ExternalLink className="size-3 shrink-0 text-muted opacity-0 group-hover:opacity-100 transition" />
                </div>
              </td>
              <td className="py-2.5 px-2 text-xs text-muted truncate hidden md:table-cell">
                {w?.region || '—'}
              </td>
              <td className="py-2.5 px-2 text-right font-mono">{r.qty}</td>
              <td className="py-2.5 px-2 text-right font-mono hidden sm:table-cell">{formatMoney(r.revenueHT)}</td>
              <td className={cx('py-2.5 px-2 text-right font-mono font-semibold', r.margin < 0 ? 'text-bad' : 'text-ink')}>
                {formatMoney(r.margin)}
              </td>
              <td className="py-2.5 px-2 text-right font-mono text-xs text-muted hidden lg:table-cell">
                {markRate === null ? '—' : pct(markRate)}
              </td>
              <td className={cx('py-2.5 pl-2 pr-4 text-right font-mono font-semibold', r.stock <= 2 ? 'text-bad' : 'text-ink')}>
                {r.stock}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
