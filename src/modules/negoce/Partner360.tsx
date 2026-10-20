import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FilePlus2, Mail, MapPin, Pencil, Phone, Sparkles } from 'lucide-react';
import type { Partner, PurchaseInvoice } from '@/types';
import { useCollection, useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { dateFr, eur, today } from '@/lib/utils';
import { wineLabel } from '@/lib/wine';
import { Badge, Button, Modal, Stat } from '@/ui';
import { customer360, supplier360 } from './customer360';
import { effectiveStatus } from './offers/calc';
import OfferStatusBadge from './offers/OfferStatusBadge';
import type { Offer } from './offers/types';
import StatusBadge from './StatusBadge';
import type { Consignment, Payment, SaleDocument } from './types';

const sectionTitle = 'mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted';

/** Fiche contact à 360° (tiroir latéral) : synthèse commerciale et financière selon les droits. */
export default function Partner360({ partner, onClose, onEdit }: { partner: Partner; onClose: () => void; onEdit: () => void }) {
  const { t } = useI18n();
  const { can, role, hasModule } = useOrg();
  const navigate = useNavigate();
  const finance = can('manager') || role === 'accountant';
  const sales = hasModule('negoce');
  const isClient = partner.kind === 'client';
  const address = [partner.address, [partner.postalCode, partner.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  return (
    <Modal
      open
      side
      size="lg"
      onClose={onClose}
      title={partner.name}
      footer={
        <>
          {isClient && sales && finance && (
            <>
              <Button size="sm" icon={<Sparkles className="size-3.5" />} onClick={() => navigate(`/negoce/offres/new?client=${partner.id}`)}>
                {t('c360.newOffer')}
              </Button>
              <Button size="sm" icon={<FilePlus2 className="size-3.5" />} onClick={() => navigate(`/negoce/edit/new?type=quote&client=${partner.id}`)}>
                {t('negoce.newQuote')}
              </Button>
            </>
          )}
          {can('staff') && (
            <Button size="sm" variant="primary" icon={<Pencil className="size-3.5" />} onClick={onEdit}>
              {t('common.edit')}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-6">
        <section aria-label={t('contacts.contact')} className="space-y-1.5 text-sm">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="brand">{t(isClient ? 'c360.client' : 'c360.supplier')}</Badge>
            {isClient && partner.customerType && <Badge>{t(partner.customerType === 'particulier' ? 'contacts.private' : 'contacts.pro')}</Badge>}
            {partner.discountPct ? <Badge tone="accent">−{partner.discountPct} %</Badge> : null}
            {partner.paymentTermsDays !== undefined && <Badge>{t('c360.terms', { n: partner.paymentTermsDays })}</Badge>}
          </div>
          {partner.contactName && <div className="font-medium">{partner.contactName}</div>}
          {partner.email && (
            <a href={`mailto:${partner.email}`} className="flex items-center gap-2 text-brand hover:underline">
              <Mail className="size-3.5" aria-hidden />
              {partner.email}
            </a>
          )}
          {partner.phone && (
            <a href={`tel:${partner.phone.replace(/\s/g, '')}`} className="flex items-center gap-2 hover:underline">
              <Phone className="size-3.5 text-muted" aria-hidden />
              {partner.phone}
            </a>
          )}
          {address && (
            <div className="flex items-center gap-2 text-muted">
              <MapPin className="size-3.5" aria-hidden />
              {address}
            </div>
          )}
          {partner.vatNumber && <div className="text-xs text-muted">TVA {partner.vatNumber}</div>}
        </section>

        {finance && (isClient ? <ClientFinance partner={partner} linkSales={sales} /> : <SupplierFinance partner={partner} />)}
        {!finance && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{t('c360.restricted')}</p>}

        <section>
          <h3 className={sectionTitle}>{t('common.notes')}</h3>
          {partner.notes ? <p className="whitespace-pre-line text-sm">{partner.notes}</p> : <p className="text-sm text-muted">{t('c360.noNotes')}</p>}
        </section>
      </div>
    </Modal>
  );
}

function ClientFinance({ partner, linkSales }: { partner: Partner; linkSales: boolean }) {
  const { t, intl } = useI18n();
  const { org, wines } = useOrg();
  const docs = useCollection<SaleDocument>('documents');
  const payments = useCollection<Payment>('payments');
  const consignments = useCollection<Consignment>('consignments');
  const offersQ = useCollection<Offer>('offers');
  const asOf = today();
  const f = (n: number) => eur(n, org.currency, intl);
  const k = useMemo(
    () => customer360(partner.id, docs.rows, payments.rows, asOf, { wines, consignments: consignments.rows }),
    [partner.id, docs.rows, payments.rows, asOf, wines, consignments.rows],
  );
  const offers = useMemo(() => offersQ.rows.filter((o) => o.partnerId === partner.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 5), [offersQ.rows, partner.id]);
  const consigned = consignments.rows.filter((c) => c.partnerId === partner.id && c.qty > 0);
  const doc = (d: SaleDocument) => (
    <>
      <span className="font-medium">{d.number || t('negoce.status.draft')}</span> <span className="text-muted">· {t(`negoce.doc.${d.type}`)}</span>
    </>
  );

  return (
    <>
      <section aria-label={t('c360.kpis')} className="grid grid-cols-2 gap-2">
        <Stat label={t('c360.revenue12m')} value={f(k.revenue12mHT)} sub={t('common.ht')} />
        <Stat label={t('c360.invoices')} value={k.invoiceCount} sub={t('c360.avgBasket', { amount: f(k.avgBasketHT) })} />
        <Stat label={t('c360.outstanding')} value={f(k.outstanding)} sub={t('common.ttc')} />
        <Stat label={t('c360.overdue')} value={f(k.overdue)} tone={k.overdue > 0 ? 'bad' : undefined} sub={t('common.ttc')} />
      </section>

      <section>
        <h3 className={sectionTitle}>{t('c360.lastDocs')}</h3>
        {k.lastDocs.length === 0 ? (
          <p className="text-sm text-muted">{t('c360.noDocs')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {k.lastDocs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm">
                {linkSales ? (
                  <Link to={`/negoce/view/${d.id}`} className="min-w-0 hover:underline">
                    {doc(d)}
                  </Link>
                ) : (
                  <span className="min-w-0">{doc(d)}</span>
                )}
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted">{dateFr(d.date, intl)}</span>
                  <span className="tabular">{f(d.type === 'credit_note' ? -d.totalTTC : d.totalTTC)}</span>
                  <StatusBadge status={d.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className={sectionTitle}>{t('c360.topWines')}</h3>
        {k.topWines.length === 0 ? (
          <p className="text-sm text-muted">{t('c360.noWines')}</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {k.topWines.map((w, i) => (
              <li key={w.wineId} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  <span className="mr-2 text-muted">{i + 1}.</span>
                  {w.label}
                </span>
                <span className="tabular shrink-0 text-muted">
                  {t('c360.bottles', { n: w.qty })} · {f(w.revenueHT)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {consigned.length > 0 && (
        <section>
          <h3 className={sectionTitle}>{t('c360.consignments', { n: k.consignedBottles })}</h3>
          <ul className="space-y-1 text-sm">
            {consigned.map((c) => {
              const w = wines.find((x) => x.id === c.wineId);
              return (
                <li key={c.id} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{w ? wineLabel(w) : c.wineId}</span>
                  <span className="tabular shrink-0 text-muted">× {c.qty}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h3 className={sectionTitle}>{t('c360.offers')}</h3>
        {offers.length === 0 ? (
          <p className="text-sm text-muted">{t('c360.noOffers')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {offers.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                {linkSales ? (
                  <Link to={`/negoce/offres/${o.id}`} className="min-w-0 truncate hover:underline">
                    {o.title || o.number}
                  </Link>
                ) : (
                  <span className="min-w-0 truncate">{o.title || o.number}</span>
                )}
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted">{t('c360.wineCount', { n: o.items.length })}</span>
                  <OfferStatusBadge status={effectiveStatus(o, asOf)} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function SupplierFinance({ partner }: { partner: Partner }) {
  const { t, intl } = useI18n();
  const { org, wines } = useOrg();
  const purchases = useCollection<PurchaseInvoice>('purchaseInvoices');
  const asOf = today();
  const f = (n: number) => eur(n, org.currency, intl);
  const k = useMemo(() => supplier360(partner, purchases.rows, asOf, { wines }), [partner, purchases.rows, asOf, wines]);

  return (
    <>
      <section aria-label={t('c360.kpis')} className="grid grid-cols-2 gap-2">
        <Stat label={t('c360.purchases12m')} value={f(k.purchases12mHT)} sub={t('common.ht')} />
        <Stat label={t('c360.purchaseCount')} value={k.invoiceCount} sub={k.unpaidTTC > 0 ? t('c360.toPay', { amount: f(k.unpaidTTC) }) : undefined} />
      </section>
      <section>
        <h3 className={sectionTitle}>{t('c360.lastPurchases')}</h3>
        {k.lastPurchases.length === 0 ? (
          <p className="text-sm text-muted">{t('c360.noPurchases')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {k.lastPurchases.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="min-w-0 truncate font-medium">{p.number || '—'}</span>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted">{dateFr(p.date, intl)}</span>
                  <span className="tabular">{f(p.totalTTC)}</span>
                  <Badge tone={p.status === 'paid' ? 'ok' : p.status === 'received' ? 'warn' : 'neutral'}>{t(`c360.purchase.${p.status}`)}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className={sectionTitle}>{t('c360.suppliedWines')}</h3>
        {k.wines.length === 0 ? (
          <p className="text-sm text-muted">{t('c360.noWines')}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {k.wines.map((w) => (
              <li key={w.wineId ?? w.label} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{w.label}</span>
                <span className="tabular shrink-0 text-muted">
                  {t('c360.bottles', { n: w.qty })} · {f(w.lastPriceHT)} {t('common.ht')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
