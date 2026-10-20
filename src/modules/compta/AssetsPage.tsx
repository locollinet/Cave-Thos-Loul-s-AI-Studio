import { useMemo, useState } from 'react';
import { Landmark, Pencil, Plus, Table2, Trash2 } from 'lucide-react';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { dateFr, eur, round2, today, uid } from '@/lib/utils';
import { Button, EmptyState, Field, Input, Modal, NumberInput, PageHeader, Select, Spinner, Stat, Table, Td, Th, useToast } from '@/ui';
import { ASSET_CATEGORIES } from './accounts';
import { depreciationSchedule, netBookValue, totalDepreciationForYear } from './assets';
import YearSelect from './Shared';
import type { Asset, AssetCategory } from './types';
import { currentYear, useCompta } from './useCompta';

const blank = (): Asset => ({
  id: uid(),
  name: '',
  category: 'materiel',
  purchaseDate: today(),
  amountHT: 0,
  vatAmount: 0,
  durationYears: 5,
  startDepreciationDate: today(),
  createdAt: Date.now(),
});

export default function AssetsPage() {
  const { t, intl } = useI18n();
  const { org, commit, path } = useOrg();
  const data = useCompta();
  const { toast, confirm } = useToast();
  const [year, setYear] = useState(currentYear());
  const [edit, setEdit] = useState<Asset | null>(null);
  const [view, setView] = useState<Asset | null>(null);
  const f = (n: number) => eur(n, org.currency, intl);
  const totals = useMemo(
    () => ({
      cost: round2(data.assets.reduce((s, a) => s + a.amountHT, 0)),
      dot: totalDepreciationForYear(data.assets, year),
      nbv: round2(data.assets.reduce((s, a) => s + netBookValue(a, year), 0)),
    }),
    [data.assets, year],
  );

  const save = async () => {
    if (!edit || !edit.name.trim() || !(edit.amountHT > 0) || edit.durationYears < 1) return;
    try {
      const payload = { ...edit, name: edit.name.trim(), durationYears: Math.round(edit.durationYears) };
      await commit([{ op: 'set', path: path('assets', edit.id), data: payload as never }]);
      toast(t('common.saved'));
      setEdit(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    }
  };

  const remove = async (a: Asset) => {
    if (!(await confirm({ title: t('common.confirmDelete'), danger: true, confirmLabel: t('common.delete') }))) return;
    try {
      await commit([{ op: 'delete', path: path('assets', a.id) }]);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    }
  };

  if (data.loading) return <Spinner className="mx-auto mt-20" />;

  return (
    <>
      <PageHeader
        title={t('compta.assets.title')}
        subtitle={t('compta.assets.subtitle')}
        actions={
          <>
            <YearSelect value={year} onChange={setYear} />
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEdit(blank())}>
              {t('compta.assets.new')}
            </Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label={t('compta.assets.cost')} value={f(totals.cost)} />
        <Stat label={t('compta.assets.dotation', { year })} value={f(totals.dot)} />
        <Stat label={t('compta.assets.nbv', { year })} value={f(totals.nbv)} />
      </div>

      {data.assets.length === 0 ? (
        <EmptyState icon={<Landmark className="size-8" />} title={t('compta.assets.empty')} hint={t('compta.assets.emptyHint')} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t('common.name')}</Th>
              <Th>{t('compta.assets.purchaseDate')}</Th>
              <Th right>{t('compta.amountHT')}</Th>
              <Th right>{t('compta.assets.duration')}</Th>
              <Th right>{t('compta.assets.dotation', { year })}</Th>
              <Th right>{t('compta.assets.nbv', { year })}</Th>
              <Th className="w-28" />
            </tr>
          </thead>
          <tbody>
            {data.assets.map((a) => (
              <tr key={a.id}>
                <Td>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-xs text-muted">{t(`compta.assetCat.${a.category}`)}</div>
                </Td>
                <Td>{dateFr(a.purchaseDate, intl)}</Td>
                <Td right>{f(a.amountHT)}</Td>
                <Td right>{a.durationYears}</Td>
                <Td right>{f(depreciationSchedule(a).find((r) => r.year === year)?.dotation ?? 0)}</Td>
                <Td right>{f(netBookValue(a, year))}</Td>
                <Td>
                  <div className="flex">
                    <button type="button" aria-label={t('compta.assets.schedule')} onClick={() => setView(a)} className="rounded-md p-1.5 text-muted hover:bg-surface-2">
                      <Table2 className="size-4" />
                    </button>
                    <button type="button" aria-label={t('common.edit')} onClick={() => setEdit(a)} className="rounded-md p-1.5 text-muted hover:bg-surface-2">
                      <Pencil className="size-4" />
                    </button>
                    <button type="button" aria-label={t('common.delete')} onClick={() => remove(a)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-bad">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={t('compta.assets.edit')}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={save} disabled={!edit?.name.trim() || !(edit.amountHT > 0)}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('common.name')} className="sm:col-span-2">
              <Input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label={t('compta.assets.category')}>
              <Select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value as AssetCategory })}>
                {ASSET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`compta.assetCat.${c}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('compta.assets.duration')}>
              <NumberInput min={1} step={1} value={edit.durationYears} onChange={(v) => setEdit({ ...edit, durationYears: v ?? 1 })} />
            </Field>
            <Field label={t('compta.assets.purchaseDate')}>
              <Input type="date" value={edit.purchaseDate} onChange={(e) => setEdit({ ...edit, purchaseDate: e.target.value, startDepreciationDate: edit.startDepreciationDate === edit.purchaseDate ? e.target.value : edit.startDepreciationDate })} />
            </Field>
            <Field label={t('compta.assets.startDate')}>
              <Input type="date" value={edit.startDepreciationDate} onChange={(e) => setEdit({ ...edit, startDepreciationDate: e.target.value })} />
            </Field>
            <Field label={t('compta.amountHT')}>
              <NumberInput min={0} step="0.01" value={edit.amountHT} onChange={(v) => setEdit({ ...edit, amountHT: v ?? 0 })} />
            </Field>
            <Field label={t('compta.amountVAT')}>
              <NumberInput min={0} step="0.01" value={edit.vatAmount} onChange={(v) => setEdit({ ...edit, vatAmount: v ?? 0 })} />
            </Field>
          </div>
        )}
      </Modal>

      <Modal open={!!view} onClose={() => setView(null)} title={view ? `${t('compta.assets.schedule')} — ${view.name}` : ''} footer={<Button onClick={() => setView(null)}>{t('common.close')}</Button>}>
        {view && (
          <Table>
            <thead>
              <tr>
                <Th>{t('compta.year')}</Th>
                <Th right>{t('compta.assets.dotationShort')}</Th>
                <Th right>{t('compta.assets.cumul')}</Th>
                <Th right>{t('compta.assets.nbvShort')}</Th>
              </tr>
            </thead>
            <tbody>
              {depreciationSchedule(view).map((r) => (
                <tr key={r.year}>
                  <Td>{r.year}</Td>
                  <Td right>{f(r.dotation)}</Td>
                  <Td right>{f(r.cumul)}</Td>
                  <Td right>{f(r.vnc)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Modal>
    </>
  );
}
