import { useI18n } from '@/i18n';
import { eur } from '@/lib/utils';
import { cx } from '@/ui';
import type { DocMargin } from './calc';

/** Marge brute du document — visible des seuls profils habilités (gérant, comptable). */
export default function MarginBox({ margin }: { margin: DocMargin }) {
  const { t, intl } = useI18n();
  const n = (v: number, d = 1) => v.toLocaleString(intl, { maximumFractionDigits: d });
  if (margin.revenueHT === 0 && margin.costHT === 0 && !margin.missing) return null;
  return (
    <section aria-label={t('negoce.marginTitle')} className="ml-auto w-full max-w-sm border-t border-dashed border-border pt-3" data-testid="margin-box">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{t('negoce.marginTitle')}</div>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">{t('negoce.costHT')}</dt>
          <dd className="tabular">{eur(margin.costHT, 'EUR', intl)}</dd>
        </div>
        <div className="flex justify-between font-medium">
          <dt>{t('negoce.marginHT')}</dt>
          <dd className={cx('tabular', margin.marginHT < 0 ? 'text-bad' : 'text-ok')}>{eur(margin.marginHT, 'EUR', intl)}</dd>
        </div>
        <div className="flex justify-between text-xs">
          <dt className="text-muted">{t('negoce.marginRate')}</dt>
          <dd className="tabular">{margin.marginRate === null ? '—' : `${n(margin.marginRate)} %`}</dd>
        </div>
        <div className="flex justify-between text-xs">
          <dt className="text-muted">{t('negoce.coef')}</dt>
          <dd className="tabular">{margin.coef === null ? '—' : `×${n(margin.coef, 2)}`}</dd>
        </div>
      </dl>
      {margin.missing > 0 && <p className="mt-1.5 text-xs italic text-muted">{t('negoce.marginMissing', { n: margin.missing })}</p>}
    </section>
  );
}
