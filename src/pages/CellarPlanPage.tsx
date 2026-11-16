import { useState } from 'react';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { PageHeader } from '@/ui';
import { CellarPlan } from './stock/CellarPlan';
import { WineDrawer } from './wines/WineDrawer';

export default function CellarPlanPage() {
  const { t } = useI18n();
  const { wines } = useOrg();
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = openId ? wines.find((w) => w.id === openId) : undefined;

  return (
    <div>
      <PageHeader
        title={t('nav.cellarPlan')}
        subtitle="Cave en coupe interactive, goulots étiquetés par millésime, permutation Devant/Derrière et rangement."
      />
      <CellarPlan onOpenWine={(id) => setOpenId(id)} />
      {opened && <WineDrawer wine={opened} onClose={() => setOpenId(null)} />}
    </div>
  );
}
