import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Eye, EyeOff, FileText, PackageCheck, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { useCollection, useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Badge, Button, Card, Field, Input, NumberInput, Select, cx, useToast } from '@/ui';
import type { PurchaseInvoice, Wine, WineColor } from '@/types';
import { WINE_COLORS } from '@/types';
import { findMatches, norm, wineLabel } from '@/lib/wine';
import { eur, pct, round2 } from '@/lib/utils';
import { computeWeightedAverageCost, stockByWine } from '@/data/stock';
import { checkTotals, emptyLine, findDuplicate, priceHistory } from './logic';
import { buildInvoiceOps, draftTotals, isReceivable } from './receive';
import type { InvoiceDraft, ReviewLine } from './types';
import { TotalsBox } from './TotalsBox';
import { WinePicker } from './WinePicker';
import { InvoicePdfPreview } from './InvoicePdfPreview';

const FORMATS = [37.5, 75, 150, 300];
const CREATE = '__create';
const SKIP = '__skip';
const OTHER = '__other';

interface Props {
  initial: InvoiceDraft;
  createdAt?: number;
  filePreviewUrl?: string;
  fileMimeType?: string;
}

export function Review({ initial, createdAt, filePreviewUrl, fileMimeType }: Props) {
  const { t, intl } = useI18n();
  const nav = useNavigate();
  const { toast } = useToast();
  const { org, orgId, sites, wines, producers, partners, stock, member, commit } = useOrg();
  const { rows: invoices } = useCollection<PurchaseInvoice>('purchaseInvoices');
  const [draft, setDraft] = useState<InvoiceDraft>(initial);
  const [busy, setBusy] = useState<'draft' | 'receive' | null>(null);
  const [showPdf, setShowPdf] = useState<boolean>(Boolean(initial.fileName || filePreviewUrl));
  const [hoveredLineKey, setHoveredLineKey] = useState<string | null>(null);
  const [expandedLineKey, setExpandedLineKey] = useState<string | null>(null);
  const [pickingForKey, setPickingForKey] = useState<string | null>(null);

  const suppliers = useMemo(() => partners.filter((p) => p.kind === 'supplier' && !p.isArchived), [partners]);
  const totals = useMemo(() => draftTotals(draft, org.defaultVatRate), [draft, org.defaultVatRate]);
  const check = useMemo(() => checkTotals(totals, { ht: draft.declaredHT, vat: draft.declaredVAT, ttc: draft.declaredTTC }), [totals, draft.declaredHT, draft.declaredVAT, draft.declaredTTC]);
  const duplicate = useMemo(() => findDuplicate(invoices, draft.supplierName, draft.number, draft.id), [invoices, draft.supplierName, draft.number, draft.id]);
  const allStockByWine = useMemo(() => stockByWine(stock, 'all'), [stock]);

  const patch = (p: Partial<InvoiceDraft>) => setDraft((d) => ({ ...d, ...p }));
  const patchLine = (key: string, p: Partial<ReviewLine>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...p } : l)) }));
  const removeLine = (key: string) =>
    setDraft((d) => ({ ...d, lines: d.lines.filter((x) => x.key !== key) }));

  const unresolved = draft.lines.filter((l) => l.choice !== 'skip' && !isReceivable(l) && l.qty > 0).length;
  const receivable = draft.lines.filter(isReceivable).length;
  const totalBottles = draft.lines.filter((l) => l.choice !== 'skip').reduce((s, l) => s + (l.qty || 0), 0);
  const matchedCount = draft.lines.filter((l) => l.choice === 'match' && l.wineId).length;
  const createCount = draft.lines.filter((l) => l.choice === 'create').length;

  const canReceive = !!draft.supplierName.trim() && !!draft.date && !!draft.siteId && receivable > 0 && unresolved === 0 && !duplicate;
  const canDraft = !!draft.supplierName.trim() && draft.lines.length > 0 && !duplicate;

  const run = async (mode: 'draft' | 'receive') => {
    setBusy(mode);
    try {
      const { ops } = buildInvoiceOps(
        draft,
        mode,
        { orgId, org, actor: { userId: member?.uid ?? '', userName: member?.name ?? '' }, wines, producers, partners, stock },
        createdAt,
      );
      await commit(ops);
      toast(t(mode === 'receive' ? 'achats.received' : 'achats.draftSaved'));
      nav('/achats');
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Barre de synthèse IA & Bascule Aperçu PDF */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 font-semibold text-brand">
            <Sparkles className="size-3.5" />
            Contrôle Facture &amp; Rapprochement IA
          </span>
          <span className="font-medium text-ink">
            <strong>{draft.lines.length}</strong> réf. · <strong>{totalBottles}</strong> bouteilles
          </span>
          {matchedCount > 0 && (
            <Badge tone="ok">
              ✓ {matchedCount} rapprochée{matchedCount > 1 ? 's' : ''} du référentiel
            </Badge>
          )}
          {createCount > 0 && (
            <Badge tone="info">
              + {createCount} nouvelle{createCount > 1 ? 's' : ''} fiche{createCount > 1 ? 's' : ''}
            </Badge>
          )}
          {check.declared && check.ok && (
            <Badge tone="ok">✓ Totaux HT/TTC conformes au PDF</Badge>
          )}
        </div>

        <Button
          size="sm"
          variant={showPdf ? 'secondary' : 'ghost'}
          icon={showPdf ? <EyeOff className="size-4 text-brand" /> : <Eye className="size-4 text-brand" />}
          onClick={() => setShowPdf((v) => !v)}
        >
          {showPdf ? 'Masquer la facture PDF' : 'Afficher la facture PDF côte à côte'}
        </Button>
      </div>

      {/* Grille principale : Split-Screen (PDF à gauche | Données structurées à droite) */}
      <div
        className={cx(
          'grid gap-4 items-start',
          showPdf ? 'xl:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[420px_minmax(0,1fr)]' : 'grid-cols-1',
        )}
      >
        {showPdf && (
          <div className="xl:sticky xl:top-16">
            <InvoicePdfPreview
              draft={draft}
              orgName={org.name}
              defaultVat={org.defaultVatRate}
              intl={intl}
              filePreviewUrl={filePreviewUrl}
              fileMimeType={fileMimeType}
              highlightedLineKey={hoveredLineKey}
              onHoverLine={setHoveredLineKey}
            />
          </div>
        )}

        <div className="space-y-4 min-w-0">
          {/* En-tête de la facture (compact sur 1 bloc) */}
          <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="sm:col-span-2">
              <Field label={t('achats.f.supplier')}>
                <Input list="achats-suppliers" value={draft.supplierName} onChange={(e) => patch({ supplierName: e.target.value })} />
                <datalist id="achats-suppliers">
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.name} />
                  ))}
                </datalist>
              </Field>
            </div>
            <Field label={t('achats.f.number')}>
              <Input value={draft.number} onChange={(e) => patch({ number: e.target.value })} />
            </Field>
            <Field label={t('achats.f.site')}>
              <Select value={draft.siteId} onChange={(e) => patch({ siteId: e.target.value })}>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('achats.f.date')}>
              <Input type="date" value={draft.date} onChange={(e) => patch({ date: e.target.value })} />
            </Field>
            <Field label={t('achats.f.shipping')}>
              <NumberInput step={0.01} min={0} value={draft.shippingHT || undefined} onChange={(v) => patch({ shippingHT: v ?? 0 })} />
            </Field>
            {!suppliers.some((s) => norm(s.name) === norm(draft.supplierName)) && draft.supplierName.trim() && (
              <p className="text-xs text-muted sm:col-span-2 lg:col-span-6">{t('achats.f.newSupplier')}</p>
            )}
          </Card>

          {duplicate && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {t('achats.duplicate', { supplier: duplicate.supplierName, number: duplicate.number })}
            </p>
          )}

          {/* Tableau haute densité des lignes de facture */}
          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2/50 px-4 py-3">
              <div>
                <h2 className="font-display text-base font-semibold text-ink">
                  {t('achats.lines', { n: draft.lines.length })}
                </h2>
                <p className="text-xs text-muted">
                  Vue tabulaire condensée — cliquez sur une ligne pour ajuster le rapprochement ou créer une nouvelle fiche.
                </p>
              </div>
              <Button
                size="sm"
                icon={<Plus className="size-4" />}
                onClick={() => {
                  const nl = emptyLine(org.defaultVatRate);
                  setDraft((d) => ({ ...d, lines: [...d.lines, nl] }));
                  setExpandedLineKey(nl.key);
                }}
              >
                {t('achats.addLine')}
              </Button>
            </div>

            <div className="overflow-hidden">
              <table className="w-full table-fixed text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2/40 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    <th className="py-2.5 pl-2.5 pr-1 text-left w-6">#</th>
                    <th className="py-2.5 px-1.5 text-left">Cuvée &amp; Rapprochement</th>
                    <th className="py-2.5 px-1 text-right w-14">{t('common.qty')}</th>
                    <th className="py-2.5 px-1 text-right w-20">PU HT</th>
                    <th className="py-2.5 px-1.5 text-left w-36">PA ➔ CMP</th>
                    <th className="py-2.5 px-1 text-right w-14">TVA</th>
                    <th className="py-2.5 px-1.5 text-right w-20">Total HT</th>
                    <th className="py-2.5 pl-0.5 pr-2 text-right w-11" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {draft.lines.map((line, idx) => (
                    <InvoiceLineRow
                      key={line.key}
                      index={idx + 1}
                      line={line}
                      wines={wines}
                      invoices={invoices}
                      currentStockQty={line.wineId ? (allStockByWine.get(line.wineId) ?? 0) : 0}
                      intl={intl}
                      highlighted={hoveredLineKey === line.key}
                      expanded={expandedLineKey === line.key || line.choice === 'create'}
                      onToggleExpand={() => setExpandedLineKey((k) => (k === line.key ? null : line.key))}
                      onHover={(h) => setHoveredLineKey(h ? line.key : null)}
                      onOpenPicker={() => setPickingForKey(line.key)}
                      onChange={(p) => patchLine(line.key, p)}
                      onRemove={() => removeLine(line.key)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <TotalsBox draft={draft} computed={totals} check={check} onChange={patch} />

          {unresolved > 0 && <p className="text-sm text-warn">{t('achats.unresolved', { n: unresolved })}</p>}
          <div className="sticky bottom-16 z-10 flex flex-wrap justify-end gap-2 rounded-xl border border-border bg-surface/95 p-3 backdrop-blur md:bottom-3">
            <Button onClick={() => nav('/achats')}>{t('common.cancel')}</Button>
            <Button icon={<Save className="size-4" />} loading={busy === 'draft'} disabled={!canDraft || busy !== null} onClick={() => run('draft')}>
              {t('achats.saveDraft')}
            </Button>
            <Button variant="primary" icon={<PackageCheck className="size-4" />} loading={busy === 'receive'} disabled={!canReceive || busy !== null} onClick={() => run('receive')}>
              {t('achats.receive')}
            </Button>
          </div>
        </div>
      </div>

      {pickingForKey && (
        <WinePicker
          wines={wines}
          onClose={() => setPickingForKey(null)}
          onPick={(w) => {
            const targetKey = pickingForKey;
            setPickingForKey(null);
            patchLine(targetKey, {
              choice: 'match',
              wineId: w.id,
              producer: w.producer,
              name: w.name,
              vintage: w.vintage,
              formatCl: w.formatCl,
              color: w.color,
            });
          }}
        />
      )}
    </div>
  );
}

function InvoiceLineRow({
  index,
  line,
  wines,
  invoices,
  currentStockQty,
  intl,
  highlighted,
  expanded,
  onToggleExpand,
  onHover,
  onOpenPicker,
  onChange,
  onRemove,
}: {
  index: number;
  line: ReviewLine;
  wines: Wine[];
  invoices: PurchaseInvoice[];
  currentStockQty: number;
  intl: string;
  highlighted: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onHover: (hover: boolean) => void;
  onOpenPicker: () => void;
  onChange: (patch: Partial<ReviewLine>) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const candidates = useMemo(
    () => findMatches(line, wines, 5),
    [line.producer, line.name, line.vintage, line.color, line.formatCl, wines], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const selected = line.choice === 'match' ? wines.find((w) => w.id === line.wineId) : undefined;
  const history = useMemo(() => (selected ? priceHistory(selected.id, invoices) : []), [selected, invoices]);
  const value = line.choice === 'match' && line.wineId ? line.wineId : line.choice === 'skip' ? SKIP : CREATE;
  const listed = selected && !candidates.some((c) => c.wine.id === selected.id);

  const lastPrice = history.length ? history[history.length - 1].price : selected?.buyPriceHT;
  const priceDeltaPct = lastPrice && line.unitPriceHT > 0 ? ((line.unitPriceHT - lastPrice) / lastPrice) * 100 : 0;
  const nextCmp = selected
    ? computeWeightedAverageCost(currentStockQty, selected.buyPriceHT, line.qty, line.unitPriceHT)
    : line.unitPriceHT;

  const onSelect = (v: string) => {
    if (v === OTHER) return onOpenPicker();
    if (v === CREATE) return onChange({ choice: 'create', wineId: undefined });
    if (v === SKIP) return onChange({ choice: 'skip', wineId: undefined });
    const w = wines.find((x) => x.id === v);
    if (w) {
      onChange({
        choice: 'match',
        wineId: w.id,
        producer: w.producer,
        name: w.name,
        vintage: w.vintage,
        formatCl: w.formatCl,
        color: w.color,
      });
    }
  };

  return (
    <>
      <tr
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        className={cx(
          'transition-colors align-middle',
          highlighted ? 'bg-brand-soft/40' : 'hover:bg-surface-2/40',
          line.choice === 'skip' && 'opacity-55',
        )}
      >
        <td className="py-2.5 pl-2.5 pr-1 font-mono text-[11px] text-muted">{index}</td>

        {/* Cuvée extraite & Sélecteur de rapprochement */}
        <td className="py-2.5 px-1.5 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 min-w-0">
            {line.choice === 'match' ? (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-2.5" /> Rapproché
              </span>
            ) : line.choice === 'create' ? (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                + Nouvelle
              </span>
            ) : (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                Ignoré
              </span>
            )}
            <span className="truncate text-[11px] text-muted" title={line.description}>
              {line.description || t('achats.line.manual')}
            </span>
          </div>

          <Select
            aria-label={t('achats.line.wine')}
            value={value}
            onChange={(e) => onSelect(e.target.value)}
            className="h-8 w-full min-w-0 truncate text-xs py-1"
          >
            {listed && selected && <option value={selected.id}>{wineLabel(selected)}</option>}
            {candidates.map((c) => (
              <option key={c.wine.id} value={c.wine.id}>
                {wineLabel(c.wine)} ({Math.round(c.score * 100)} %)
              </option>
            ))}
            <option value={CREATE}>{t('achats.line.create')}</option>
            <option value={OTHER}>{t('achats.line.other')}</option>
            <option value={SKIP}>{t('achats.line.skip')}</option>
          </Select>
        </td>

        {/* Quantité */}
        <td className="py-2.5 px-1 text-right">
          <NumberInput
            aria-label={t('common.qty')}
            min={0}
            step={1}
            value={line.qty}
            onChange={(v) => onChange({ qty: v ?? 0 })}
            className="h-8 w-full px-1.5 text-right font-mono text-xs"
          />
        </td>

        {/* Prix Unitaire HT */}
        <td className="py-2.5 px-1 text-right">
          <NumberInput
            aria-label={t('achats.line.unitHT')}
            min={0}
            step={0.01}
            value={line.unitPriceHT}
            onChange={(v) => onChange({ unitPriceHT: v ?? 0 })}
            className="h-8 w-full px-1.5 text-right font-mono text-xs"
          />
        </td>

        {/* Comparaison Ancien PA & Calcul automatique du Nouveau CMP */}
        <td className="py-2.5 px-1.5 min-w-0">
          {selected && lastPrice ? (
            <div className="space-y-0.5 text-[10.5px] leading-tight">
              <div className="flex items-center gap-1 truncate">
                <span className="text-muted">Anc. {eur(lastPrice, 'EUR', intl)}</span>
                {Math.abs(priceDeltaPct) >= 0.1 ? (
                  <span className={cx('font-mono font-semibold', priceDeltaPct > 0 ? 'text-bad' : 'text-ok')}>
                    {priceDeltaPct > 0 ? '+' : ''}
                    {pct(priceDeltaPct)}
                  </span>
                ) : (
                  <span className="font-mono text-[10px] text-emerald-600">= Stable</span>
                )}
              </div>
              <div className="font-mono text-[10.5px] font-semibold text-ink truncate">
                CMP ➔ <span className="text-brand">{eur(nextCmp, 'EUR', intl)}</span>
              </div>
            </div>
          ) : (
            <span className="text-[10.5px] text-muted italic">1er achat</span>
          )}
        </td>

        {/* TVA % */}
        <td className="py-2.5 px-1 text-right">
          <NumberInput
            aria-label={t('achats.line.vat')}
            min={0}
            step={0.5}
            value={line.vatRate}
            onChange={(v) => onChange({ vatRate: v ?? 0 })}
            className="h-8 w-full px-1 text-right font-mono text-xs"
          />
        </td>

        {/* Total Ligne HT */}
        <td className="py-2.5 px-1.5 text-right font-mono text-xs font-semibold tabular-nums text-ink whitespace-nowrap">
          {eur(round2(line.qty * line.unitPriceHT), 'EUR', intl)}
        </td>

        {/* Actions (Détails fiche / Supprimer) */}
        <td className="py-2.5 pl-0.5 pr-2 text-right">
          <div className="inline-flex items-center gap-1">
            {line.choice === 'create' && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
                title="Compléter les détails de la nouvelle fiche vin"
              >
                {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={onRemove}
              aria-label={t('common.delete')}
              className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-bad cursor-pointer"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </td>
      </tr>

      {/* Tiroir dépliable uniquement si création d'une nouvelle fiche vin */}
      {line.choice === 'create' && expanded && (
        <tr className="bg-surface-2/40">
          <td />
          <td colSpan={7} className="p-3">
            <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              <Field label={t('achats.line.producer')}>
                <Input value={line.producer} onChange={(e) => onChange({ producer: e.target.value })} className="h-8 text-xs" />
              </Field>
              <Field label={t('achats.line.name')}>
                <Input value={line.name} onChange={(e) => onChange({ name: e.target.value })} className="h-8 text-xs" />
              </Field>
              <Field label={t('achats.line.region')}>
                <Input value={line.region} onChange={(e) => onChange({ region: e.target.value })} className="h-8 text-xs" />
              </Field>
              <Field label={t('achats.line.vintage')}>
                <Input value={line.vintage} onChange={(e) => onChange({ vintage: e.target.value })} className="h-8 text-xs" />
              </Field>
              <Field label={t('achats.line.format')}>
                <Select value={line.formatCl} onChange={(e) => onChange({ formatCl: Number(e.target.value) })} className="h-8 text-xs py-1">
                  {[...new Set([...FORMATS, line.formatCl])].sort((a, b) => a - b).map((f) => (
                    <option key={f} value={f}>
                      {f} cl
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('achats.line.color')}>
                <Select value={line.color} onChange={(e) => onChange({ color: e.target.value as WineColor })} className="h-8 text-xs py-1">
                  {WINE_COLORS.map((c) => (
                    <option key={c} value={c}>
                      {t(`carte.color.${c}`)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
