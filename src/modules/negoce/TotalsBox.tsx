import { useI18n } from '@/i18n';
import { eur } from '@/lib/utils';
import type { DocTotals } from './types';

export default function TotalsBox({ totals }: { totals: DocTotals }) {
  const { t, intl } = useI18n();
  const f = (n: number) => eur(n, 'EUR', intl);
  return (
    <dl className="ml-auto w-full max-w-sm space-y-1 text-sm">
      {totals.shippingHT > 0 && (
        <div className="flex justify-between">
          <dt className="text-muted">{t('negoce.shipping')}</dt>
          <dd className="tabular">{f(totals.shippingHT)}</dd>
        </div>
      )}
      <div className="flex justify-between">
        <dt className="text-muted">{t('negoce.totalHT')}</dt>
        <dd className="tabular">{f(totals.totalHT)}</dd>
      </div>
      {totals.breakdown.map((r) => (
        <div key={r.rate} className="flex justify-between text-xs">
          <dt className="text-muted">{t('negoce.vatOn', { rate: r.rate, base: f(r.baseHT) })}</dt>
          <dd className="tabular">{f(r.vat)}</dd>
        </div>
      ))}
      <div className="flex justify-between border-t border-border pt-2 font-display text-lg font-semibold">
        <dt>{t('negoce.totalTTC')}</dt>
        <dd className="tabular">{f(totals.totalTTC)}</dd>
      </div>
    </dl>
  );
}
