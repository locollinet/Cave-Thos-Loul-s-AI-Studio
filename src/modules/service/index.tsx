import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Euro, GlassWater, LogOut, MapPin, Store } from 'lucide-react';
import type { Movement, Site } from '@/types';
import { useOrg, useCollection } from '@/app/org';
import { useI18n } from '@/i18n';
import { eur, num } from '@/lib/utils';
import { Button, EmptyState, PageHeader, Spinner, Stat } from '@/ui';
import { GlassTab } from './GlassTab';
import { todayKpis } from './logic';
import { BigTabs, useNow } from './parts';
import { ServiceTab } from './ServiceTab';
import type { OpenBottle } from './types';
import { useServiceActions } from './useServiceActions';

type Tab = 'service' | 'verre';

export default function ServiceModule() {
  const { sites, activeSiteId, setActiveSiteId } = useOrg();
  const live = sites.filter((s) => !s.isArchived);
  const site = live.find((s) => s.id === activeSiteId);
  if (!site) return <SitePicker sites={live} onPick={setActiveSiteId} />;
  return <ServiceView site={site} multiSite={live.length > 1} onChangeSite={() => setActiveSiteId('all')} />;
}

function SitePicker({ sites, onPick }: { sites: Site[]; onPick: (id: string) => void }) {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('nav.service')} />
      {sites.length === 0 ? (
        <EmptyState icon={<Store className="size-8" />} title={t('service.noSites')} hint={t('service.noSites.hint')} />
      ) : (
        <section aria-labelledby="pick-site-title" className="mx-auto max-w-3xl">
          <h2 id="pick-site-title" className="font-display text-3xl">
            {t('service.pickSite.title')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('service.pickSite.hint')}</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {sites.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onPick(s.id)}
                  className="flex min-h-24 w-full items-center gap-4 rounded-2xl border border-border bg-surface p-5 text-left shadow-sm transition hover:border-brand hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand active:scale-[0.99]"
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                    <MapPin className="size-6" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-2xl leading-tight">{s.name}</span>
                    {s.address && <span className="mt-0.5 block truncate text-sm text-muted">{s.address}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function ServiceView({ site, multiSite, onChangeSite }: { site: Site; multiSite: boolean; onChangeSite: () => void }) {
  const { t, intl } = useI18n();
  const { org } = useOrg();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'verre' ? 'verre' : 'service';
  const setTab = (v: Tab) => setParams(v === 'service' ? {} : { tab: v }, { replace: true });

  const { rows: bottles, loading } = useCollection<OpenBottle>('openBottles', { orderBy: ['openedAt', 'desc'], limit: 400 });
  const { rows: movements } = useCollection<Movement>('movements', { orderBy: ['createdAt', 'desc'], limit: 500 });
  const actions = useServiceActions(site.id, bottles);
  const kpi = useMemo(() => todayKpis(bottles, movements, site.id, now), [bottles, movements, site.id, now]);

  return (
    <>
      <PageHeader
        title={t('nav.service')}
        subtitle={t('service.subtitle', { site: site.name })}
        actions={
          multiSite && (
            <Button size="lg" onClick={onChangeSite} icon={<MapPin className="size-5" aria-hidden />}>
              {t('service.changeSite')}
            </Button>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('service.kpi.glasses')} value={num(kpi.glassesServed, intl)} sub={t('service.kpi.today')} icon={<GlassWater className="size-4" aria-hidden />} />
        <Stat label={t('service.kpi.revenue')} value={eur(kpi.revenueTTC, org.currency, intl)} sub={t('service.kpi.revenue.sub')} icon={<Euro className="size-4" aria-hidden />} />
        <Stat label={t('service.kpi.bottles')} value={num(kpi.bottlesOut, intl)} sub={t('service.kpi.today')} icon={<LogOut className="size-4" aria-hidden />} />
        <Stat
          label={t('service.kpi.alerts')}
          value={num(kpi.freshnessAlerts, intl)}
          tone={kpi.freshnessAlerts > 0 ? 'bad' : undefined}
          sub={t('service.kpi.open', { n: kpi.openBottles })}
          icon={<AlertTriangle className="size-4" aria-hidden />}
        />
      </div>

      <BigTabs<Tab>
        label={t('service.tabs')}
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'service', label: t('service.tab.service') },
          { value: 'verre', label: t('service.tab.glass'), count: kpi.openBottles || undefined },
        ]}
      />

      <div role="tabpanel" aria-label={tab === 'service' ? t('service.tab.service') : t('service.tab.glass')}>
        {loading ? (
          <Spinner className="mx-auto mt-16" />
        ) : tab === 'service' ? (
          <ServiceTab siteId={site.id} actions={actions} onOpened={() => setTab('verre')} />
        ) : (
          <GlassTab siteId={site.id} bottles={bottles} now={now} actions={actions} />
        )}
      </div>
    </>
  );
}
