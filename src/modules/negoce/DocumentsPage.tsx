import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BellRing, FilePlus2, FileText, Trash2, Zap } from 'lucide-react';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { dateFr, eur, today } from '@/lib/utils';
import { norm } from '@/lib/wine';
import { Button, EmptyState, PageHeader, SearchInput, Segmented, Spinner, Stat, Table, Td, Th } from '@/ui';
import { balanceDue, salesKpis } from './calc';
import { QuickSaleModal } from './QuickSaleModal';
import RemindersPanel, { reminderCount } from './RemindersPanel';
import StatusBadge from './StatusBadge';
import { isLocked, useDocActions } from './useDocActions';
import { useSales } from './useSales';
import type { DocType } from './types';

export default function DocumentsPage() {
  const { t, intl } = useI18n();
  const { org } = useOrg();
  const { docs, payments, loading } = useSales();
  const actions = useDocActions();
  const navigate = useNavigate();
  const [quickSaleOpen, setQuickSaleOpen] = useState(false);
  const [sp, setSp] = useSearchParams();
  const view = sp.get('view');
  const type: DocType | 'all' | 'remind' = view === 'quote' || view === 'invoice' || view === 'credit_note' || view === 'remind' ? view : 'all';
  const setType = (v: DocType | 'all' | 'remind') => setSp(v === 'all' ? {} : { view: v }, { replace: true });
  const [q, setQ] = useState('');
  const asOf = today();
  const f = (n: number) => eur(n, org.currency, intl);
  const kpis = useMemo(() => salesKpis(docs, payments, asOf), [docs, payments, asOf]);
  const toRemind = useMemo(() => reminderCount(docs, payments, asOf), [docs, payments, asOf]);
  const rows = useMemo(() => {
    const n = norm(q);
    return docs.filter((d) => (type === 'all' || d.type === type) && (!n || norm(`${d.number} ${d.partnerName}`).includes(n)));
  }, [docs, type, q]);

  return (
    <>
      <PageHeader
        title={t('negoce.tab.documents')}
        subtitle={t('negoce.documentsSubtitle')}
        actions={
          <>
            <Button variant="secondary" icon={<Zap className="size-4 text-accent" />} onClick={() => setQuickSaleOpen(true)}>
              Vente comptoir
            </Button>
            <Button icon={<FileText className="size-4" />} onClick={() => navigate('/negoce/edit/new?type=quote')}>
              {t('negoce.newQuote')}
            </Button>
            <Button variant="primary" icon={<FilePlus2 className="size-4" />} onClick={() => navigate('/negoce/edit/new?type=invoice')}>
              {t('negoce.newInvoice')}
            </Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('negoce.kpi.month')} value={f(kpis.monthRevenueHT)} sub={t('common.ht')} />
        <Stat label={t('negoce.kpi.quotes')} value={kpis.openQuotes} sub={f(kpis.openQuotesTotalHT) + ' ' + t('common.ht')} />
        <Stat label={t('negoce.kpi.unpaid')} value={f(kpis.unpaidTotal)} sub={t('common.ttc')} />
        <Stat label={t('negoce.kpi.overdue')} value={f(kpis.overdueTotal)} tone={kpis.overdueTotal > 0 ? 'bad' : undefined} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented<DocType | 'all' | 'remind'>
          value={type}
          onChange={setType}
          options={[
            { value: 'all', label: t('common.all') },
            { value: 'quote', label: t('negoce.doc.quotes') },
            { value: 'invoice', label: t('negoce.doc.invoices') },
            { value: 'credit_note', label: t('negoce.doc.credit_notes') },
            {
              value: 'remind',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <BellRing className="size-3.5" aria-hidden />
                  {t('negoce.remind.tab')}
                  {toRemind > 0 && <span className="rounded-full bg-bad/15 px-1.5 text-[11px] font-semibold text-bad">{toRemind}</span>}
                </span>
              ),
            },
          ]}
        />
        {type !== 'remind' && <SearchInput value={q} onChange={setQ} placeholder={t('negoce.searchDocs')} className="min-w-48 flex-1 sm:max-w-xs" />}
      </div>

      {loading ? (
        <Spinner className="mx-auto mt-12" />
      ) : type === 'remind' ? (
        <RemindersPanel docs={docs} payments={payments} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<FileText className="size-8" />} title={t('negoce.empty')} hint={t('negoce.emptyHint')} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t('negoce.number')}</Th>
              <Th>{t('negoce.client')}</Th>
              <Th>{t('common.date')}</Th>
              <Th right>{t('negoce.totalTTC')}</Th>
              <Th right>{t('negoce.balance')}</Th>
              <Th>{t('common.status')}</Th>
              <Th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const bal = balanceDue(d, payments, docs);
              const go = () => navigate(isLocked(d) || d.type === 'quote' ? `/negoce/view/${d.id}` : `/negoce/edit/${d.id}`);
              return (
                <tr
                  key={d.id}
                  tabIndex={0}
                  onClick={go}
                  onKeyDown={(e) => e.key === 'Enter' && go()}
                  className="cursor-pointer hover:bg-surface-2/60 focus-visible:bg-surface-2/60 focus-visible:outline-none"
                >
                  <Td>
                    <div className="font-medium">{d.number || t('negoce.status.draft')}</div>
                    <div className="text-xs text-muted">{t(`negoce.doc.${d.type}`)}</div>
                  </Td>
                  <Td>{d.partnerName}</Td>
                  <Td>{dateFr(d.date, intl)}</Td>
                  <Td right>{f(d.type === 'credit_note' ? -d.totalTTC : d.totalTTC)}</Td>
                  <Td right>{d.type === 'invoice' && bal > 0 ? f(bal) : ''}</Td>
                  <Td>
                    <StatusBadge status={d.status} overdue={d.type === 'invoice' && d.status === 'validated' && bal > 0 && d.dueDate < asOf} />
                  </Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    {(d.status === 'draft' || (d.type === 'quote' && d.status !== 'accepted')) && (
                      <button type="button" aria-label={t('common.delete')} onClick={() => actions.remove(d)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-bad">
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <QuickSaleModal open={quickSaleOpen} onClose={() => setQuickSaleOpen(false)} />
    </>
  );
}
