import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowLeftRight, Award, Building2, Flame, GlassWater, Layers, Sparkles, TrendingUp } from 'lucide-react';
import type { Movement, Site, StockLevel, Wine } from '@/types';
import { useOrg } from '@/app/org';
import { maturityRisk } from '@/data/stock';
import { num } from '@/lib/utils';
import { wineLabel } from '@/lib/wine';
import { computeSiteActivity, computeVintageAnalytics } from '@/lib/vintageStats';
import { CHART, ChartFrame, ChartLegend, ChartTooltip, axisProps, compactNumber, cursorProps, gridProps } from '@/modules/pilotage/charts';
import { Badge, Button, Segmented, cx, useToast } from '@/ui';
import { COLOR_DOT } from '../Wines';
import { Panel, PanelLink } from './parts';

type AnalyticsTab = 'pyramid' | 'cohorts' | 'verticals' | 'risks';
type PyramidMetric = 'bottles' | 'value';
type PeriodDays = '30' | '90' | '365';

export function VintageAnalyticsPanel({
  wines,
  stock,
  movements,
  siteId,
  currency,
  intl,
  vatRate = 20,
  canSeeFinance = true,
  className,
}: {
  wines: Wine[];
  stock: StockLevel[];
  movements: Movement[];
  siteId: string | 'all';
  currency: string;
  intl: string;
  vatRate?: number;
  canSeeFinance?: boolean;
  className?: string;
}) {
  const [tab, setTab] = useState<AnalyticsTab>('pyramid');
  const [metric, setMetric] = useState<PyramidMetric>('bottles');
  const { commit, path, can } = useOrg();
  const { toast } = useToast();

  const f0 = (n: number) => new Intl.NumberFormat(intl, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  const enableByGlass = async (w: Wine) => {
    const baseMenu = w.menuPriceTTC ?? (w.sellPriceHT ? w.sellPriceHT * (1 + vatRate / 100) : (w.buyPriceHT ?? 25) * 3.2);
    const suggestedPrice = Math.max(8, Math.round(baseMenu / 5));
    try {
      await commit([
        {
          op: 'set',
          path: path('wines', w.id),
          data: {
            byGlass: { enabled: true, glassCl: 12.5, priceTTC: suggestedPrice },
            updatedAt: Date.now(),
          },
          merge: true,
        },
      ]);
      toast(`${wineLabel(w)} activé au verre (${suggestedPrice} € TTC / 12,5 cl)`, 'ok');
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  };

  const stats = useMemo(
    () => computeVintageAnalytics(wines, stock, movements, { siteId, vatRate, preferMenuPrice: true }),
    [wines, stock, movements, siteId, vatRate],
  );
  const risks = useMemo(
    () => maturityRisk(wines, stock, movements, { siteId, vatRate, horizonYears: 2 }),
    [wines, stock, movements, siteId, vatRate],
  );

  const chartData = useMemo(
    () =>
      stats.byVintage.map((r) => ({
        vintage: r.vintage,
        ready: r.readyBottles,
        aging: r.agingBottles,
        urgent: r.urgentBottles,
        costHT: r.costHT,
        marginHT: Math.max(0, r.marginHT),
        bottles: r.bottles,
        exits12m: r.exits12m,
      })),
    [stats.byVintage],
  );

  const tabs: { value: AnalyticsTab; label: string }[] = [
    { value: 'pyramid', label: 'Pyramide des millésimes' },
    ...(canSeeFinance ? [{ value: 'cohorts' as const, label: 'Rentabilité par âge' }] : []),
    { value: 'verticals', label: `Verticales (${stats.verticals.length})` },
    { value: 'risks', label: `À pousser (${risks.length})` },
  ];

  return (
    <Panel
      className={className}
      eyebrow="Analyse statistique pluriannuelle"
      title="Pyramide des millésimes, maturité & verticales"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<AnalyticsTab> value={tab} onChange={setTab} options={tabs} />
        </div>
      }
    >
      {/* Bandeau synthèse statistique du parc */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/70 bg-surface-2/40 p-3">
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted">Âge moyen du parc</div>
          <div className="mt-1 font-display text-2xl tabular">
            {stats.weightedAvgAge !== null ? `${stats.weightedAvgAge.toFixed(1).replace('.', ',')} ans` : '—'}
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {canSeeFinance && stats.valueWeightedAvgAge !== null
              ? `${stats.valueWeightedAvgAge.toFixed(1).replace('.', ',')} ans pondéré valeur · médiane ${stats.medianVintage ?? '—'}`
              : `Millésime médian : ${stats.medianVintage ?? '—'} (${stats.oldestVintage ?? '—'}–${stats.newestVintage ?? '—'})`}
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-surface-2/40 p-3">
          <div className="text-[11px] uppercase tracking-[0.12em] text-ok">Prêts à servir (Apogée)</div>
          <div className="mt-1 font-display text-2xl tabular text-ok">{stats.readySharePct} %</div>
          <div className="mt-0.5 text-xs text-muted">
            {num(stats.readyBottles, intl)} bout. dans leur fenêtre optimale
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-surface-2/40 p-3">
          <div className="text-[11px] uppercase tracking-[0.12em] text-brand">Patrimoine en garde</div>
          <div className="mt-1 font-display text-2xl tabular">{stats.agingSharePct} %</div>
          <div className="mt-0.5 text-xs text-muted">
            {num(stats.agingBottles, intl)} bout. en valorisation future
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-surface-2/40 p-3">
          <div className="text-[11px] uppercase tracking-[0.12em] text-warn">Fin d’apogée (À écouler)</div>
          <div className="mt-1 font-display text-2xl tabular text-warn">
            {num(stats.urgentBottles, intl)} <span className="text-sm font-normal text-muted">bout.</span>
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {canSeeFinance
              ? `${f0(stats.urgentCostHT)} HT immobilisés (${f0(stats.urgentMenuTTC)} carte TTC)`
              : `${stats.urgentSharePct} % du parc à mettre en avant`}
          </div>
        </div>
      </div>

      {/* ONGLET 1 : PYRAMIDE DES MILLÉSIMES */}
      {tab === 'pyramid' && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            {metric === 'bottles' ? (
              <ChartLegend
                items={[
                  { label: 'Prêt à servir (Apogée)', color: CHART.ok },
                  { label: 'En garde (Potentiel futur)', color: CHART.brand },
                  { label: 'Fin d’apogée (À pousser)', color: CHART.accent },
                ]}
              />
            ) : (
              <ChartLegend
                items={[
                  { label: 'Capital immobilisé (Achat HT)', color: CHART.brand },
                  { label: 'Marge latente Carte (HT)', color: CHART.ok },
                ]}
              />
            )}
            {canSeeFinance && (
              <Segmented<PyramidMetric>
                value={metric}
                onChange={setMetric}
                options={[
                  { value: 'bottles', label: 'Volumes & Maturité' },
                  { value: 'value', label: 'Capital HT & Marge' },
                ]}
              />
            )}
          </div>

          <ChartFrame
            className="h-60"
            label="Pyramide des millésimes"
            empty={chartData.length === 0}
            emptyTitle="Aucun millésime en stock"
            emptyHint="Ajoutez des références avec leur millésime pour visualiser la pyramide d'âge de la cave."
          >
            <ResponsiveContainer width="100%" height="100%">
              {metric === 'bottles' || !canSeeFinance ? (
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="vintage" {...axisProps} />
                  <YAxis {...axisProps} width={36} allowDecimals={false} />
                  <Tooltip
                    cursor={cursorProps}
                    content={(p) => (
                      <ChartTooltip
                        {...p}
                        formatValue={(v) => `${num(v, intl)} bout.`}
                        formatLabel={(l) => (l === 'NM' ? 'Non Millésimé (NM)' : `Millésime ${l}`)}
                      />
                    )}
                  />
                  <Bar isAnimationActive={false} dataKey="ready" stackId="m" name="Prêt à servir" fill={CHART.ok} maxBarSize={32} />
                  <Bar isAnimationActive={false} dataKey="aging" stackId="m" name="En garde" fill={CHART.brand} maxBarSize={32} />
                  <Bar isAnimationActive={false} dataKey="urgent" stackId="m" name="Fin d’apogée" fill={CHART.accent} radius={[3, 3, 0, 0]} maxBarSize={32} />
                </BarChart>
              ) : (
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="vintage" {...axisProps} />
                  <YAxis {...axisProps} width={48} tickFormatter={(v: number) => compactNumber(v, intl)} />
                  <Tooltip
                    cursor={cursorProps}
                    content={(p) => (
                      <ChartTooltip
                        {...p}
                        formatValue={(v) => f0(v)}
                        formatLabel={(l) => (l === 'NM' ? 'Non Millésimé (NM)' : `Millésime ${l}`)}
                      />
                    )}
                  />
                  <Bar isAnimationActive={false} dataKey="costHT" stackId="v" name="Achat HT" fill={CHART.brand} maxBarSize={32} />
                  <Bar isAnimationActive={false} dataKey="marginHT" stackId="v" name="Marge latente HT" fill={CHART.ok} radius={[3, 3, 0, 0]} maxBarSize={32} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </ChartFrame>

          {/* Tableau synthétique par millésime (rotation & couverture) */}
          <div className="mt-4 -mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.12em] text-muted">
                  <th className="py-2 pr-3 font-medium">Millésime</th>
                  <th className="py-2 pr-3 text-right font-medium">En cave</th>
                  <th className="py-2 pr-3 text-right font-medium">Sorties 12m</th>
                  <th className="py-2 pr-3 text-right font-medium">Couverture</th>
                  {canSeeFinance && <th className="py-2 pr-3 text-right font-medium">Immobilisé HT</th>}
                  {canSeeFinance && <th className="py-2 pr-3 text-right font-medium">Prix Carte moy.</th>}
                  {canSeeFinance && <th className="py-2 text-right font-medium">Marge / bout.</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {stats.byVintage.map((r) => (
                  <tr key={r.vintage} className="hover:bg-surface-2/40">
                    <td className="py-2 pr-3 font-medium">
                      <span className="font-display text-sm">{r.vintage}</span>
                      {r.age !== null && <span className="ml-1.5 text-muted">({r.age} ans)</span>}
                      {r.urgentBottles > 0 && (
                        <span className="ml-2 inline-flex items-center rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-medium text-warn">
                          {r.urgentBottles} à pousser
                        </span>
                      )}
                    </td>
                    <td className="tabular py-2 pr-3 text-right font-medium">
                      {num(r.bottles, intl)} <span className="text-muted">({r.refs} réf.)</span>
                    </td>
                    <td className="tabular py-2 pr-3 text-right">{num(r.exits12m, intl)} bout.</td>
                    <td className="tabular py-2 pr-3 text-right">
                      {r.coverageYears === null ? (
                        <span className="text-warn">Dormant</span>
                      ) : (
                        <span className={cx(r.coverageYears > 4 ? 'text-warn' : 'text-ink')}>
                          {r.coverageYears.toFixed(1).replace('.', ',')} an{r.coverageYears >= 2 ? 's' : ''}
                        </span>
                      )}
                    </td>
                    {canSeeFinance && <td className="tabular py-2 pr-3 text-right">{f0(r.costHT)}</td>}
                    {canSeeFinance && <td className="tabular py-2 pr-3 text-right">{f0(r.avgMenuPriceTTC)} TTC</td>}
                    {canSeeFinance && (
                      <td className="tabular py-2 text-right font-medium text-ok">
                        +{f0(r.avgUnitMarginHT)} HT
                        {r.marginRate !== null && <span className="ml-1 text-muted">({r.marginRate} %)</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ONGLET 2 : RENTABILITÉ PAR TRANCHE D'ÂGE (COHORTES) */}
      {tab === 'cohorts' && canSeeFinance && (
        <div className="space-y-4">
          <p className="text-xs text-muted">
            Analyse comparative de la contribution financière par maturité : les millésimes matures immobilisent du capital mais dégagent une marge unitaire en euros nettement supérieure par bouteille servie.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stats.cohorts.map((c) => (
              <div key={c.id} className="flex flex-col justify-between rounded-xl border border-border bg-surface-2/30 p-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-ink">{c.label}</span>
                    <Badge tone={c.id === 'heritage' ? 'warn' : c.id === 'prime' ? 'ok' : 'neutral'}>{c.shareValuePct} % valeur</Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">{c.subLabel}</p>
                </div>

                <div className="my-3 border-y border-border/60 py-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted">Marge moy. / bout.</span>
                    <span className="font-display text-xl font-semibold text-ok">+{f0(c.avgUnitMarginHT)} HT</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between text-xs">
                    <span className="text-muted">Prix carte moyen</span>
                    <span className="tabular font-medium">{f0(c.avgMenuPriceTTC)} TTC</span>
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted">En stock</span>
                    <span className="tabular font-medium">{num(c.bottles, intl)} bout. ({c.refs} réf.)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Capital Achat HT</span>
                    <span className="tabular font-medium">{f0(c.costHT)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Marge latente HT</span>
                    <span className="tabular font-medium text-ok">
                      +{f0(c.marginHT)} {c.marginRate !== null && `(${c.marginRate} %)`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Taux de rotation annuel</span>
                    <span className="tabular font-medium">{c.rotationPct !== null ? `${c.rotationPct} % (${c.exits12m} sorties)` : '—'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ONGLET 3 : VERTICALES PRESTIGE DÉTECTÉES */}
      {tab === 'verticals' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted">
              Cuvées présentes sur <strong>3 millésimes ou plus</strong> en cave — idéales pour proposer des dégustations verticales à forte valeur ajoutée sur la carte gastronomique ou au caveau.
            </p>
          </div>
          {stats.verticals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
              Aucune verticale (≥ 3 millésimes d’une même cuvée en stock) détectée sur ce périmètre.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {stats.verticals.map((v) => (
                <div key={v.key} className="rounded-xl border border-border bg-surface-2/30 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cx('size-2.5 shrink-0 rounded-full', COLOR_DOT[v.color])} aria-hidden />
                        <span className="truncate text-xs uppercase tracking-[0.12em] text-muted">{v.producer}</span>
                      </div>
                      <h4 className="mt-0.5 truncate font-display text-lg font-medium text-ink">{v.name}</h4>
                      <p className="text-xs text-muted">
                        {[v.appellation, v.region].filter(Boolean).join(' · ')} — <strong>{v.vintages.length} millésimes ({v.vintageSpan})</strong>
                      </p>
                    </div>
                    <Badge tone="ok">
                      <Award className="mr-1 inline size-3" />
                      {v.completeFlights} verticale{v.completeFlights > 1 ? 's' : ''} complète{v.completeFlights > 1 ? 's' : ''}
                    </Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {v.vintages.map((item) => (
                      <Link
                        key={item.wineId}
                        to={`/vins?open=${item.wineId}`}
                        className={cx(
                          'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition hover:border-brand',
                          item.maturity === 'urgent'
                            ? 'border-warn/40 bg-warn/10 text-warn'
                            : item.maturity === 'ready'
                              ? 'border-ok/40 bg-ok/10 text-ink'
                              : 'border-border bg-surface text-ink',
                        )}
                      >
                        <span className="font-semibold tabular">{item.vintage}</span>
                        <span className="text-muted">·</span>
                        <span className="tabular">{item.qty} btl</span>
                        {canSeeFinance && item.menuPriceTTC > 0 && (
                          <span className="text-[10px] text-muted">({f0(item.menuPriceTTC)})</span>
                        )}
                      </Link>
                    ))}
                  </div>

                  {canSeeFinance && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-xs">
                      <span className="text-muted">
                        Valeur 1 verticale ({v.vintages.length} btl) : <strong className="text-ink">{f0(v.flightMenuTTC)} TTC</strong>
                      </span>
                      <span className="font-medium text-ok">
                        Marge nette : +{f0(v.flightMarginHT)} HT
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ONGLET 4 : PRIORITÉS D'ÉCOULEMENT (APOGÉE × VÉLOCITÉ) */}
      {tab === 'risks' && (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Croisement entre la <strong>fin de fenêtre d’apogée</strong> et le <strong>rythme réel de sortie sur 12 mois</strong> : ces références risquent de dépasser leur apogée avant épuisement du stock si elles ne sont pas poussées au verre ou épinglées par les sommeliers.
          </p>
          {risks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-ok">
              Toutes les références proches de leur fin d’apogée s’écoulent à un rythme suffisant.
            </div>
          ) : (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[640px] text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.12em] text-muted">
                    <th className="py-2 pr-3 font-medium">Référence &amp; Millésime</th>
                    <th className="py-2 pr-3 text-right font-medium">Stock</th>
                    <th className="py-2 pr-3 text-right font-medium">Fin d’apogée</th>
                    <th className="py-2 pr-3 text-right font-medium">Sorties 12m</th>
                    <th className="py-2 pr-3 text-right font-medium">Durée d’écoulement</th>
                    {canSeeFinance && <th className="py-2 pr-3 text-right font-medium">Capital HT</th>}
                    <th className="py-2 text-right font-medium">Recommandation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {risks.slice(0, 10).map((r) => (
                    <tr key={r.wine.id} className="hover:bg-surface-2/40">
                      <td className="py-2.5 pr-3">
                        <Link to={`/vins?open=${r.wine.id}`} className="flex items-center gap-2 font-medium hover:text-brand">
                          <span className={cx('size-2.5 shrink-0 rounded-full', COLOR_DOT[r.wine.color])} aria-hidden />
                          <span className="truncate">{wineLabel(r.wine)}</span>
                        </Link>
                      </td>
                      <td className="tabular py-2.5 pr-3 text-right font-semibold">{r.qty} btl</td>
                      <td className="tabular py-2.5 pr-3 text-right">
                        <span className={cx('font-medium', r.yearsLeft < 0 ? 'text-bad' : 'text-warn')}>
                          {r.apogeeTo} ({r.yearsLeft < 0 ? `dépassée de ${Math.abs(r.yearsLeft)} an` : r.yearsLeft === 0 ? 'cette année' : `J-${r.yearsLeft} an`})
                        </span>
                      </td>
                      <td className="tabular py-2.5 pr-3 text-right">{r.annualOut} btl/an</td>
                      <td className="tabular py-2.5 pr-3 text-right">
                        {r.yearsToClear === null ? (
                          <span className="font-medium text-bad">Aucune sortie (∞)</span>
                        ) : (
                          <span>{r.yearsToClear.toFixed(1).replace('.', ',')} ans</span>
                        )}
                      </td>
                      {canSeeFinance && <td className="tabular py-2.5 pr-3 text-right font-medium">{f0(r.costValueHT)}</td>}
                      <td className="py-2.5 text-right">
                        {r.wine.byGlass?.enabled ? (
                          <Link
                            to="/service?tab=verre"
                            className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand hover:bg-brand/20"
                          >
                            <GlassWater className="size-3" />
                            <span>Au verre {r.wine.byGlass.priceTTC ? `(${r.wine.byGlass.priceTTC} €)` : ''} · Servir →</span>
                          </Link>
                        ) : can('sommelier') ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void enableByGlass(r.wine)}
                            icon={<GlassWater className="size-3.5 text-brand" />}
                            title="Activer le service au verre (12,5 cl) avec tarif conseillé automatique"
                          >
                            Passer au verre ({Math.max(8, Math.round((r.wine.menuPriceTTC ?? (r.wine.buyPriceHT ?? 25) * 3.2) / 5))} €)
                          </Button>
                        ) : (
                          <Badge tone={r.urgency === 'past' ? 'bad' : 'warn'}>
                            <Flame className="mr-1 inline size-3" />
                            À pousser au verre
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

/**
 * Panneau de consolidation multi-sites pour Hôtels-Restaurants, Palaces & Domaines (ex. Cave de garde, Table Gastro, Bistrot, Bar).
 */
export function MultiSiteConsolidationPanel({
  sites,
  wines,
  stock,
  movements,
  activeSiteId,
  onSelectSite,
  currency,
  intl,
  vatRate = 20,
  canSeeFinance = true,
  className,
}: {
  sites: Site[];
  wines: Wine[];
  stock: StockLevel[];
  movements: Movement[];
  activeSiteId: string | 'all';
  onSelectSite: (siteId: string) => void;
  currency: string;
  intl: string;
  vatRate?: number;
  canSeeFinance?: boolean;
  className?: string;
}) {
  const [days, setDays] = useState<PeriodDays>('365');
  const f0 = (n: number) => new Intl.NumberFormat(intl, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

  const rows = useMemo(
    () => computeSiteActivity(sites, wines, stock, movements, { days: Number(days), vatRate }),
    [sites, wines, stock, movements, days, vatRate],
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          stockBottles: acc.stockBottles + r.stockBottles,
          stockCostHT: acc.stockCostHT + r.stockCostHT,
          stockMenuTTC: acc.stockMenuTTC + r.stockMenuTTC,
          servedBottles: acc.servedBottles + r.servedBottles,
          glassBottles: acc.glassBottles + r.glassBottles,
          lossBottles: acc.lossBottles + r.lossBottles,
          revenueHT: acc.revenueHT + r.revenueHT,
          cogsHT: acc.cogsHT + r.cogsHT,
          marginHT: acc.marginHT + r.marginHT,
        }),
        { stockBottles: 0, stockCostHT: 0, stockMenuTTC: 0, servedBottles: 0, glassBottles: 0, lossBottles: 0, revenueHT: 0, cogsHT: 0, marginHT: 0 },
      ),
    [rows],
  );

  if (sites.length <= 1) return null;

  return (
    <Panel
      className={className}
      eyebrow="Consolidation multi-caves & points de vente"
      title={`Performance & flux par espace (${rows.length} sites)`}
      action={
        <div className="flex items-center gap-2">
          {activeSiteId !== 'all' && (
            <button
              type="button"
              onClick={() => onSelectSite('all')}
              className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-brand hover:bg-surface-2"
            >
              Voir tous les sites
            </button>
          )}
          <Segmented<PeriodDays>
            value={days}
            onChange={setDays}
            options={[
              { value: '30', label: '30 j' },
              { value: '90', label: '90 j' },
              { value: '365', label: '12 mois' },
            ]}
          />
        </div>
      }
    >
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[720px] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.12em] text-muted">
              <th className="py-2 pr-3 font-medium">Point de vente / Cave</th>
              <th className="py-2 pr-3 text-right font-medium">Stock actuel</th>
              {canSeeFinance && <th className="py-2 pr-3 text-right font-medium">Immobilisé HT</th>}
              <th className="py-2 pr-3 text-right font-medium">Sorties servies</th>
              <th className="py-2 pr-3 text-right font-medium">Transferts internes</th>
              <th className="py-2 pr-3 text-right font-medium">Pertes / Offerts</th>
              {canSeeFinance && <th className="py-2 pr-3 text-right font-medium">CA Carte HT est.</th>}
              {canSeeFinance && <th className="py-2 text-right font-medium">Marge HT &amp; Coût matière</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((r) => {
              const isSelected = activeSiteId === r.site.id;
              return (
                <tr key={r.site.id} className={cx('transition hover:bg-surface-2/40', isSelected && 'bg-brand-soft/25')}>
                  <td className="py-2.5 pr-3">
                    <button
                      type="button"
                      onClick={() => onSelectSite(isSelected ? 'all' : r.site.id)}
                      className="flex items-center gap-2 text-left font-medium hover:text-brand"
                    >
                      <Building2 className="size-3.5 shrink-0 text-muted" aria-hidden />
                      <span>{r.site.name}</span>
                      {isSelected && <Badge tone="ok">Filtre actif</Badge>}
                    </button>
                  </td>
                  <td className="tabular py-2.5 pr-3 text-right">
                    <span className="font-semibold">{num(r.stockBottles, intl)}</span>{' '}
                    <span className="text-muted">btl ({r.stockRefs} réf.)</span>
                  </td>
                  {canSeeFinance && <td className="tabular py-2.5 pr-3 text-right font-medium">{f0(r.stockCostHT)}</td>}
                  <td className="tabular py-2.5 pr-3 text-right">
                    <span className="font-semibold text-ink">{num(r.servedBottles, intl)} btl</span>
                    {r.glassBottles > 0 && <span className="ml-1 text-muted">(dont {r.glassBottles} verre)</span>}
                  </td>
                  <td className="tabular py-2.5 pr-3 text-right">
                    {r.transfersIn > 0 || r.transfersOut > 0 ? (
                      <span className="inline-flex items-center gap-1 text-muted">
                        <ArrowLeftRight className="size-3" />
                        {r.transfersIn > 0 && <span className="text-ok">+{r.transfersIn}</span>}
                        {r.transfersOut > 0 && <span className="text-warn">-{r.transfersOut}</span>}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="tabular py-2.5 pr-3 text-right">
                    {r.lossBottles > 0 ? (
                      <span className="text-warn">
                        {r.lossBottles} btl {canSeeFinance && `(${f0(r.lossCostHT)})`}
                      </span>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </td>
                  {canSeeFinance && <td className="tabular py-2.5 pr-3 text-right font-medium">{f0(r.revenueHT)}</td>}
                  {canSeeFinance && (
                    <td className="tabular py-2.5 text-right">
                      {r.revenueHT > 0 ? (
                        <div>
                          <span className="font-semibold text-ok">+{f0(r.marginHT)}</span>
                          <span className="ml-1.5 text-muted">(Ratio {r.costRatioPct} %)</span>
                        </div>
                      ) : (
                        <span className="text-muted">Cave de stockage</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-surface-2/30 font-semibold">
              <td className="py-2.5 pr-3 font-display text-sm">Consolidé Établissement</td>
              <td className="tabular py-2.5 pr-3 text-right">{num(totals.stockBottles, intl)} btl</td>
              {canSeeFinance && <td className="tabular py-2.5 pr-3 text-right">{f0(totals.stockCostHT)}</td>}
              <td className="tabular py-2.5 pr-3 text-right">{num(totals.servedBottles, intl)} btl</td>
              <td className="py-2.5 pr-3 text-right text-muted">Équilibré</td>
              <td className="tabular py-2.5 pr-3 text-right">{num(totals.lossBottles, intl)} btl</td>
              {canSeeFinance && <td className="tabular py-2.5 pr-3 text-right">{f0(totals.revenueHT)}</td>}
              {canSeeFinance && (
                <td className="tabular py-2.5 text-right text-ok">
                  +{f0(totals.marginHT)}
                  {totals.revenueHT > 0 && (
                    <span className="ml-1.5 font-normal text-muted">
                      (Ratio {Math.round((totals.cogsHT / totals.revenueHT) * 1000) / 10} %)
                    </span>
                  )}
                </td>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </Panel>
  );
}
