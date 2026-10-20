import { useMemo } from 'react';
import { CheckCircle2, GlassWater, History } from 'lucide-react';
import type { Movement } from '@/types';
import { useCollection, useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { stockByWine } from '@/data/stock';
import { today } from '@/lib/utils';
import { OpenBottlesList, useServiceActions } from './CellarDashboard';
import { openBottles, staffInsight, stockAlerts, todayMovements, type OpenBottleDoc } from './compute';
import { AlertList, Invite, MovementList, Panel, PanelLink, QuickActions, Skeleton } from './parts';
import { Shell } from './Shell';

/** Vue simplifiée pour le personnel de salle / cave : actions rapides et alertes, sans aucune valeur financière. */
export default function StaffDashboard() {
  const { t } = useI18n();
  const { wines, stock, activeSiteId, hasModule } = useOrg();
  const movements = useCollection<Movement>('movements', { orderBy: ['createdAt', 'desc'], limit: 200 });
  const bottles = useCollection<OpenBottleDoc>('openBottles');
  const carte = hasModule('carte');
  const asOf = today();

  const live = useMemo(() => wines.filter((w) => !w.isArchived), [wines]);
  const qty = useMemo(() => stockByWine(stock, activeSiteId), [stock, activeSiteId]);
  const alerts = useMemo(() => stockAlerts(live, stock, activeSiteId), [live, stock, activeSiteId]);
  const todays = useMemo(() => todayMovements(movements.rows, asOf, activeSiteId), [movements.rows, asOf, activeSiteId]);
  const open = useMemo(() => openBottles(bottles.rows, wines, Date.now(), activeSiteId), [bottles.rows, wines, activeSiteId]);
  const actions = useServiceActions();
  const alertRows = [...alerts.out.map((wine) => ({ wine, kind: 'out' as const })), ...alerts.low.map((wine) => ({ wine, kind: 'low' as const }))];

  const insight = staffInsight({ wines: live.length, today: todays.length, out: alerts.out.length, low: alerts.low.length });

  return (
    <Shell
      insight={insight}
      empty={live.length === 0}
      actions={
        <div className="w-full">
          <QuickActions actions={actions} large />
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel eyebrow={t('home.staff.alertsEyebrow')} title={t('dash.toWatch')} action={<PanelLink to="/stock">{t('dash.seeStock')}</PanelLink>}>
          {alertRows.length === 0 ? <Invite icon={CheckCircle2} title={t('dash.allGood')} /> : <AlertList rows={alertRows} qty={qty} limit={8} />}
        </Panel>
        {carte && (
          <Panel eyebrow={t('home.glass.eyebrow')} title={t('home.glass.title')} action={<PanelLink to="/service">{t('home.glass.see')}</PanelLink>}>
            {bottles.loading ? (
              <Skeleton />
            ) : open.length === 0 ? (
              <Invite icon={GlassWater} title={t('home.glass.emptyTitle')} hint={t('home.glass.emptyHint')} to="/service" cta={t('home.glass.emptyCta')} />
            ) : (
              <OpenBottlesList rows={open} limit={6} />
            )}
          </Panel>
        )}
        <Panel className={carte ? 'lg:col-span-2' : undefined} eyebrow={t('home.today.eyebrow')} title={t('home.today.title')}>
          {movements.loading ? (
            <Skeleton />
          ) : todays.length === 0 ? (
            <Invite icon={History} title={t('home.today.emptyTitle')} hint={t('home.today.emptyHint')} />
          ) : (
            <MovementList rows={todays} limit={10} />
          )}
        </Panel>
      </div>
    </Shell>
  );
}
