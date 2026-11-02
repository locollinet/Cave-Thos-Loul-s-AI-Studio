import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Card, Field, NumberInput } from '@/ui';
import { eur } from '@/lib/utils';
import type { InvoiceDraft, Totals, TotalsCheck } from './types';

interface Props {
  draft: InvoiceDraft;
  computed: Totals;
  check: TotalsCheck;
  onChange: (patch: Partial<InvoiceDraft>) => void;
}

export function TotalsBox({ draft, computed, check, onChange }: Props) {
  const { t, intl } = useI18n();
  const money = (n: number) => eur(n, 'EUR', intl);
  return (
    <Card className="space-y-3 p-4">
      <h3 className="font-display text-base font-semibold">{t('achats.totals.title')}</h3>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted">{t('common.ht')}</dt>
          <dd className="tabular font-medium">{money(computed.ht)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t('achats.totals.vat')}</dt>
          <dd className="tabular font-medium">{money(computed.vat)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t('common.ttc')}</dt>
          <dd className="tabular font-medium">{money(computed.ttc)}</dd>
        </div>
      </dl>
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('achats.totals.declaredHT')}>
          <NumberInput step={0.01} min={0} value={draft.declaredHT || undefined} onChange={(v) => onChange({ declaredHT: v ?? 0 })} />
        </Field>
        <Field label={t('achats.totals.declaredVAT')}>
          <NumberInput step={0.01} min={0} value={draft.declaredVAT || undefined} onChange={(v) => onChange({ declaredVAT: v ?? 0 })} />
        </Field>
        <Field label={t('achats.totals.declaredTTC')}>
          <NumberInput step={0.01} min={0} value={draft.declaredTTC || undefined} onChange={(v) => onChange({ declaredTTC: v ?? 0 })} />
        </Field>
      </div>
      {check.declared &&
        (check.ok ? (
          <p className="flex items-center gap-2 text-sm text-ok">
            <CheckCircle2 className="size-4" />
            {t('achats.totals.ok')}
          </p>
        ) : (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-warn/12 px-3 py-2 text-sm text-warn">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {t('achats.totals.gap', { ht: money(check.htDiff), vat: money(check.vatDiff), ttc: money(check.ttcDiff) })}
          </p>
        ))}
    </Card>
  );
}
