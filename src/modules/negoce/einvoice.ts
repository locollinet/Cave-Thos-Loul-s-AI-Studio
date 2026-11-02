// Facture électronique (réforme française 2026-2027) : export au format UN/CEFACT CII, profil EN 16931.
// Le fichier se dépose sur la plateforme agréée (PA) de l'entreprise, qui le transmet au client.
import type { LegalInfo, Partner } from '@/types';
import { computeTotals } from './calc';
import type { SaleDocument } from './types';

export interface EInvoiceSeller {
  name: string;
  currency: string;
  legal: LegalInfo;
}

const digits = (s?: string) => (s ?? '').replace(/\D/g, '');

/** Clé de Luhn, utilisée par les numéros SIREN et SIRET. */
const luhn = (n: string): boolean => {
  let sum = 0;
  for (let i = 0; i < n.length; i++) {
    let d = Number(n[n.length - 1 - i]);
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
};

/** SIREN (9 chiffres) tiré d'un SIREN ou d'un SIRET valide ; chaîne vide sinon. */
export function sirenOf(value?: string): string {
  const d = digits(value);
  if (d.length === 14 && luhn(d)) return d.slice(0, 9);
  if (d.length === 9 && luhn(d)) return d;
  return '';
}

const COUNTRIES: Record<string, string> = { france: 'FR', belgique: 'BE', suisse: 'CH', luxembourg: 'LU', allemagne: 'DE', italie: 'IT', espagne: 'ES', 'royaume-uni': 'GB', monaco: 'MC' };
const countryCode = (c?: string): string => {
  const v = (c ?? '').trim();
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  return COUNTRIES[v.toLowerCase()] ?? 'FR';
};

/** Informations manquantes pour émettre la facture électronique ; vide si tout est prêt. */
export function eInvoiceGaps(doc: SaleDocument, seller: EInvoiceSeller, buyer?: Partner): string[] {
  const gaps: string[] = [];
  const l = seller.legal;
  if (doc.type === 'quote') gaps.push('Un devis ne se transmet pas en facture électronique.');
  if (doc.status === 'draft' || !doc.number) gaps.push('Validez d’abord le document (numéro définitif).');
  if (doc.partnerType === 'particulier') gaps.push('Vente à un particulier : elle relève du e-reporting, pas de la facture électronique.');
  if (!sirenOf(l.siret)) gaps.push('SIREN ou SIRET valide de votre entreprise (Réglages › Identité).');
  if (!l.vatNumber) gaps.push('Numéro de TVA intracommunautaire de votre entreprise (Réglages › Identité).');
  if (!l.address || !l.postalCode || !l.city) gaps.push('Adresse complète de votre entreprise (Réglages › Identité).');
  if (doc.partnerType !== 'particulier') {
    if (!sirenOf(buyer?.siret)) gaps.push(`SIREN ou SIRET du client « ${doc.partnerName} » (fiche contact).`);
    if (!buyer?.address || !buyer?.postalCode || !buyer?.city) gaps.push(`Adresse complète du client « ${doc.partnerName} » (fiche contact).`);
  }
  return gaps;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const amount = (n: number) => (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
const decimal4 = (n: number) => String(Math.round((n + Number.EPSILON) * 10_000) / 10_000);
const date102 = (iso: string) => `<udt:DateTimeString format="102">${iso.replace(/-/g, '')}</udt:DateTimeString>`;
const vatCategory = (rate: number) => (rate > 0 ? 'S' : 'E');

function taxBlock(rate: number, tag = 'ram:CategoryTradeTax'): string {
  return `<${tag}><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${vatCategory(rate)}</ram:CategoryCode><ram:RateApplicablePercent>${decimal4(rate)}</ram:RateApplicablePercent></${tag}>`;
}

function party(p: { name: string; siren: string; address?: string; postalCode?: string; city?: string; country?: string; email?: string; vatNumber?: string }): string {
  return [
    `<ram:Name>${esc(p.name)}</ram:Name>`,
    p.siren ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${p.siren}</ram:ID></ram:SpecifiedLegalOrganization>` : '',
    '<ram:PostalTradeAddress>',
    p.postalCode ? `<ram:PostcodeCode>${esc(p.postalCode)}</ram:PostcodeCode>` : '',
    p.address ? `<ram:LineOne>${esc(p.address)}</ram:LineOne>` : '',
    p.city ? `<ram:CityName>${esc(p.city)}</ram:CityName>` : '',
    `<ram:CountryID>${countryCode(p.country)}</ram:CountryID>`,
    '</ram:PostalTradeAddress>',
    // Adresse de facturation électronique (BT-34 / BT-49) : SIREN au schéma français 0225 (annuaire), sinon l'email.
    p.siren
      ? `<ram:URIUniversalCommunication><ram:URIID schemeID="0225">${p.siren}</ram:URIID></ram:URIUniversalCommunication>`
      : p.email
        ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(p.email)}</ram:URIID></ram:URIUniversalCommunication>`
        : '',
    p.vatNumber ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(p.vatNumber.replace(/\s/g, ''))}</ram:ID></ram:SpecifiedTaxRegistration>` : '',
  ].join('');
}

// Mentions obligatoires des factures entre professionnels (Code de commerce, art. L441-9).
const FR_NOTES: [string, string][] = [
  ['PMT', 'Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 €.'],
  ['PMD', 'Pénalités de retard : trois fois le taux d’intérêt légal.'],
  ['AAB', 'Pas d’escompte pour paiement anticipé.'],
];

/** Facture ou avoir validé au format CII EN 16931 ; les montants reprennent exactement ceux du document. */
export function buildCiiXml(doc: SaleDocument, seller: EInvoiceSeller, buyer?: Partner, related?: SaleDocument): string {
  const t = computeTotals(doc.lines, doc.shippingHT, doc.shippingVatRate, doc.discountPct);
  const l = seller.legal;
  const currency = seller.currency || 'EUR';
  const lineSum = t.lineNets.reduce((s, n) => s + n, 0);
  const notes = [
    ...(doc.notes?.trim() ? [['', doc.notes.trim()] as [string, string]] : []),
    ...(l.legalMentions?.trim() ? [['ABL', l.legalMentions.trim()] as [string, string]] : []),
    ...FR_NOTES,
  ];

  const lines = doc.lines
    .map((line, i) => {
      const net = t.lineNets[i];
      const unit = line.qty ? net / line.qty : 0;
      return [
        '<ram:IncludedSupplyChainTradeLineItem>',
        `<ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>`,
        `<ram:SpecifiedTradeProduct><ram:Name>${esc(line.description || 'Article')}</ram:Name></ram:SpecifiedTradeProduct>`,
        `<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${decimal4(unit)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>`,
        `<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">${decimal4(line.qty)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>`,
        '<ram:SpecifiedLineTradeSettlement>',
        taxBlock(line.vatRate, 'ram:ApplicableTradeTax'),
        `<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amount(net)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>`,
        '</ram:SpecifiedLineTradeSettlement>',
        '</ram:IncludedSupplyChainTradeLineItem>',
      ].join('');
    })
    .join('');

  const taxes = t.breakdown
    .map(
      (b) =>
        `<ram:ApplicableTradeTax><ram:CalculatedAmount>${amount(b.vat)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>${
          b.rate > 0 ? '' : '<ram:ExemptionReason>Exonération de TVA</ram:ExemptionReason>'
        }<ram:BasisAmount>${amount(b.baseHT)}</ram:BasisAmount><ram:CategoryCode>${vatCategory(b.rate)}</ram:CategoryCode><ram:RateApplicablePercent>${decimal4(b.rate)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`,
    )
    .join('');

  const shipping = t.shippingHT
    ? `<ram:SpecifiedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>true</udt:Indicator></ram:ChargeIndicator><ram:ActualAmount>${amount(t.shippingHT)}</ram:ActualAmount><ram:Reason>Frais de transport</ram:Reason>${taxBlock(doc.shippingVatRate)}</ram:SpecifiedTradeAllowanceCharge>`
    : '';

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">',
    '<rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>',
    '<rsm:ExchangedDocument>',
    `<ram:ID>${esc(doc.number)}</ram:ID>`,
    `<ram:TypeCode>${doc.type === 'credit_note' ? '381' : '380'}</ram:TypeCode>`,
    `<ram:IssueDateTime>${date102(doc.date)}</ram:IssueDateTime>`,
    notes.map(([code, text]) => `<ram:IncludedNote><ram:Content>${esc(text)}</ram:Content>${code ? `<ram:SubjectCode>${code}</ram:SubjectCode>` : ''}</ram:IncludedNote>`).join(''),
    '</rsm:ExchangedDocument>',
    '<rsm:SupplyChainTradeTransaction>',
    lines,
    '<ram:ApplicableHeaderTradeAgreement>',
    `<ram:SellerTradeParty>${party({ name: l.legalName || seller.name, siren: sirenOf(l.siret), address: l.address, postalCode: l.postalCode, city: l.city, country: l.country, email: l.email, vatNumber: l.vatNumber })}</ram:SellerTradeParty>`,
    `<ram:BuyerTradeParty>${party({ name: doc.partnerName, siren: sirenOf(buyer?.siret), address: buyer?.address ?? doc.partnerAddress, postalCode: buyer?.postalCode, city: buyer?.city, country: 'FR', email: buyer?.email, vatNumber: buyer?.vatNumber ?? doc.partnerVatNumber })}</ram:BuyerTradeParty>`,
    '</ram:ApplicableHeaderTradeAgreement>',
    `<ram:ApplicableHeaderTradeDelivery><ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime>${date102(doc.date)}</ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent></ram:ApplicableHeaderTradeDelivery>`,
    '<ram:ApplicableHeaderTradeSettlement>',
    `<ram:InvoiceCurrencyCode>${currency}</ram:InvoiceCurrencyCode>`,
    l.iban ? `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(l.iban.replace(/\s/g, ''))}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>` : '',
    taxes,
    shipping,
    `<ram:SpecifiedTradePaymentTerms><ram:Description>Paiement à ${doc.paymentTermsDays ?? 0} jours</ram:Description><ram:DueDateDateTime>${date102(doc.dueDate || doc.date)}</ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>`,
    '<ram:SpecifiedTradeSettlementHeaderMonetarySummation>',
    `<ram:LineTotalAmount>${amount(lineSum)}</ram:LineTotalAmount>`,
    t.shippingHT ? `<ram:ChargeTotalAmount>${amount(t.shippingHT)}</ram:ChargeTotalAmount>` : '',
    `<ram:TaxBasisTotalAmount>${amount(t.totalHT)}</ram:TaxBasisTotalAmount>`,
    `<ram:TaxTotalAmount currencyID="${currency}">${amount(t.totalVAT)}</ram:TaxTotalAmount>`,
    `<ram:GrandTotalAmount>${amount(t.totalTTC)}</ram:GrandTotalAmount>`,
    `<ram:DuePayableAmount>${amount(t.totalTTC)}</ram:DuePayableAmount>`,
    '</ram:SpecifiedTradeSettlementHeaderMonetarySummation>',
    related?.number
      ? `<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>${esc(related.number)}</ram:IssuerAssignedID><ram:FormattedIssueDateTime><qdt:DateTimeString format="102">${related.date.replace(/-/g, '')}</qdt:DateTimeString></ram:FormattedIssueDateTime></ram:InvoiceReferencedDocument>`
      : '',
    '</ram:ApplicableHeaderTradeSettlement>',
    '</rsm:SupplyChainTradeTransaction>',
    '</rsm:CrossIndustryInvoice>',
  ].join('\n');
}
