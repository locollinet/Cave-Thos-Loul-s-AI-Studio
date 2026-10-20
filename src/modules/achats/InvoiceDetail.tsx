import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Pencil, Trash2 } from 'lucide-react';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Badge, Button, Field, Input, Modal, Select, Table, Td, Th, useToast } from '@/ui';
import type { PurchaseInvoice } from '@/types';
import { dateFr, eur, today } from '@/lib/utils';
import { wineLabel } from '@/lib/wine';
import { PAYMENT_METHODS, STATUS_TONE } from './status';

export function InvoiceDetail({ invoice: inv, onClose }: { invoice: PurchaseInvoice; onClose: () => void }) {
  const { t, intl } = useI18n();
  const nav = useNavigate();
  const { toast, confirm } = useToast();
  const { commit, path, wines, sites } = useOrg();
  const [payDate, setPayDate] = useState(today());
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>('transfer');
  const [busy, setBusy] = useState(false);
  const money = (n: number) => eur(n, 'EUR', intl);

  const markPaid = async () => {
    setBusy(true);
    try {
      await commit([{ op: 'set', path: path('purchaseInvoices', inv.id), data: { status: 'paid', paymentDate: payDate, paymentMethod: t(`achats.pay.${method}`) }, merge: true }]);
      toast(t('achats.paidDone'));
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: t('achats.deleteTitle'), message: t('achats.deleteMsg'), confirmLabel: t('common.delete'), danger: true }))) return;
    await commit([{ op: 'delete', path: path('purchaseInvoices', inv.id) }]);
    onClose();
  };

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title={`${inv.supplierName} · ${inv.number}`}
      footer={
        inv.status === 'draft' ? (
          <>
            <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={remove}>
              {t('common.delete')}
            </Button>
            <Button variant="primary" icon={<Pencil className="size-4" />} onClick={() => nav(`${inv.id}/edit`)}>
              {t('achats.resume')}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <Badge tone={STATUS_TONE[inv.status]}>{t(`achats.status.${inv.status}`)}</Badge>
          <span>{dateFr(inv.date, intl)}</span>
          {inv.dueDate && <span>{t('achats.due', { date: dateFr(inv.dueDate, intl) })}</span>}
          {inv.siteId && <span>{sites.find((s) => s.id === inv.siteId)?.name}</span>}
          {inv.paymentDate && (
            <span>
              {t('achats.paidOn', { date: dateFr(inv.paymentDate, intl) })} · {inv.paymentMethod}
            </span>
          )}
        </div>

        <Table>
          <thead>
            <tr>
              <Th>{t('achats.line.wine')}</Th>
              <Th right>{t('common.qty')}</Th>
              <Th right>{t('achats.line.unitHT')}</Th>
              <Th right>{t('achats.line.vat')}</Th>
              <Th right>{t('common.ht')}</Th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => {
              const w = wines.find((x) => x.id === l.wineId);
              return (
                <tr key={i}>
                  <Td>
                    <div className="max-w-xs truncate">{w ? wineLabel(w) : l.description}</div>
                    {!l.received && inv.status !== 'draft' && <Badge tone="warn">{t('achats.line.noStock')}</Badge>}
                  </Td>
                  <Td right>{l.qty}</Td>
                  <Td right>{money(l.unitPriceHT)}</Td>
                  <Td right>{l.vatRate} %</Td>
                  <Td right>{money(l.qty * l.unitPriceHT)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>

        <dl className="ml-auto grid max-w-xs grid-cols-2 gap-y-1 text-sm">
          {inv.shippingHT ? (
            <>
              <dt className="text-muted">{t('achats.f.shipping')}</dt>
              <dd className="tabular text-right">{money(inv.shippingHT)}</dd>
            </>
          ) : null}
          <dt className="text-muted">{t('common.ht')}</dt>
          <dd className="tabular text-right">{money(inv.totalHT)}</dd>
          <dt className="text-muted">{t('achats.totals.vat')}</dt>
          <dd className="tabular text-right">{money(inv.totalVAT)}</dd>
          <dt className="font-semibold">{t('common.ttc')}</dt>
          <dd className="tabular text-right font-semibold">{money(inv.totalTTC)}</dd>
        </dl>

        {inv.status === 'received' && (
          <div className="rounded-xl border border-border bg-surface-2/50 p-4">
            <h3 className="mb-3 text-sm font-semibold">{t('achats.markPaid')}</h3>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label={t('achats.payDate')}>
                <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </Field>
              <Field label={t('achats.payMethod')}>
                <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t(`achats.pay.${m}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button variant="primary" icon={<BadgeCheck className="size-4" />} loading={busy} disabled={!payDate} onClick={markPaid}>
                {t('achats.markPaid')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
