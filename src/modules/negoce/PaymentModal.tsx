import { useState } from 'react';
import { useOrg } from '@/app/org';
import { useT } from '@/i18n';
import { today } from '@/lib/utils';
import { Button, Field, Input, Modal, NumberInput, Select, useToast } from '@/ui';
import { addPaymentOps, newPayment } from './ops';
import type { Payment, PaymentMethod, SaleDocument } from './types';
import { useSales } from './useSales';

export const METHODS: PaymentMethod[] = ['virement', 'cheque', 'carte', 'especes', 'prelevement', 'autre'];

interface Props {
  invoice: SaleDocument | null;
  balance: number;
  onClose: () => void;
}

export default function PaymentModal({ invoice, balance, onClose }: Props) {
  const t = useT();
  const { orgId, commit } = useOrg();
  const { payments, docs } = useSales();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);
  const p = draft && invoice && draft.documentId === invoice.id ? draft : invoice ? newPayment(invoice.id, today(), balance) : null;
  const set = (patch: Partial<Payment>) => p && setDraft({ ...p, ...patch });

  const close = () => {
    setDraft(null);
    onClose();
  };

  const submit = async () => {
    if (!p || !invoice || !(p.amount > 0)) return;
    setBusy(true);
    try {
      await commit(addPaymentOps(orgId, p, invoice, payments, docs));
      toast(t('common.saved'));
      close();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!invoice}
      onClose={close}
      title={t('negoce.addPayment')}
      size="sm"
      footer={
        <>
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={!p || !(p.amount > 0)} onClick={submit}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      {p && (
        <div className="grid gap-3">
          <p className="text-sm text-muted">
            {invoice?.number} — {invoice?.partnerName}
          </p>
          <Field label={t('negoce.amount')}>
            <NumberInput min={0} step="0.01" value={p.amount} onChange={(v) => set({ amount: v ?? 0 })} autoFocus />
          </Field>
          <Field label={t('common.date')}>
            <Input type="date" value={p.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label={t('negoce.method')}>
            <Select value={p.method} onChange={(e) => set({ method: e.target.value as PaymentMethod })}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`negoce.method.${m}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('negoce.reference')}>
            <Input value={p.reference} onChange={(e) => set({ reference: e.target.value })} />
          </Field>
        </div>
      )}
    </Modal>
  );
}
