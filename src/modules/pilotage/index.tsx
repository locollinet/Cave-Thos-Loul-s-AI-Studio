import { useMemo, useState } from 'react';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { today } from '@/lib/utils';
import { PageHeader, Segmented, Select, Spinner, Tabs } from '@/ui';
import { BreakdownTab, SitesTab } from './BreakdownTab';
import { periodPresets } from './kpis';
import OverviewTab from './OverviewTab';
import ReplenishTab from './ReplenishTab';
import { usePilotage } from './usePilotage';
import WinesTab from './WinesTab';

type Preset = 'month' | 'quarter' | 'year' | 'last12';
type Tab = 'overview' | 'wines' | 'breakdown' | 'sites' | 'replenish';

export default function PilotageModule() {
  const { t } = useI18n();
  const { sites, activeSiteId } = useOrg();
  const [preset, setPreset] = useState<Preset>('last12');
  const [tab, setTab] = useState<Tab>('overview');
  const [siteId, setSiteId] = useState(activeSiteId);
  const period = useMemo(() => periodPresets(today())[preset], [preset]);
  const view = usePilotage(period, siteId);

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
        onChange={setTab}
        tabs={[
          { value: 'overview', label: t('pilotage.tab.overview') },
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
          {tab === 'wines' && <WinesTab view={view} />}
          {tab === 'breakdown' && <BreakdownTab view={view} />}
          {tab === 'sites' && <SitesTab view={view} />}
          {tab === 'replenish' && <ReplenishTab view={view} />}
        </>
      )}
    </>
  );
}
