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
  /** Variante du document : facture/devis standard ou Bon de Livraison logistique */
  variant?: 'document' | 'bl';
}

export default function DocumentSheet({ doc, org, relatedNumber, paid = 0, level = 1, variant = 'document' }: Props) {
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
          <Title className="font-display text-2xl font-semibold uppercase tracking-wide">
            {variant === 'bl' ? 'Bon de Livraison' : t(`negoce.doc.${doc.type}`)}
          </Title>
          <div className="mt-1 text-base font-medium">
            {variant === 'bl' ? `BL-${doc.number || 'BROUILLON'}` : (doc.number || t('negoce.status.draft'))}
          </div>
          <dl className="mt-2 space-y-0.5 text-xs">
            <div>{variant === 'bl' ? 'Date d’expédition' : t('negoce.sheet.date')} : {dateFr(doc.date, intl)}</div>
            {variant === 'bl' && doc.number && <div>Réf. commande / facture : {doc.number}</div>}
            {variant !== 'bl' && doc.type === 'quote' && doc.validUntil && <div>{t('negoce.validUntil')} : {dateFr(doc.validUntil, intl)}</div>}
            {variant !== 'bl' && doc.type === 'invoice' && <div>{t('negoce.dueDate')} : {dateFr(doc.dueDate, intl)}</div>}
            {variant !== 'bl' && doc.type === 'credit_note' && relatedNumber && <div>{t('negoce.relatedTo', { number: relatedNumber })}</div>}
          </dl>
        </div>
      </header>

      <section className="mt-6 rounded-lg border border-neutral-300 p-3 sm:ml-auto sm:w-[55%]">
        <div className="text-[10px] uppercase tracking-wide text-neutral-500">
          {variant === 'bl' ? 'Lieu et adresse de livraison' : t('negoce.client')}
        </div>
        <div className="font-semibold">{doc.partnerName}</div>
        {doc.partnerAddress && <div className="whitespace-pre-line text-xs">{doc.partnerAddress}</div>}
        {doc.partnerVatNumber && <div className="text-xs">{t('negoce.sheet.vatIntra')} : {doc.partnerVatNumber}</div>}
      </section>

      {variant === 'bl' ? (
        /* ------------------ VUE BON DE LIVRAISON (BL) LOGISTIQUE ------------------ */
        <div className="mt-6 space-y-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-neutral-800 text-left">
                  <th className="py-2 pr-2">Désignation des flacons &amp; Référence cuvée</th>
                  <th className="px-2 text-center">Conditionnement</th>
                  <th className="px-2 text-right">Qté commandée</th>
                  <th className="px-2 text-right">Qté livrée</th>
                  <th className="pl-2 text-left">Contrôle / Emplacement</th>
                </tr>
              </thead>
              <tbody>
                {doc.lines.map((l) => (
                  <tr key={l.id} className="border-b border-neutral-200 align-top">
                    <td className="py-2 pr-2 font-medium">
                      {l.description}
                      {l.isGift && <span className="ml-1 italic text-neutral-500">(échantillon offert)</span>}
                    </td>
                    <td className="px-2 text-center text-neutral-600">Carton (75 cl)</td>
                    <td className="tabular px-2 text-right">{l.qty} btl</td>
                    <td className="tabular px-2 text-right font-semibold">{l.qty} btl</td>
                    <td className="pl-2 text-neutral-400">□ Conforme</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Récapitulatif logistique & transport */}
          <div className="grid gap-4 rounded-lg bg-neutral-50 p-4 text-xs sm:grid-cols-3">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">Total Bouteilles</span>
              <p className="font-semibold text-base">
                {doc.lines.reduce((s, l) => s + l.qty, 0)} col.
              </p>
              <p className="text-[11px] text-neutral-500">
                ~ {Math.ceil(doc.lines.reduce((s, l) => s + l.qty, 0) / 6)} cartons (base 6 btl)
              </p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">Régime Douanier &amp; Transport</span>
              <p className="font-medium text-neutral-800">Droits acquittés (CRD / Régie)</p>
              <p className="text-[11px] text-neutral-500">Transporteur : Messagerie Vinicole</p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">Volume Total estimé</span>
              <p className="font-semibold text-base">
                {(doc.lines.reduce((s, l) => s + l.qty, 0) * 0.75).toFixed(1)} Litres
              </p>
              <p className="text-[11px] text-neutral-500">Poids brut estimé : ~{(doc.lines.reduce((s, l) => s + l.qty, 0) * 1.3).toFixed(1)} kg</p>
            </div>
          </div>

          {doc.notes && (
            <div className="rounded-lg border border-neutral-200 p-3 text-xs">
              <span className="font-medium">Instructions particulières : </span>
              {doc.notes}
            </div>
          )}

          {/* Double émargement transporteur & destinataire */}
          <section className="grid gap-4 pt-2 text-[11px] sm:grid-cols-2">
            <div className="flex flex-col justify-between rounded-lg border border-neutral-300 p-3 min-h-28">
              <div>
                <p className="font-semibold uppercase text-neutral-700">Pour le Transporteur</p>
                <p className="text-neutral-500 text-[10px]">Prise en charge du chargement en bon état apparent.</p>
              </div>
              <div className="border-t border-dashed border-neutral-300 pt-2 text-neutral-400">
                Date, nom du chauffeur &amp; signature
              </div>
            </div>
            <div className="flex flex-col justify-between rounded-lg border border-neutral-300 p-3 min-h-28">
              <div>
                <p className="font-semibold uppercase text-neutral-700">Pour le Client Réceptionnaire</p>
                <p className="text-neutral-500 text-[10px]">Réserves précises et motivées le cas échéant.</p>
              </div>
              <div className="border-t border-dashed border-neutral-300 pt-2 text-neutral-400">
                Date, tampon de l’établissement &amp; signature
              </div>
            </div>
          </section>
        </div>
      ) : (
        /* ------------------ VUE FACTURE / DEVIS STANDARD ------------------ */
        <>
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
        </>
      )}

      <footer className="mt-6 border-t border-neutral-300 pt-2 text-center text-[10px] text-neutral-600">
        {[lg.legalName || org.name, lg.legalForm, lg.siret && `SIRET ${lg.siret}`, lg.vatNumber && `${t('negoce.sheet.vatIntra')} ${lg.vatNumber}`, lg.exciseNumber && `${t('negoce.sheet.excise')} ${lg.exciseNumber}`]
          .filter(Boolean)
          .join(' · ')}
      </footer>
    </article>
  );
}
