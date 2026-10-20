import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Truck } from 'lucide-react';
import { useCollection } from '@/app/org';
import { useI18n } from '@/i18n';
import { Badge, Button, EmptyState, Field, Input, PageHeader, Select, Spinner, Stat, Table, Td, Th } from '@/ui';
import type { PurchaseInvoice } from '@/types';
import { dateFr, eur } from '@/lib/utils';
import { InvoiceDetail } from './InvoiceDetail';
import { STATUS_TONE } from './status';

type StatusFilter = 'all' | PurchaseInvoice['status'];

export default function InvoiceList() {
  const { t, intl } = useI18n();
  const nav = useNavigate();
  const { rows, loading } = useCollection<PurchaseInvoice>('purchaseInvoices');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [supplier, setSupplier] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const suppliers = useMemo(() => [...new Set(rows.map((r) => r.supplierName))].sort((a, b) => a.localeCompare(b)), [rows]);
  const filtered = useMemo(
    () =>
      rows
        .filter((r) => (status === 'all' || r.status === status) && (supplier === 'all' || r.supplierName === supplier) && (!from || r.date >= from) && (!to || r.date <= to))
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [rows, status, supplier, from, to],
  );
  const totalHT = filtered.reduce((n, r) => n + r.totalHT, 0);
  const totalTTC = filtered.reduce((n, r) => n + r.totalTTC, 0);
  const due = filtered.filter((r) => r.status === 'received').reduce((n, r) => n + r.totalTTC, 0);
  const money = (n: number) => eur(n, 'EUR', intl);
  const open = rows.find((r) => r.id === openId);

  return (
    <div>
      <PageHeader
        title={t('achats.title')}
        subtitle={t('achats.subtitle')}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => nav('nouveau')}>
            {t('achats.new')}
          </Button>
        }
      />
      {loading ? (
        <div className="grid min-h-40 place-items-center">
          <Spinner className="size-7" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Truck className="size-8" />}
          title={t('achats.empty')}
          hint={t('achats.emptyHint')}
          action={
            <Link to="nouveau" className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-fg">
              {t('achats.new')}
            </Link>
          }
        />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label={t('achats.stat.count')} value={filtered.length} />
            <Stat label={t('achats.stat.ht')} value={money(totalHT)} sub={`${money(totalTTC)} ${t('common.ttc')}`} />
            <Stat label={t('achats.stat.due')} value={money(due)} tone={due > 0 ? 'warn' : undefined} />
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label={t('common.status')}>
              <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                <option value="all">{t('common.all')}</option>
                {(['draft', 'received', 'paid'] as const).map((s) => (
                  <option key={s} value={s}>
                    {t(`achats.status.${s}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('achats.f.supplier')}>
              <Select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                <option value="all">{t('common.all')}</option>
                {suppliers.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Field label={t('achats.filter.from')}>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label={t('achats.filter.to')}>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          {filtered.length === 0 ? (
            <EmptyState title={t('achats.noMatch')} />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t('common.date')}</Th>
                  <Th>{t('achats.f.supplier')}</Th>
                  <Th>{t('achats.f.number')}</Th>
                  <Th>{t('common.status')}</Th>
                  <Th right>{t('common.ht')}</Th>
                  <Th right>{t('common.ttc')}</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-surface-2/60 focus-within:bg-surface-2/60" onClick={() => setOpenId(r.id)}>
                    <Td>{dateFr(r.date, intl)}</Td>
                    <Td>
                      <button type="button" className="text-left font-medium hover:text-brand focus-visible:outline-2 focus-visible:outline-brand" onClick={() => setOpenId(r.id)}>
                        {r.supplierName}
                      </button>
                    </Td>
                    <Td>{r.number}</Td>
                    <Td>
                      <Badge tone={STATUS_TONE[r.status]}>{t(`achats.status.${r.status}`)}</Badge>
                    </Td>
                    <Td right>{money(r.totalHT)}</Td>
                    <Td right>{money(r.totalTTC)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}
      {open && <InvoiceDetail invoice={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}
