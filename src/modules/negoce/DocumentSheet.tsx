import type { Org } from '@/types';
import { useI18n } from '@/i18n';
import { dateFr, eur, pct } from '@/lib/utils';
import { computeTotals, LATE_PENALTY_MULTIPLIER, RECOVERY_FEE, showRecoveryFee } from './calc';
import type { SaleDocument } from './types';

const PRINT_CSS = `
.doc-sheet { background:#fff; color:#111; }
@media print {
  @page { size: A4; margin: 12mm; }
  html, body, #root { height: auto !important; }
  .doc-sheet { border: none !important; box-shadow: none !important; padding: 0 !important; max-width: none !important; font-size: 10pt; }
  .doc-sheet table { page-break-inside: auto; }
  .doc-sheet tr { page-break-inside: avoid; }
}`;

interface Props {
  doc: SaleDocument;
  org: Org;
  relatedNumber?: string;
  paid?: number;
  /** Niveau du titre : 2 quand la feuille est un aperçu inclus dans une page. */
  level?: 1 | 2;
}

export default function DocumentSheet({ doc, org, relatedNumber, paid = 0, level = 1 }: Props) {
  const Title = level === 1 ? 'h1' : 'h2';
  const { t, intl } = useI18n();
  const f = (n: number) => eur(n, org.currency, intl);
  const lg = org.legal;
  const totals = computeTotals(doc.lines, doc.shippingHT, doc.shippingVatRate, doc.discountPct);
  const sign = doc.type === 'credit_note' ? -1 : 1;
  const issuerLines = [lg.address, [lg.postalCode, lg.city].filter(Boolean).join(' '), lg.country !== 'France' ? lg.country : ''].filter(Boolean);

  return (
    <article className="doc-sheet mx-auto max-w-[210mm] rounded-xl border border-border p-6 text-[13px] leading-snug shadow-sm sm:p-10">
      <style>{PRINT_CSS}</style>
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-[60%]">
          {lg.logoDataUrl && <img src={lg.logoDataUrl} alt="" className="mb-2 max-h-16 max-w-48 object-contain" />}
          <div className="font-display text-lg font-semibold">{lg.legalName || org.name}</div>
          <div className="text-xs">
            {lg.legalForm && <div>{lg.legalForm}</div>}
            {issuerLines.map((l) => (
              <div key={l}>{l}</div>
            ))}
            {lg.phone && <div>{lg.phone}</div>}
            {lg.email && <div>{lg.email}</div>}
            {lg.siret && <div>SIRET : {lg.siret}</div>}
            {lg.vatNumber && <div>{t('negoce.sheet.vatIntra')} : {lg.vatNumber}</div>}
            {lg.exciseNumber && <div>{t('negoce.sheet.excise')} : {lg.exciseNumber}</div>}
          </div>
        </div>
        <div className="text-right">
          <Title className="font-display text-2xl font-semibold uppercase tracking-wide">{t(`negoce.doc.${doc.type}`)}</Title>
          <div className="mt-1 text-base font-medium">{doc.number || t('negoce.status.draft')}</div>
          <dl className="mt-2 space-y-0.5 text-xs">
            <div>{t('negoce.sheet.date')} : {dateFr(doc.date, intl)}</div>
            {doc.type === 'quote' && doc.validUntil && <div>{t('negoce.validUntil')} : {dateFr(doc.validUntil, intl)}</div>}
            {doc.type === 'invoice' && <div>{t('negoce.dueDate')} : {dateFr(doc.dueDate, intl)}</div>}
            {doc.type === 'credit_note' && relatedNumber && <div>{t('negoce.relatedTo', { number: relatedNumber })}</div>}
          </dl>
        </div>
      </header>

      <section className="mt-6 rounded-lg border border-neutral-300 p-3 sm:ml-auto sm:w-[55%]">
        <div className="text-[10px] uppercase tracking-wide text-neutral-500">{t('negoce.client')}</div>
        <div className="font-semibold">{doc.partnerName}</div>
        {doc.partnerAddress && <div className="whitespace-pre-line text-xs">{doc.partnerAddress}</div>}
        {doc.partnerVatNumber && <div className="text-xs">{t('negoce.sheet.vatIntra')} : {doc.partnerVatNumber}</div>}
      </section>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-neutral-800 text-left">
              <th className="py-1.5 pr-2">{t('negoce.description')}</th>
              <th className="px-2 text-right">{t('common.qty')}</th>
              <th className="px-2 text-right">{t('negoce.unitPrice')}</th>
              <th className="px-2 text-right">{t('negoce.discount')}</th>
              <th className="px-2 text-right">{t('negoce.vat')}</th>
              <th className="pl-2 text-right">{t('negoce.sheet.amountHT')}</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={l.id} className="border-b border-neutral-200 align-top">
                <td className="py-1.5 pr-2">
                  {l.description}
                  {l.isGift && <span className="ml-1 italic">({t('negoce.gift')})</span>}
                </td>
                <td className="tabular px-2 text-right">{l.qty}</td>
                <td className="tabular px-2 text-right">{f(l.unitPriceHT)}</td>
                <td className="tabular px-2 text-right">{l.discountPct ? pct(l.discountPct, 0) : ''}</td>
                <td className="tabular px-2 text-right">{pct(l.vatRate, l.vatRate % 1 ? 1 : 0)}</td>
                <td className="tabular pl-2 text-right">{f(totals.lineNets[i])}</td>
              </tr>
            ))}
            {doc.shippingHT > 0 && (
              <tr className="border-b border-neutral-200">
                <td className="py-1.5 pr-2" colSpan={4}>
                  {t('negoce.shipping')}
                </td>
                <td className="tabular px-2 text-right">{pct(doc.shippingVatRate, 0)}</td>
                <td className="tabular pl-2 text-right">{f(doc.shippingHT)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
        <table className="border-collapse text-xs">
          <thead>
            <tr className="border-b border-neutral-400 text-left">
              <th className="pr-4">{t('negoce.vat')}</th>
              <th className="px-4 text-right">{t('negoce.sheet.base')}</th>
              <th className="pl-4 text-right">{t('negoce.sheet.vatAmount')}</th>
            </tr>
          </thead>
          <tbody>
            {totals.breakdown.map((r) => (
              <tr key={r.rate}>
                <td className="pr-4">{pct(r.rate, 1)}</td>
                <td className="tabular px-4 text-right">{f(r.baseHT)}</td>
                <td className="tabular pl-4 text-right">{f(r.vat)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="w-64 space-y-1 text-sm">
          {doc.discountPct > 0 && (
            <div className="flex justify-between text-xs">
              <dt>{t('negoce.globalDiscount')}</dt>
              <dd>{pct(doc.discountPct, 0)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>{t('negoce.totalHT')}</dt>
            <dd className="tabular">{f(sign * totals.totalHT)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{t('negoce.totalVAT')}</dt>
            <dd className="tabular">{f(sign * totals.totalVAT)}</dd>
          </div>
          <div className="flex justify-between border-t-2 border-neutral-800 pt-1 text-base font-semibold">
            <dt>{t('negoce.totalTTC')}</dt>
            <dd className="tabular">{f(sign * totals.totalTTC)}</dd>
          </div>
          {paid > 0 && doc.type === 'invoice' && (
            <>
              <div className="flex justify-between text-xs">
                <dt>{t('negoce.alreadyPaid')}</dt>
                <dd className="tabular">{f(-paid)}</dd>
              </div>
              <div className="flex justify-between font-medium">
                <dt>{t('negoce.balance')}</dt>
                <dd className="tabular">{f(Math.max(0, totals.totalTTC - paid))}</dd>
              </div>
            </>
          )}
        </dl>
      </div>

      {doc.notes && <p className="mt-5 whitespace-pre-line text-xs">{doc.notes}</p>}

      {doc.type === 'invoice' && (
        <section className="mt-6 space-y-1 text-[11px]">
          <p>{t('negoce.sheet.terms', { days: doc.paymentTermsDays, date: dateFr(doc.dueDate, intl) })}</p>
          <p>{t('negoce.sheet.discountNone')}</p>
          <p>{t('negoce.sheet.penalty', { n: LATE_PENALTY_MULTIPLIER })}</p>
          {showRecoveryFee(doc.partnerType) && <p>{t('negoce.sheet.recovery', { fee: f(RECOVERY_FEE) })}</p>}
          {(lg.iban || lg.bic) && (
            <p className="font-medium">
              {t('negoce.sheet.bank')} : IBAN {lg.iban} {lg.bic && `— BIC ${lg.bic}`}
            </p>
          )}
        </section>
      )}

      {doc.type === 'quote' && (
        <section className="mt-6 grid gap-4 text-[11px] sm:grid-cols-2">
          <p>{t('negoce.sheet.quoteTerms', { days: doc.paymentTermsDays })}</p>
          <div className="min-h-20 rounded-lg border border-neutral-300 p-2">{t('negoce.sheet.signature')}</div>
        </section>
      )}

      {lg.legalMentions && <p className="mt-4 whitespace-pre-line text-[10px] text-neutral-600">{lg.legalMentions}</p>}

      <footer className="mt-6 border-t border-neutral-300 pt-2 text-center text-[10px] text-neutral-600">
        {[lg.legalName || org.name, lg.legalForm, lg.siret && `SIRET ${lg.siret}`, lg.vatNumber && `${t('negoce.sheet.vatIntra')} ${lg.vatNumber}`, lg.exciseNumber && `${t('negoce.sheet.excise')} ${lg.exciseNumber}`]
          .filter(Boolean)
          .join(' · ')}
      </footer>
    </article>
  );
}
