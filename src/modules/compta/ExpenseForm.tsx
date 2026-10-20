import { useState } from 'react';
import { useOrg } from '@/app/org';
import { useT } from '@/i18n';
import { round2, today, uid } from '@/lib/utils';
import { Button, Field, Input, Modal, NumberInput, Select, useToast } from '@/ui';
import type { Asset, Expense, ExpenseCategory, PaymentMethodExp } from './types';

export const EXPENSE_METHODS: PaymentMethodExp[] = ['a_payer', 'virement', 'cheque', 'carte', 'especes', 'prelevement'];
const RATES = [0, 2.1, 5.5, 10, 20];

export const blankExpense = (category: string): Expense => ({
  id: uid(),
  date: today(),
  provider: '',
  category,
  description: '',
  amountHT: 0,
  amountTVA: 0,
  amountTTC: 0,
  paymentMethod: 'virement',
  createdAt: Date.now(),
});

interface Props {
  expense: Expense | null;
  categories: ExpenseCategory[];
  assets: Asset[];
  onClose: () => void;
}

export default function ExpenseForm({ expense, categories, assets, onClose }: Props) {
  const t = useT();
  const { commit, path } = useOrg();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Expense | null>(null);
  const [busy, setBusy] = useState(false);
  const e = draft && expense && draft.id === expense.id ? draft : expense;

  const set = (patch: Partial<Expense>) => {
    if (!e) return;
    const next = { ...e, ...patch };
    next.amountTTC = round2(next.amountHT + next.amountTVA);
    setDraft(next);
  };
  const setHT = (ht: number, rate?: number) => {
    const r = rate ?? (e && e.amountHT > 0 ? Math.round((e.amountTVA / e.amountHT) * 1000) / 10 : 20);
    set({ amountHT: ht, amountTVA: round2((ht * r) / 100) });
  };

  const close = () => {
    setDraft(null);
    onClose();
  };

  const submit = async () => {
    if (!e || !e.date || !(e.amountHT > 0)) return;
    setBusy(true);
    try {
      const data = Object.fromEntries(Object.entries({ ...e, provider: e.provider.trim() }).filter(([, v]) => v !== undefined));
      await commit([{ op: 'set', path: path('expenses', e.id), data }]);
      toast(t('common.saved'));
      close();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('common.error'), 'bad');
    } finally {
      setBusy(false);
    }
  };

  const rate = e && e.amountHT > 0 ? Math.round((e.amountTVA / e.amountHT) * 1000) / 10 : 20;

  return (
    <Modal
      open={!!expense}
      onClose={close}
      title={t('compta.expenses.edit')}
      footer={
        <>
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={!e || !(e.amountHT > 0) || !e.category} onClick={submit}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      {e && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('common.date')}>
            <Input type="date" value={e.date} onChange={(ev) => set({ date: ev.target.value })} />
          </Field>
          <Field label={t('compta.expenses.provider')}>
            <Input value={e.provider} onChange={(ev) => set({ provider: ev.target.value })} />
          </Field>
          <Field label={t('compta.expenses.category')}>
            <Select value={e.category} onChange={(ev) => set({ category: ev.target.value })}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.account})
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('compta.expenses.payment')}>
            <Select value={e.paymentMethod} onChange={(ev) => set({ paymentMethod: ev.target.value as PaymentMethodExp })}>
              {EXPENSE_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`compta.pay.${m}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.notes')} className="sm:col-span-2">
            <Input value={e.description} onChange={(ev) => set({ description: ev.target.value })} />
          </Field>
          <Field label={t('compta.amountHT')}>
            <NumberInput min={0} step="0.01" value={e.amountHT} onChange={(v) => setHT(v ?? 0)} />
          </Field>
          <Field label={t('compta.vatRate')}>
            <Select value={RATES.includes(rate) ? rate : 'other'} onChange={(ev) => ev.target.value !== 'other' && setHT(e.amountHT, Number(ev.target.value))}>
              {RATES.map((r) => (
                <option key={r} value={r}>
                  {r} %
                </option>
              ))}
              {!RATES.includes(rate) && <option value="other">{rate} %</option>}
            </Select>
          </Field>
          <Field label={t('compta.amountVAT')}>
            <NumberInput min={0} step="0.01" value={e.amountTVA} onChange={(v) => set({ amountTVA: v ?? 0 })} />
          </Field>
          <Field label={t('compta.amountTTC')}>
            <Input readOnly value={e.amountTTC.toFixed(2)} />
          </Field>
          {assets.length > 0 && (
            <Field label={t('compta.expenses.asset')} hint={t('compta.expenses.assetHint')} className="sm:col-span-2">
              <Select value={e.assetId ?? ''} onChange={(ev) => set({ assetId: ev.target.value || undefined })}>
                <option value="">—</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
}
