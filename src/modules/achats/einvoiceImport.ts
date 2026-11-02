// Factures fournisseurs reçues au format électronique : CII (Factur-X / ZUGFeRD) ou UBL, lues sans IA.
import { XMLParser } from 'fast-xml-parser';
import type { Wine } from '@/types';
import { matchPosWine } from '@/lib/posReport';
import type { ParsedInvoice, ParsedLine } from './types';

export class EInvoiceError extends Error {}

const MAX_XML = 5_000_000;
const ARRAYS = new Set(['IncludedSupplyChainTradeLineItem', 'ApplicableTradeTax', 'SpecifiedTradeAllowanceCharge', 'SpecifiedTradePaymentTerms', 'InvoiceLine', 'CreditNoteLine', 'AllowanceCharge', 'PaymentMeans']);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ARRAYS.has(name),
});

type Node = Record<string, unknown>;
const at = (o: unknown, ...path: string[]): unknown => path.reduce<unknown>((cur, k) => (cur && typeof cur === 'object' ? (cur as Node)[k] : undefined), o);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : v && typeof v === 'object' && '#text' in v ? String((v as Node)['#text']).trim() : '');
const num = (v: unknown): number => {
  const n = Number(text(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const isoDate = (v: unknown): string => {
  const s = text(v);
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
};
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Complète une ligne à partir du libellé : millésime, et fiche du catalogue si le libellé la désigne sans ambiguïté. */
function toLine(description: string, qty: number, lineTotal: number, vatRate: number, wines: Wine[]): ParsedLine {
  const vintage = description.match(/\b(19[4-9]\d|20[0-4]\d)\b/g)?.pop() ?? '';
  const known = wines.find((w) => w.id === matchPosWine(wines, description));
  return {
    description,
    producer: known?.producer ?? '',
    cuvee: known?.name ?? description,
    vintage: known?.vintage ?? vintage,
    formatCl: known?.formatCl ?? 0,
    color: known?.color ?? '',
    region: known?.region ?? '',
    qty,
    unitPriceHT: qty ? round2(lineTotal / qty) : 0,
    vatRate,
  };
}

function fromCii(root: Node, wines: Wine[]): ParsedInvoice {
  const tx = at(root, 'SupplyChainTradeTransaction');
  const settlement = at(tx, 'ApplicableHeaderTradeSettlement');
  const sums = at(settlement, 'SpecifiedTradeSettlementHeaderMonetarySummation');
  if (text(at(root, 'ExchangedDocument', 'TypeCode')) === '381') throw new EInvoiceError('Avoir fournisseur : à saisir comme avoir, il n’entre pas en stock.');
  const lines = list(at(tx, 'IncludedSupplyChainTradeLineItem')).map((it) =>
    toLine(
      text(at(it, 'SpecifiedTradeProduct', 'Name')) || text(at(it, 'SpecifiedTradeProduct', 'Description')),
      num(at(it, 'SpecifiedLineTradeDelivery', 'BilledQuantity')),
      num(at(it, 'SpecifiedLineTradeSettlement', 'SpecifiedTradeSettlementLineMonetarySummation', 'LineTotalAmount')),
      num(at(list(at(it, 'SpecifiedLineTradeSettlement', 'ApplicableTradeTax'))[0], 'RateApplicablePercent')),
      wines,
    ),
  );
  const charges = list(at(settlement, 'SpecifiedTradeAllowanceCharge')).filter((c) => text(at(c, 'ChargeIndicator', 'Indicator')) === 'true');
  return {
    supplierName: text(at(tx, 'ApplicableHeaderTradeAgreement', 'SellerTradeParty', 'Name')),
    number: text(at(root, 'ExchangedDocument', 'ID')),
    date: isoDate(at(root, 'ExchangedDocument', 'IssueDateTime', 'DateTimeString')),
    dueDate: isoDate(at(list(at(settlement, 'SpecifiedTradePaymentTerms'))[0], 'DueDateDateTime', 'DateTimeString')),
    shippingHT: round2(charges.reduce<number>((s, c) => s + num(at(c, 'ActualAmount')), 0)),
    lines,
    totalHT: num(at(sums, 'TaxBasisTotalAmount')),
    totalVAT: num(list(at(sums, 'TaxTotalAmount'))[0]),
    totalTTC: num(at(sums, 'GrandTotalAmount')),
  };
}

function fromUbl(root: Node, wines: Wine[]): ParsedInvoice {
  const supplier = at(root, 'AccountingSupplierParty', 'Party');
  const totals = at(root, 'LegalMonetaryTotal');
  const lines = list(at(root, 'InvoiceLine')).map((it) =>
    toLine(
      text(at(it, 'Item', 'Name')) || text(at(it, 'Item', 'Description')),
      num(at(it, 'InvoicedQuantity')),
      num(at(it, 'LineExtensionAmount')),
      num(at(it, 'Item', 'ClassifiedTaxCategory', 'Percent')),
      wines,
    ),
  );
  const charges = list(at(root, 'AllowanceCharge')).filter((c) => text(at(c, 'ChargeIndicator')) === 'true');
  const exclusive = num(at(totals, 'TaxExclusiveAmount'));
  const inclusive = num(at(totals, 'TaxInclusiveAmount'));
  return {
    supplierName: text(at(supplier, 'PartyLegalEntity', 'RegistrationName')) || text(at(supplier, 'PartyName', 'Name')),
    number: text(at(root, 'ID')),
    date: isoDate(at(root, 'IssueDate')),
    dueDate: isoDate(at(root, 'DueDate')) || isoDate(at(list(at(root, 'PaymentMeans'))[0], 'PaymentDueDate')),
    shippingHT: round2(charges.reduce<number>((s, c) => s + num(at(c, 'Amount')), 0)),
    lines,
    totalHT: exclusive,
    totalVAT: round2(inclusive - exclusive),
    totalTTC: inclusive,
  };
}

/** Lit une facture électronique XML (CII ou UBL). */
export function parseEInvoiceXml(xml: string, wines: Wine[] = []): ParsedInvoice {
  if (xml.length > MAX_XML) throw new EInvoiceError('Fichier XML trop volumineux.');
  // Une facture électronique ne déclare jamais d'entités : refuser les DOCTYPE évite toute expansion malveillante.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new EInvoiceError('XML refusé (déclaration DOCTYPE).');
  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch {
    throw new EInvoiceError('XML illisible.');
  }
  if (doc.CrossIndustryInvoice) return fromCii(doc.CrossIndustryInvoice as Node, wines);
  if (doc.Invoice) return fromUbl(doc.Invoice as Node, wines);
  if (doc.CreditNote) throw new EInvoiceError('Avoir fournisseur : à saisir comme avoir, il n’entre pas en stock.');
  throw new EInvoiceError('Ce XML n’est pas une facture CII ou UBL.');
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return s;
};

/** XML embarqué d'un PDF Factur-X / ZUGFeRD (pièce jointe factur-x.xml), ou null si le PDF n'en contient pas. */
export async function extractFacturXml(pdf: Uint8Array): Promise<string | null> {
  const raw = latin1(pdf);
  const re = /<<((?:(?!>>\s*stream)[\s\S]){0,2000}?)>>\s*stream(?:\r\n|\n|\r)/g;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    const dict = m[1];
    if (!/EmbeddedFile|text#2Fxml|text\/xml/.test(dict)) continue;
    const start = m.index + m[0].length;
    const declared = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
    let end = declared ? start + Number(declared[1]) : raw.indexOf('endstream', start);
    if (end < start || end > pdf.length) continue;
    // Sans longueur directe : la fin de ligne qui précède « endstream » n'appartient pas au flux.
    while (!declared && end > start && (pdf[end - 1] === 0x0a || pdf[end - 1] === 0x0d)) end--;
    let body = pdf.subarray(start, end);
    try {
      if (/FlateDecode/.test(dict)) body = await inflate(body);
    } catch {
      continue;
    }
    const xml = new TextDecoder().decode(body).trim();
    if (/CrossIndustryInvoice|<(\w+:)?Invoice[\s>]/.test(xml)) return xml.slice(xml.indexOf('<'));
  }
  return null;
}
