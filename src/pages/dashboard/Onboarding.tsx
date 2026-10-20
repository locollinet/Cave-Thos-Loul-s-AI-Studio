import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, X } from 'lucide-react';
import type { InventorySession } from '@/types';
import { useCollection, useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Card, cx } from '@/ui';
import type { WineList } from '@/modules/carte/types';
import { onboardingProgress, onboardingSteps } from './compute';

const storageKey = (orgId: string) => `lt-onboarding-dismissed:${orgId}`;

const readDismissed = (orgId: string): boolean => {
  try {
    return localStorage.getItem(storageKey(orgId)) === '1';
  } catch {
    return false;
  }
};

/** Liste de prise en main : masquable par organisation, disparaît une fois complète. */
export function Onboarding() {
  const { t } = useI18n();
  const { org, wines, members, hasModule } = useOrg();
  const lists = useCollection<WineList>('wineLists');
  const inventories = useCollection<InventorySession>('inventories');
  const [dismissedFor, setDismissedFor] = useState<Record<string, boolean>>({});
  const dismissed = dismissedFor[org.id] ?? readDismissed(org.id);

  const steps = useMemo(
    () =>
      onboardingSteps({
        wines: wines.filter((w) => !w.isArchived).length,
        logo: !!org.legal?.logoDataUrl,
        brand: !!org.brand,
        carte: hasModule('carte'),
        lists: lists.rows.length,
        published: lists.rows.filter((l) => l?.published).length,
        members: members.length,
        inventories: inventories.rows.filter((s) => s?.status === 'closed').length,
      }),
    [wines, org.legal?.logoDataUrl, org.brand, hasModule, lists.rows, members.length, inventories.rows],
  );
  const progress = onboardingProgress(steps);
  const done = steps.filter((s) => s.done).length;

  if (dismissed || lists.loading || inventories.loading || progress >= 1) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(storageKey(org.id), '1');
    } catch {
      /* stockage indisponible : masquage pour la session seulement */
    }
    setDismissedFor((m) => ({ ...m, [org.id]: true }));
  };

  return (
    <Card className="relative overflow-hidden p-5 md:p-6" aria-labelledby="onboarding-title">
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('home.ob.dismiss')}
        title={t('home.ob.dismiss')}
        className="absolute right-3 top-3 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
      >
        <X className="size-4" />
      </button>
      <div className="grid gap-5 md:grid-cols-[minmax(0,15rem)_1fr] md:gap-8">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{t('home.ob.eyebrow')}</p>
          <h2 id="onboarding-title" className="mt-0.5 font-display text-2xl leading-tight">
            {t('home.ob.title')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('home.ob.hint')}</p>
          <div className="mt-4 flex items-center gap-3">
            <div
              className="h-1.5 flex-1 rounded-full bg-surface-2"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={steps.length}
              aria-valuenow={done}
              aria-label={t('home.ob.progress', { done, total: steps.length })}
            >
              <div className="h-1.5 rounded-full bg-brand transition-all" style={{ width: `${Math.max(4, progress * 100)}%` }} />
            </div>
            <span className="tabular text-xs font-medium text-muted">
              {done} / {steps.length}
            </span>
          </div>
        </div>
        <ol className="grid gap-1.5 sm:grid-cols-2">
          {steps.map((s) => (
            <li key={s.id} className={s.done ? 'hidden sm:block' : undefined}>
              <Link
                to={s.to}
                className={cx(
                  'group flex items-start gap-3 rounded-lg px-2.5 py-2 transition focus-visible:outline-2 focus-visible:outline-brand',
                  s.done ? 'text-muted' : 'hover:bg-brand-soft/60',
                )}
              >
                <span
                  className={cx('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border', s.done ? 'border-ok bg-ok text-white' : 'border-border bg-surface group-hover:border-brand')}
                  aria-hidden
                >
                  {s.done && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx('block text-sm font-medium', s.done && 'line-through decoration-border')}>{t(`home.ob.${s.id}`)}</span>
                  {!s.done && <span className="block text-xs text-muted">{t(`home.ob.${s.id}.hint`)}</span>}
                </span>
                <span className="sr-only">{s.done ? t('home.ob.doneSr') : t('home.ob.todoSr')}</span>
                {!s.done && <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted opacity-0 transition group-hover:opacity-100" aria-hidden />}
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
