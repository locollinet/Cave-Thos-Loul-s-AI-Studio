import { useMemo, useState } from 'react';
import { Download, Save } from 'lucide-react';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { downloadBlob, toCsv } from '@/lib/utils';
import { Button, Field, Input, PageHeader, Select, Spinner, Table, Td, Th, cx, useToast } from '@/ui';
import { DRM_CATEGORIES, buildDrm, drmCsvRows } from './drm';
import { Disclaimer } from './Shared';
import type { DrmReport, DrmRow, Qty } from './types';
import { useCompta } from './useCompta';

type Pick = (r: DrmRow) => Qty;
interface Line {
  key: string;
  pick: Pick;
  strong?: boolean;
  indent?: boolean;
}

const LINES: Line[] = [
  { key: 'opening', pick: (r) => r.opening, strong: true },
  { key: 'achats', pick: (r) => r.entries.achats, indent: true },
  { key: 'retours', pick: (r) => r.entries.retours, indent: true },
  { key: 'entriesOther', pick: (r) => r.entries.autres, indent: true },
  { key: 'entries', pick: (r) => r.entries.total, strong: true },
  { key: 'ventes', pick: (r) => r.exits.ventes, indent: true },
  { key: 'consommation', pick: (r) => r.exits.consommation, indent: true },
  { key: 'casse', pick: (r) => r.exits.casse, indent: true },
  { key: 'degustation', pick: (r) => r.exits.degustation, indent: true },
  { key: 'offerts', pick: (r) => r.exits.offerts, indent: true },
  { key: 'exitsOther', pick: (r) => r.exits.autres, indent: true },
  { key: 'exits', pick: (r) => r.exits.total, strong: true },
  { key: 'closing', pick: (r) => r.closing, strong: true },
];

const sumQty = (qs: Qty[]): Qty => ({ bottles: qs.reduce((n, q) => n + q.bottles, 0), hl: Math.round(qs.reduce((n, q) => n + q.hl, 0) * 10000) / 10000 });

export default function DrmPage() {
  const { t, intl } = useI18n();
  const { orgId, sites, wines, stock, commit, member } = useOrg();
  const data = useCompta();
  const { toast } = useToast();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [siteId, setSiteId] = useState('all');
  const rows = useMemo(() => buildDrm({ wines, stock, movements: data.movements, month, siteId: siteId === 'all' ? undefined : siteId }), [wines, stock, data.movements, month, siteId]);
  const saved = data.drmReports.find((r) => r.id === month);
  const nf = new Intl.NumberFormat(intl, { maximumFractionDigits: 4 });

  const labels = (): Record<string, string> => ({
    ...Object.fromEntries(LINES.map((l) => [l.key, t(`compta.drm.line.${l.key}`)])),
    ...Object.fromEntries(DRM_CATEGORIES.map((c) => [`cat.${c}`, t(`compta.drm.cat.${c}`)])),
    category: t('compta.drm.category'),
    bottles: t('compta.drm.bottles'),
    hl: t('compta.drm.hl'),
  });

  const exportCsv = () => downloadBlob(`DRM_${month}.csv`, toCsv(drmCsvRows(rows, labels())), 'text/csv;charset=utf-8');

  const save = async () => {
    const report: DrmReport = { id: month, month, rows, savedAt: Date.now(), savedBy: member?.name ?? '' };
    try {
      await commit([{ op: 'set', path: `orgs/${orgId}/drmReports/${month}`, data: JSON.parse(JSON.stringify(report)) }]);
      toast(t('compta.drm.saved'));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    }
  };

  if (data.loading) return <Spinner className="mx-auto mt-20" />;

  return (
    <>
      <PageHeader
        title={t('compta.drm.title')}
        subtitle={t('compta.drm.subtitle')}
        actions={
          <>
            <Button icon={<Download className="size-4" />} onClick={exportCsv}>
              {t('compta.exportCsv')}
            </Button>
            <Button variant="primary" icon={<Save className="size-4" />} onClick={save}>
              {t('compta.drm.save')}
            </Button>
          </>
        }
      />
      <Disclaimer text={t('compta.drm.warning')} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label={t('compta.month')}>
          <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-44" />
        </Field>
        <Field label={t('common.site')}>
          <Select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-48">
            <option value="all">{t('common.allSites')}</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        {saved && <span className="pb-2 text-xs text-muted">{t('compta.drm.lastSaved', { date: new Date(saved.savedAt).toLocaleDateString(intl) })}</span>}
      </div>

      <Table>
        <thead>
          <tr>
            <Th />
            {DRM_CATEGORIES.map((c) => (
              <Th key={c} right>
                {t(`compta.drm.cat.${c}`)}
              </Th>
            ))}
            <Th right>{t('common.total')}</Th>
          </tr>
        </thead>
        <tbody>
          {LINES.map((l) => {
            const total = sumQty(rows.map(l.pick));
            return (
              <tr key={l.key} className={cx(l.strong && 'bg-surface-2/50 font-medium')}>
                <Td className={cx(l.indent && 'pl-7 text-muted')}>{t(`compta.drm.line.${l.key}`)}</Td>
                {rows.map((r) => {
                  const q = l.pick(r);
                  return (
                    <Td key={r.category} right>
                      {nf.format(q.bottles)} <span className="text-xs text-muted">{t('compta.drm.btl')}</span>
                      <div className="text-xs text-muted">{nf.format(q.hl)} hl</div>
                    </Td>
                  );
                })}
                <Td right>
                  {nf.format(total.bottles)} <span className="text-xs text-muted">{t('compta.drm.btl')}</span>
                  <div className="text-xs text-muted">{nf.format(total.hl)} hl</div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </>
  );
}
