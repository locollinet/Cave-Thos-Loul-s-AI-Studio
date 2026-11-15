import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { today } from '@/lib/utils';
import { MultiSiteConsolidationPanel, VintageAnalyticsPanel } from '@/pages/dashboard/VintageAnalyticsPanel';
import { PageHeader, Segmented, Select, Spinner, Tabs } from '@/ui';
import { BreakdownTab, SitesTab } from './BreakdownTab';
import { periodPresets } from './kpis';
import OverviewTab from './OverviewTab';
import ReplenishTab from './ReplenishTab';
import { usePilotage } from './usePilotage';
import WinesTab from './WinesTab';

type Preset = 'month' | 'quarter' | 'year' | 'last12';
type Tab = 'overview' | 'vintages' | 'wines' | 'breakdown' | 'sites' | 'replenish';
const VALID_TABS = new Set<Tab>(['overview', 'vintages', 'wines', 'breakdown', 'sites', 'replenish']);

export default function PilotageModule() {
  const { t, intl } = useI18n();
  const { orgId, org, sites, wines, stock, activeSiteId, can } = useOrg();
  const [params, setParams] = useSearchParams();
  const urlTab = params.get('tab') as Tab | null;
  const [preset, setPreset] = useState<Preset>('last12');
  const [tab, setTab] = useState<Tab>(() => (urlTab && VALID_TABS.has(urlTab) ? urlTab : 'overview'));
  const [siteId, setSiteId] = useState(activeSiteId);

  useEffect(() => {
    const tParam = params.get('tab') as Tab | null;
    if (tParam && VALID_TABS.has(tParam)) setTab(tParam);
  }, [params]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'overview') p.delete('tab');
        else p.set('tab', next);
        return p;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    setSiteId(activeSiteId);
  }, [orgId, activeSiteId]);
  const period = useMemo(() => periodPresets(today())[preset], [preset]);
  const view = usePilotage(period, siteId);
  const liveWines = useMemo(() => wines.filter((w) => !w.isArchived), [wines]);

  return (
    <>
      <PageHeader
        title={t('nav.pilotage')}
        subtitle={t('pilotage.subtitle')}
        actions={
          <>
            <Segmented<Preset>
              value={preset}
              onChange={setPreset}
              options={[
                { value: 'month', label: t('pilotage.period.month') },
                { value: 'quarter', label: t('pilotage.period.quarter') },
                { value: 'year', label: t('pilotage.period.year') },
                { value: 'last12', label: t('pilotage.period.last12') },
              ]}
            />
            <Select aria-label={t('common.site')} value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-44">
              <option value="all">{t('common.allSites')}</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </>
        }
      />
      <Tabs<Tab>
        value={tab}
        onChange={switchTab}
        tabs={[
          { value: 'overview', label: t('pilotage.tab.overview') },
          { value: 'vintages', label: 'Millésimes & Années' },
          { value: 'wines', label: t('pilotage.tab.wines') },
          { value: 'breakdown', label: t('pilotage.tab.breakdown') },
          { value: 'sites', label: t('pilotage.tab.sites'), count: sites.length },
          { value: 'replenish', label: t('pilotage.tab.replenish'), count: view.replenish.length },
        ]}
      />
      {view.loading ? (
        <Spinner className="mx-auto mt-16" />
      ) : (
        <>
          {tab === 'overview' && <OverviewTab view={view} />}
          {tab === 'vintages' && (
            <div className="space-y-4">
              <VintageAnalyticsPanel
                wines={liveWines}
                stock={stock}
                movements={view.input.movements}
                siteId={siteId}
                currency={org.currency}
                intl={intl}
                vatRate={org.defaultVatRate}
                canSeeFinance={can('sommelier')}
              />
              <MultiSiteConsolidationPanel
                sites={sites}
                wines={liveWines}
                stock={stock}
                movements={view.input.movements}
                activeSiteId={siteId}
                onSelectSite={setSiteId}
                currency={org.currency}
                intl={intl}
                vatRate={org.defaultVatRate}
                canSeeFinance={can('sommelier')}
              />
            </div>
          )}
          {tab === 'wines' && <WinesTab view={view} />}
          {tab === 'breakdown' && <BreakdownTab view={view} />}
          {tab === 'sites' && <SitesTab view={view} />}
          {tab === 'replenish' && <ReplenishTab view={view} />}
        </>
      )}
    </>
  );
}
