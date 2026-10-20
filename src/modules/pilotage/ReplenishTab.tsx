import { Download, PackageCheck } from 'lucide-react';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { downloadBlob, eur, toCsv, today } from '@/lib/utils';
import { Badge, Button, EmptyState, Table, Td, Th } from '@/ui';
import { purchaseOrderRows } from './replenish';
import type { PilotageView } from './usePilotage';

export default function ReplenishTab({ view }: { view: PilotageView }) {
  const { t, intl } = useI18n();
  const { org } = useOrg();
  const items = view.replenish;

  const exportPo = () => {
    const rows = purchaseOrderRows(items, {
      supplier: t('pilotage.supplier'),
      wine: t('pilotage.wine'),
      qty: t('common.qty'),
      price: t('pilotage.unitPrice'),
      total: t('common.total'),
      none: t('pilotage.noSupplier'),
      subtotal: t('pilotage.subtotal'),
    });
    downloadBlob(`bon-de-commande_${today()}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  };

  if (!items.length) return <EmptyState icon={<PackageCheck className="size-8" />} title={t('pilotage.replenish.empty')} hint={t('pilotage.replenish.emptyHint')} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{t('pilotage.replenish.hint')}</p>
        <Button variant="primary" icon={<Download className="size-4" />} onClick={exportPo}>
          {t('pilotage.createPo')}
        </Button>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>{t('pilotage.wine')}</Th>
            <Th right>{t('pilotage.stock')}</Th>
            <Th right>{t('pilotage.threshold')}</Th>
            <Th right>{t('pilotage.velocity')}</Th>
            <Th right>{t('pilotage.kpi.coverage')}</Th>
            <Th right>{t('pilotage.suggested')}</Th>
            <Th>{t('pilotage.supplier')}</Th>
            <Th right>{t('pilotage.unitPrice')}</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.wineId}>
              <Td className="max-w-64 truncate">{r.label}</Td>
              <Td right>
                <Badge tone={r.stock <= 0 ? 'bad' : 'warn'}>{r.stock}</Badge>
              </Td>
              <Td right>{r.threshold}</Td>
              <Td right>{(r.velocityPerDay * 30).toFixed(1)}</Td>
              <Td right>{r.coverageDays === null ? '—' : `${r.coverageDays} ${t('pilotage.days')}`}</Td>
              <Td right className="font-semibold">
                {r.suggestedQty}
              </Td>
              <Td>{r.supplier || <span className="text-muted">{t('pilotage.noSupplier')}</span>}</Td>
              <Td right>{eur(r.unitPriceHT, org.currency, intl)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
