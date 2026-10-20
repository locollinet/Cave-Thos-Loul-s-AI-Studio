import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Mail, Trash2 } from 'lucide-react';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { dateFr, eur, today } from '@/lib/utils';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, Stat, Table, Td, Th, useToast } from '@/ui';
import { agingSummary, remindersToSend, unpaidInvoices } from './calc';
import { deletePaymentOps } from './ops';
import PaymentModal from './PaymentModal';
import { useReminders } from './useReminders';
import type { AgingRow } from './types';
import { useSales } from './useSales';

export default function PaymentsPage() {
  const { t, intl } = useI18n();
  const { org, orgId, commit } = useOrg();
  const rem = useReminders();
  const { docs, payments, loading } = useSales();
  const { toast, confirm } = useToast();
  const [paying, setPaying] = useState<AgingRow | null>(null);
  const asOf = today();
  const f = (n: number) => eur(n, org.currency, intl);
  const rows = useMemo(() => unpaidInvoices(docs, payments, asOf), [docs, payments, asOf]);
  const aging = useMemo(() => agingSummary(rows), [rows]);
  const reminders = useMemo(() => remindersToSend(rows), [rows]);
  const sortedPayments = useMemo(() => [...payments].sort((a, b) => b.date.localeCompare(a.date)), [payments]);

  const mailto = (r: AgingRow) => rem.mail(r.doc, r.balance, rem.defaultLang, r.daysLate);

  const removePayment = async (id: string) => {
    const p = payments.find((x) => x.id === id);
    if (!p || !(await confirm({ title: t('common.confirmDelete'), danger: true, confirmLabel: t('common.delete') }))) return;
    try {
      await commit(deletePaymentOps(orgId, p, docs.find((d) => d.id === p.documentId), payments, docs));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    }
  };

  if (loading) return <Spinner className="mx-auto mt-20" />;

  return (
    <>
      <PageHeader title={t('negoce.payments')} subtitle={t('negoce.paymentsSubtitle')} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label={t('negoce.aging.current')} value={f(aging.current)} />
        <Stat label={t('negoce.aging.0_30')} value={f(aging.d0_30)} tone={aging.d0_30 > 0 ? 'warn' : undefined} />
        <Stat label={t('negoce.aging.30_60')} value={f(aging.d30_60)} tone={aging.d30_60 > 0 ? 'warn' : undefined} />
        <Stat label={t('negoce.aging.60plus')} value={f(aging.d60plus)} tone={aging.d60plus > 0 ? 'bad' : undefined} />
        <Stat label={t('negoce.aging.total')} value={f(aging.total)} />
      </div>

      <h2 className="mb-2 font-display text-lg font-semibold">{t('negoce.unpaidInvoices')}</h2>
      {rows.length === 0 ? (
        <EmptyState title={t('negoce.noUnpaid')} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t('negoce.number')}</Th>
              <Th>{t('negoce.client')}</Th>
              <Th>{t('negoce.dueDate')}</Th>
              <Th right>{t('negoce.balance')}</Th>
              <Th>{t('common.actions')}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const m = mailto(r);
              return (
                <tr key={r.doc.id}>
                  <Td>
                    <Link to={`/negoce/view/${r.doc.id}`} className="font-medium text-brand hover:underline">
                      {r.doc.number}
                    </Link>
                  </Td>
                  <Td>{r.doc.partnerName}</Td>
                  <Td>
                    {dateFr(r.doc.dueDate, intl)} {r.daysLate > 0 && <Badge tone="bad">{t('negoce.daysLate', { n: r.daysLate })}</Badge>}
                  </Td>
                  <Td right>{f(r.balance)}</Td>
                  <Td>
                    <div className="flex gap-1.5">
                      <Button size="sm" icon={<Banknote className="size-3.5" />} onClick={() => setPaying(r)}>
                        {t('negoce.addPayment')}
                      </Button>
                      {r.daysLate > 0 && (
                        <a href={m.href} onClick={() => rem.record(r.doc)} title={m.email ? undefined : t('negoce.remind.noEmail')} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[13px] hover:bg-surface-2">
                          <Mail className="size-3.5" />
                          {t('negoce.remind')}
                        </a>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <h2 className="mb-2 mt-8 font-display text-lg font-semibold">{t('negoce.reminders')}</h2>
      {reminders.length === 0 ? (
        <p className="text-sm text-muted">{t('negoce.noReminders')}</p>
      ) : (
        <Card className="divide-y divide-border">
          {reminders.map((r) => (
            <div key={r.doc.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span>
                <strong>{r.doc.partnerName}</strong> — {r.doc.number}
              </span>
              <span className="text-muted">{t('negoce.daysLate', { n: r.daysLate })} · {f(r.balance)}</span>
            </div>
          ))}
        </Card>
      )}

      <h2 className="mb-2 mt-8 font-display text-lg font-semibold">{t('negoce.paymentHistory')}</h2>
      {sortedPayments.length === 0 ? (
        <p className="text-sm text-muted">{t('negoce.noPayments')}</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t('common.date')}</Th>
              <Th>{t('negoce.number')}</Th>
              <Th>{t('negoce.method')}</Th>
              <Th>{t('negoce.reference')}</Th>
              <Th right>{t('negoce.amount')}</Th>
              <Th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {sortedPayments.map((p) => (
              <tr key={p.id}>
                <Td>{dateFr(p.date, intl)}</Td>
                <Td>{docs.find((d) => d.id === p.documentId)?.number}</Td>
                <Td>{t(`negoce.method.${p.method}`)}</Td>
                <Td>{p.reference}</Td>
                <Td right>{f(p.amount)}</Td>
                <Td>
                  <button type="button" aria-label={t('common.delete')} onClick={() => removePayment(p.id)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-bad">
                    <Trash2 className="size-4" />
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <PaymentModal invoice={paying?.doc ?? null} balance={paying?.balance ?? 0} onClose={() => setPaying(null)} />
    </>
  );
}
