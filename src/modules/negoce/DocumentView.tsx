import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote, FilePlus2, FileText, Pencil, Printer, Send, Truck } from 'lucide-react';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { dateFr, eur } from '@/lib/utils';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, cx } from '@/ui';
import { balanceDue, paidAmount } from './calc';
import DocumentSheet from './DocumentSheet';
import PaymentModal from './PaymentModal';
import StatusBadge from './StatusBadge';
import { isLocked, useDocActions } from './useDocActions';
import { useSales } from './useSales';

export default function DocumentView() {
  const { id = '' } = useParams();
  const { t, intl } = useI18n();
  const { org } = useOrg();
  const { docs, payments, loading } = useSales();
  const actions = useDocActions();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [viewMode, setViewMode] = useState<'doc' | 'bl'>('doc');
  const doc = docs.find((d) => d.id === id);

  if (loading) return <Spinner className="mx-auto mt-20" />;
  if (!doc) return <EmptyState title={t('negoce.notFound')} action={<Button onClick={() => navigate('/negoce')}>{t('common.back')}</Button>} />;

  const paid = paidAmount(doc.id, payments);
  const balance = balanceDue(doc, payments, docs);
  const related = docs.find((d) => d.id === doc.relatedDocumentId);
  const credits = docs.filter((d) => d.type === 'credit_note' && d.relatedDocumentId === doc.id);
  const myPayments = payments.filter((p) => p.documentId === doc.id);
  const editable = !isLocked(doc);

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={`${t(`negoce.doc.${doc.type}`)} ${doc.number}`}
          subtitle={doc.partnerName}
          actions={
            <>
              <Link to="/negoce" className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-muted hover:bg-surface-2">
                <ArrowLeft className="size-4" />
                {t('common.back')}
              </Link>
              <StatusBadge status={doc.status} overdue={doc.type === 'invoice' && doc.status === 'validated' && balance > 0 && doc.dueDate < new Date().toISOString().slice(0, 10)} />
              {editable && (
                <Button icon={<Pencil className="size-4" />} onClick={() => navigate(`/negoce/edit/${doc.id}`)}>
                  {t('common.edit')}
                </Button>
              )}
              {doc.type === 'quote' && doc.status === 'draft' && (
                <Button icon={<Send className="size-4" />} onClick={() => actions.setStatus(doc, 'sent')}>
                  {t('negoce.markSent')}
                </Button>
              )}
              {doc.type === 'quote' && doc.status !== 'accepted' && (
                <Button variant="primary" icon={<FileText className="size-4" />} onClick={() => actions.convertToInvoice(doc)}>
                  {t('negoce.convertToInvoice')}
                </Button>
              )}
              {doc.type === 'invoice' && doc.status !== 'draft' && doc.status !== 'cancelled' && (
                <Button icon={<FilePlus2 className="size-4" />} onClick={() => actions.createCreditNote(doc)}>
                  {t('negoce.createCreditNote')}
                </Button>
              )}
              {doc.type === 'invoice' && doc.status === 'validated' && balance > 0 && (
                <Button variant="primary" icon={<Banknote className="size-4" />} onClick={() => setPaying(true)}>
                  {t('negoce.addPayment')}
                </Button>
              )}
              <Button variant={editable ? 'secondary' : 'primary'} icon={<Printer className="size-4" />} onClick={() => window.print()}>
                {t('negoce.printPdf')}
              </Button>
            </>
          }
        />

        {(myPayments.length > 0 || credits.length > 0 || doc.status === 'cancelled') && doc.type === 'invoice' && (
          <Card className="mb-4 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span>
                {t('negoce.alreadyPaid')} : <strong className="tabular">{eur(paid, org.currency, intl)}</strong>
              </span>
              <span>
                {t('negoce.balance')} : <strong className="tabular">{eur(balance, org.currency, intl)}</strong>
              </span>
              {credits.map((c) => (
                <Link key={c.id} to={`/negoce/view/${c.id}`} className="text-brand underline">
                  {c.number || t('negoce.doc.credit_note')}
                </Link>
              ))}
            </div>
            {myPayments.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-muted">
                {myPayments.map((p) => (
                  <li key={p.id}>
                    {dateFr(p.date, intl)} · {eur(p.amount, org.currency, intl)} · {t(`negoce.method.${p.method}`)} {p.reference}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {isLocked(doc) && doc.type !== 'quote' && <Badge tone="info" className="mb-3">{t('negoce.locked')}</Badge>}

        {/* Sélecteur de vue : Facture / Devis vs Bon de Livraison (BL) */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode('doc')}
              className={cx(
                'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer',
                viewMode === 'doc'
                  ? 'bg-brand text-brand-fg shadow-xs font-semibold'
                  : 'border border-border bg-surface text-muted hover:border-brand/40 hover:text-ink',
              )}
            >
              <FileText className="size-3.5" />
              <span>{t(`negoce.doc.${doc.type}`)}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('bl')}
              className={cx(
                'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition cursor-pointer',
                viewMode === 'bl'
                  ? 'bg-brand text-brand-fg shadow-xs font-semibold'
                  : 'border border-border bg-surface text-muted hover:border-brand/40 hover:text-ink',
              )}
            >
              <Truck className="size-3.5" />
              <span>Bon de Livraison (BL &amp; Expédition)</span>
            </button>
          </div>
          <span className="text-xs text-muted hidden sm:inline">
            {viewMode === 'bl' ? 'Logistique : détail des colis & signature sans marges' : 'Comptabilité : montants HT, TVA et conditions'}
          </span>
        </div>
      </div>

      <DocumentSheet doc={doc} org={org} relatedNumber={related?.number} paid={paid} variant={viewMode === 'bl' ? 'bl' : 'document'} />
      <PaymentModal invoice={paying ? doc : null} balance={balance} onClose={() => setPaying(false)} />
    </>
  );
}
