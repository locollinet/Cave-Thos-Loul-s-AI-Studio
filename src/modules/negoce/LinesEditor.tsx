import { Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { eur } from '@/lib/utils';
import { Checkbox, Field, Input, NumberInput, cx } from '@/ui';
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

  if (!lines.length) return <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">{t('negoce.noLines')}</p>;

  return (
    <ul className="space-y-2">
      {lines.map((l, i) => (
        <li key={l.id} className="rounded-xl border border-border bg-surface p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Input
                aria-label={t('negoce.description')}
                value={l.description}
                disabled={disabled}
                onChange={(e) => patch(i, { description: e.target.value })}
                placeholder={t('negoce.description')}
              />
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {l.isService && <span className="text-muted">{t('negoce.service')}</span>}
                {l.fromConsignment && <span className="text-info">{t('negoce.fromConsignment')}</span>}
                {l.wineId && shortWineIds.has(l.wineId) && (
                  <span className="font-medium text-bad" role="alert">
                    {t('negoce.shortageQty', { n: insights?.[i]?.stock ?? 0 })}
                  </span>
                )}
              </div>
              <LineFacts insight={insights?.[i]} line={l} showMargin={!!showMargin} />
            </div>
            {!disabled && (
              <button type="button" onClick={() => remove(i)} aria-label={t('common.delete')} className="rounded-md p-2 text-muted hover:bg-surface-2 hover:text-bad">
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
            <Field label={t('common.qty')}>
              <NumberInput min={0} step="any" value={l.qty} disabled={disabled} onChange={(v) => patch(i, { qty: v ?? 0 })} />
            </Field>
            <Field label={t('negoce.unitPrice')}>
              <NumberInput min={0} step="any" value={l.unitPriceHT} disabled={disabled || !!l.fromConsignment} onChange={(v) => patch(i, { unitPriceHT: v ?? 0 })} />
            </Field>
            <Field label={t('negoce.discount')}>
              <NumberInput min={0} max={100} step="any" value={l.discountPct} disabled={disabled} onChange={(v) => patch(i, { discountPct: v ?? 0 })} />
            </Field>
            <Field label={t('negoce.vat')}>
              <NumberInput min={0} step="any" value={l.vatRate} disabled={disabled} onChange={(v) => patch(i, { vatRate: v ?? 0 })} />
            </Field>
            <div className="flex items-end pb-2.5">
              {!l.isService && <Checkbox checked={!!l.isGift} onChange={(v) => patch(i, { isGift: v })} label={t('negoce.gift')} />}
            </div>
            <div className="col-span-2 flex flex-col items-end justify-end sm:col-span-1">
              <span className="text-xs text-muted">{t('negoce.lineTotal')}</span>
              <span className="tabular text-base font-semibold">{eur(nets[i] ?? 0, 'EUR', intl)}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function LineFacts({ insight, line, showMargin }: { insight?: LineInsight; line: DocLine; showMargin: boolean }) {
  const { t, intl } = useI18n();
  if (!insight || !line.wineId || line.isService) return null;
  const f = (n: number) => eur(n, 'EUR', intl);
  const m = insight.margin;
  return (
    <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted" data-testid="line-facts">
      {!line.fromConsignment && insight.stock !== undefined && (
        <div className="flex gap-1">
          <dt>{t('negoce.siteStock')}</dt>
          <dd className={cx('tabular font-medium', insight.stock < line.qty ? 'text-bad' : 'text-ink')}>{insight.stock}</dd>
        </div>
      )}
      {showMargin && insight.buyPriceHT !== undefined && (
        <div className="flex gap-1">
          <dt>{t('negoce.buyPrice')}</dt>
          <dd className="tabular text-ink">{f(insight.buyPriceHT)}</dd>
        </div>
      )}
      {showMargin && m && (
        <div className="flex gap-1">
          <dt>{t('negoce.margin')}</dt>
          <dd className={cx('tabular font-medium', m.marginHT < 0 ? 'text-bad' : 'text-ok')}>
            {f(m.marginHT)}
            {m.marginRate !== null && ` · ${m.marginRate.toLocaleString(intl, { maximumFractionDigits: 1 })} %`}
            {m.coef !== null && ` · ×${m.coef.toLocaleString(intl, { maximumFractionDigits: 2 })}`}
          </dd>
        </div>
      )}
      {showMargin && insight.buyPriceHT === undefined && <div className="italic">{t('negoce.noBuyPrice')}</div>}
    </dl>
  );
}
