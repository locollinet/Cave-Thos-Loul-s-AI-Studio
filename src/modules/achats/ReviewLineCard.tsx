import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { PurchaseInvoice, Wine, WineColor } from '@/types';
import { WINE_COLORS } from '@/types';
import { useI18n } from '@/i18n';
import { Badge, Card, Field, Input, NumberInput, Select } from '@/ui';
import { findMatches, wineLabel } from '@/lib/wine';
import { eur, round2 } from '@/lib/utils';
import { priceHistory } from './logic';
import type { ReviewLine } from './types';
import { PriceHint } from './PriceHint';
import { WinePicker } from './WinePicker';

const FORMATS = [37.5, 75, 150, 300];
const CREATE = '__create';
const SKIP = '__skip';
const OTHER = '__other';

interface Props {
  line: ReviewLine;
  wines: Wine[];
  invoices: PurchaseInvoice[];
  onChange: (patch: Partial<ReviewLine>) => void;
  onRemove: () => void;
}

export function ReviewLineCard({ line, wines, invoices, onChange, onRemove }: Props) {
  const { t, intl } = useI18n();
  const [picking, setPicking] = useState(false);
  const candidates = useMemo(() => findMatches(line, wines, 5), [line.producer, line.name, line.vintage, line.color, line.formatCl, wines]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = line.choice === 'match' ? wines.find((w) => w.id === line.wineId) : undefined;
  const history = useMemo(() => (selected ? priceHistory(selected.id, invoices) : []), [selected, invoices]);
  const value = line.choice === 'match' && line.wineId ? line.wineId : line.choice === 'skip' ? SKIP : CREATE;
  const listed = selected && !candidates.some((c) => c.wine.id === selected.id);

  const onSelect = (v: string) => {
    if (v === OTHER) return setPicking(true);
    if (v === CREATE) return onChange({ choice: 'create', wineId: undefined });
    if (v === SKIP) return onChange({ choice: 'skip', wineId: undefined });
    const w = wines.find((x) => x.id === v);
    if (w) onChange({ choice: 'match', wineId: w.id, producer: w.producer, name: w.name, vintage: w.vintage, formatCl: w.formatCl, color: w.color });
  };

  return (
    <Card className="space-y-3 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs text-muted">{line.description || t('achats.line.manual')}</p>
        <button type="button" onClick={onRemove} aria-label={t('common.delete')} className="shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-bad">
          <Trash2 className="size-4" />
        </button>
      </div>

      <Field label={t('achats.line.wine')}>
        <Select value={value} onChange={(e) => onSelect(e.target.value)}>
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
      </Field>
      {line.choice === 'match' && <Badge tone="ok">{t('achats.line.matched')}</Badge>}
      {line.choice === 'skip' && <Badge tone="warn">{t('achats.line.skipped')}</Badge>}

      {line.choice === 'create' && (
        <div className="grid gap-3 rounded-lg bg-surface-2/60 p-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('achats.line.producer')}>
            <Input value={line.producer} onChange={(e) => onChange({ producer: e.target.value })} />
          </Field>
          <Field label={t('achats.line.name')}>
            <Input value={line.name} onChange={(e) => onChange({ name: e.target.value })} />
          </Field>
          <Field label={t('achats.line.region')}>
            <Input value={line.region} onChange={(e) => onChange({ region: e.target.value })} />
          </Field>
          <Field label={t('achats.line.vintage')}>
            <Input value={line.vintage} onChange={(e) => onChange({ vintage: e.target.value })} />
          </Field>
          <Field label={t('achats.line.format')}>
            <Select value={line.formatCl} onChange={(e) => onChange({ formatCl: Number(e.target.value) })}>
              {[...new Set([...FORMATS, line.formatCl])].sort((a, b) => a - b).map((f) => (
                <option key={f} value={f}>
                  {f} cl
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('achats.line.color')}>
            <Select value={line.color} onChange={(e) => onChange({ color: e.target.value as WineColor })}>
              {WINE_COLORS.map((c) => (
                <option key={c} value={c}>
                  {t(`carte.color.${c}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Field label={t('common.qty')}>
          <NumberInput min={0} step={1} value={line.qty} onChange={(v) => onChange({ qty: v ?? 0 })} />
        </Field>
        <Field label={t('achats.line.unitHT')}>
          <NumberInput min={0} step={0.01} value={line.unitPriceHT} onChange={(v) => onChange({ unitPriceHT: v ?? 0 })} />
        </Field>
        <Field label={t('achats.line.vat')}>
          <NumberInput min={0} step={0.5} value={line.vatRate} onChange={(v) => onChange({ vatRate: v ?? 0 })} />
        </Field>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        {selected ? <PriceHint history={history} current={line.unitPriceHT} fallbackLast={selected.buyPriceHT} /> : <span />}
        <span className="tabular text-sm font-medium">{eur(round2(line.qty * line.unitPriceHT), 'EUR', intl)} {t('common.ht')}</span>
      </div>
      {picking && (
        <WinePicker
          wines={wines}
          onClose={() => setPicking(false)}
          onPick={(w) => {
            setPicking(false);
            onSelect(w.id);
          }}
        />
      )}
    </Card>
  );
}
