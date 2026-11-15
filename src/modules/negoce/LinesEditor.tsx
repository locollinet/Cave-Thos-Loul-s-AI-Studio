import { Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { eur } from '@/lib/utils';
import { Badge, Checkbox, Input, NumberInput, cx } from '@/ui';
import type { Margin } from './calc';
import type { DocLine } from './types';

/** Repères affichés sous une ligne de vin : stock du site, prix d'achat et marge (selon les droits). */
export interface LineInsight {
  stock?: number;
  buyPriceHT?: number;
  margin?: Margin | null;
}

interface Props {
  lines: DocLine[];
  nets: number[];
  disabled?: boolean;
  shortWineIds: Set<string>;
  onChange: (lines: DocLine[]) => void;
  insights?: (LineInsight | undefined)[];
  showMargin?: boolean;
}

export default function LinesEditor({ lines, nets, disabled, shortWineIds, onChange, insights, showMargin }: Props) {
  const { t, intl } = useI18n();
  const patch = (i: number, p: Partial<DocLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const remove = (i: number) => onChange(lines.filter((_, j) => j !== i));

  if (!lines.length) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
        {t('negoce.noLines')}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-2xs">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2/50 text-[10px] font-semibold uppercase tracking-wider text-muted">
            <th className="py-2.5 pl-3 pr-2 text-left w-7">#</th>
            <th className="py-2.5 px-2 text-left min-w-[240px]">{t('negoce.description')}</th>
            <th className="py-2.5 px-2 text-right w-20">{t('common.qty')}</th>
            <th className="py-2.5 px-2 text-right w-28">{t('negoce.unitPrice')}</th>
            <th className="py-2.5 px-2 text-right w-22">{t('negoce.discount')}</th>
            <th className="py-2.5 px-2 text-right w-20">{t('negoce.vat')}</th>
            <th className="py-2.5 px-2 text-center w-20">{t('negoce.gift')}</th>
            <th className="py-2.5 px-2 text-right w-28">{t('negoce.lineTotal')}</th>
            {!disabled && <th className="py-2.5 pl-1 pr-3 text-right w-10" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {lines.map((l, i) => (
            <tr key={l.id} className="align-middle transition-colors hover:bg-surface-2/30">
              <td className="py-2.5 pl-3 pr-2 font-mono text-xs text-muted">{i + 1}</td>

              {/* Désignation + Badges Stock / PA / Marge */}
              <td className="py-2.5 px-2">
                <Input
                  aria-label={t('negoce.description')}
                  value={l.description}
                  disabled={disabled}
                  onChange={(e) => patch(i, { description: e.target.value })}
                  placeholder={t('negoce.description')}
                  className="h-8 text-xs font-medium"
                />
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
                  {l.isService && <Badge>{t('negoce.service')}</Badge>}
                  {l.fromConsignment && <Badge tone="info">{t('negoce.fromConsignment')}</Badge>}
                  {l.wineId && shortWineIds.has(l.wineId) && (
                    <span className="font-semibold text-bad" role="alert">
                      {t('negoce.shortageQty', { n: insights?.[i]?.stock ?? 0 })}
                    </span>
                  )}
                  <LineFacts insight={insights?.[i]} line={l} showMargin={!!showMargin} />
                </div>
              </td>

              {/* Qté */}
              <td className="py-2.5 px-2 text-right">
                <NumberInput
                  aria-label={t('common.qty')}
                  min={0}
                  step="any"
                  value={l.qty}
                  disabled={disabled}
                  onChange={(v) => patch(i, { qty: v ?? 0 })}
                  className="h-8 text-right font-mono text-xs"
                />
              </td>

              {/* PU HT */}
              <td className="py-2.5 px-2 text-right">
                <NumberInput
                  aria-label={t('negoce.unitPrice')}
                  min={0}
                  step="any"
                  value={l.unitPriceHT}
                  disabled={disabled || !!l.fromConsignment}
                  onChange={(v) => patch(i, { unitPriceHT: v ?? 0 })}
                  className="h-8 text-right font-mono text-xs"
                />
              </td>

              {/* Remise % */}
              <td className="py-2.5 px-2 text-right">
                <NumberInput
                  aria-label={t('negoce.discount')}
                  min={0}
                  max={100}
                  step="any"
                  value={l.discountPct}
                  disabled={disabled}
                  onChange={(v) => patch(i, { discountPct: v ?? 0 })}
                  className="h-8 text-right font-mono text-xs"
                />
              </td>

              {/* TVA % */}
              <td className="py-2.5 px-2 text-right">
                <NumberInput
                  aria-label={t('negoce.vat')}
                  min={0}
                  step="any"
                  value={l.vatRate}
                  disabled={disabled}
                  onChange={(v) => patch(i, { vatRate: v ?? 0 })}
                  className="h-8 text-right font-mono text-xs"
                />
              </td>

              {/* Offert */}
              <td className="py-2.5 px-2 text-center">
                {!l.isService && (
                  <div className="inline-flex justify-center">
                    <Checkbox checked={!!l.isGift} onChange={(v) => patch(i, { isGift: v })} label="" />
                  </div>
                )}
              </td>

              {/* Total Net HT */}
              <td className="py-2.5 px-2 text-right font-mono text-xs font-semibold tabular-nums text-ink">
                {eur(nets[i] ?? 0, 'EUR', intl)}
              </td>

              {/* Supprimer */}
              {!disabled && (
                <td className="py-2.5 pl-1 pr-3 text-right">
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    aria-label={t('common.delete')}
                    className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-bad cursor-pointer"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineFacts({ insight, line, showMargin }: { insight?: LineInsight; line: DocLine; showMargin: boolean }) {
  const { t, intl } = useI18n();
  if (!insight || !line.wineId || line.isService) return null;
  const f = (n: number) => eur(n, 'EUR', intl);
  const m = insight.margin;
  return (
    <dl className="inline-flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted" data-testid="line-facts">
      {!line.fromConsignment && insight.stock !== undefined && (
        <div className="flex gap-1">
          <dt>{t('negoce.siteStock')}</dt>
          <dd className={cx('tabular font-semibold', insight.stock < line.qty ? 'text-bad' : 'text-ink')}>{insight.stock}</dd>
        </div>
      )}
      {showMargin && insight.buyPriceHT !== undefined && (
        <div className="flex gap-1">
          <dt>{t('negoce.buyPrice')}</dt>
          <dd className="tabular text-ink font-mono">{f(insight.buyPriceHT)}</dd>
        </div>
      )}
      {showMargin && m && (
        <div className="flex gap-1">
          <dt>{t('negoce.margin')}</dt>
          <dd className={cx('tabular font-semibold font-mono', m.marginHT < 0 ? 'text-bad' : 'text-ok')}>
            {f(m.marginHT)}
            {m.marginRate !== null && ` (${m.marginRate.toLocaleString(intl, { maximumFractionDigits: 1 })} %)`}
            {m.coef !== null && ` · ×${m.coef.toLocaleString(intl, { maximumFractionDigits: 2 })}`}
          </dd>
        </div>
      )}
      {showMargin && insight.buyPriceHT === undefined && <div className="italic">{t('negoce.noBuyPrice')}</div>}
    </dl>
  );
}
