import type { ReactNode } from 'react';
import { FileSpreadsheet, Plus, Wine as WineIcon } from 'lucide-react';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import type { Insight } from './compute';
import { Hero, Invite, Panel } from './parts';
import { Onboarding } from './Onboarding';

/** Structure commune : accroche, prise en main, puis contenu (ou invitation si la cave est vide). */
export function Shell({ insight, actions, empty, children }: { insight: Insight; actions?: ReactNode; empty: boolean; children: ReactNode }) {
  const { can } = useOrg();
  return (
    <div className="space-y-6">
      <Hero insight={insight} actions={actions} />
      {can('manager') && <Onboarding />}
      {empty ? <EmptyCellar /> : children}
    </div>
  );
}

function EmptyCellar() {
  const { t } = useI18n();
  const { can } = useOrg();
  const editor = can('accountant');
  return (
    <Panel highlight eyebrow={t('home.empty.eyebrow')} title={t('dash.emptyTitle')}>
      <p className="mb-4 max-w-2xl text-sm text-muted">{editor ? t('home.empty.hint') : t('home.empty.hintStaff')}</p>
      {editor && (
        <div className="grid gap-3 md:grid-cols-2">
          <Invite icon={Plus} title={t('home.empty.create')} hint={t('home.empty.createHint')} to="/vins?new=1" cta={t('wines.new')} />
          <Invite icon={FileSpreadsheet} title={t('home.empty.import')} hint={t('home.empty.importHint')} to="/vins" cta={t('home.empty.importCta')} />
        </div>
      )}
      {!editor && <Invite icon={WineIcon} title={t('home.empty.staffTitle')} />}
    </Panel>
  );
}
