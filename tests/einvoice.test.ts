import { describe, expect, it } from 'vitest';
import zlib from 'zlib';
import type { LegalInfo, Partner, Wine } from '../src/types';
import { buildCiiXml, eInvoiceGaps, sirenOf, type EInvoiceSeller } from '../src/modules/negoce/einvoice';
import { EInvoiceError, extractFacturXml, parseEInvoiceXml } from '../src/modules/achats/einvoiceImport';
import { newDocument, withTotals } from '../src/modules/negoce/calc';
import type { SaleDocument } from '../src/modules/negoce/types';

const legal: LegalInfo = {
  legalName: 'Maison Bertrand & Fils SAS',
  legalForm: 'SAS',
  address: '12 rue des Tonneliers',
  postalCode: '21200',
  city: 'Beaune',
  country: 'France',
  phone: '',
  email: 'compta@bertrand-vins.example',
  siret: '73282932000074',
  vatNumber: 'FR44732829320',
  exciseNumber: '',
  iban: 'FR76 3000 6000 0112 3456 7890 189',
  bic: '',
  legalMentions: 'SAS au capital de 50 000 €',
};
const seller: EInvoiceSeller = { name: 'Maison Bertrand', currency: 'EUR', legal };
const client: Partner = { id: 'p1', kind: 'client', name: 'Hôtel Lutetia', siret: '552 100 554', address: '45 boulevard Raspail', postalCode: '75006', city: 'Paris', vatNumber: 'FR19552100554', createdAt: 0 };

const invoice = (p: Partial<SaleDocument> = {}): SaleDocument =>
  withTotals({
    ...newDocument('invoice', { siteId: 's1', vatRate: 20, userId: 'u', date: '2026-11-02' }),
    number: 'FAC-2026-0042',
    status: 'validated',
    dueDate: '2026-12-02',
    partnerId: 'p1',
    partnerName: 'Hôtel Lutetia',
    partnerType: 'pro',
    paymentTermsDays: 30,
    shippingHT: 25,
    shippingVatRate: 20,
    discountPct: 5,
    lines: [
      { id: 'a', wineId: 'w1', description: 'Domaine Leflaive — Puligny-Montrachet 2020', qty: 6, unitPriceHT: 95.5, discountPct: 10, vatRate: 20 },
      { id: 'b', wineId: 'w2', description: 'Krug — Grande Cuvée & « Édition 171 »', qty: 3, unitPriceHT: 210, discountPct: 0, vatRate: 20 },
      { id: 'c', description: 'Coffret bois gravé', qty: 1, unitPriceHT: 18, discountPct: 0, vatRate: 20, isService: true },
    ],
    ...p,
  });

describe('facture électronique : export CII EN 16931', () => {
  it('valide les SIREN et SIRET par leur clé', () => {
    expect(sirenOf('732 829 320 00074')).toBe('732829320');
    expect(sirenOf('552100554')).toBe('552100554');
    expect(sirenOf('123456789')).toBe('');
  });

  it('liste ce qui manque avant de pouvoir émettre', () => {
    expect(eInvoiceGaps(invoice(), seller, client)).toEqual([]);
    const gaps = eInvoiceGaps(invoice({ status: 'draft', number: '' }), { ...seller, legal: { ...legal, siret: '', vatNumber: '' } }, { ...client, siret: '' });
    expect(gaps.join(' ')).toMatch(/Validez/);
    expect(gaps.join(' ')).toMatch(/SIREN ou SIRET valide de votre entreprise/);
    expect(gaps.join(' ')).toMatch(/TVA intracommunautaire/);
    expect(gaps.join(' ')).toMatch(/client « Hôtel Lutetia »/);
    expect(eInvoiceGaps(invoice({ partnerType: 'particulier' }), seller).join(' ')).toMatch(/e-reporting/);
  });

  it('produit un XML structuré dont les totaux sont ceux de la facture', () => {
    const doc = invoice();
    const xml = buildCiiXml(doc, seller, client);
    expect(xml).toContain('<ram:ID>urn:cen.eu:en16931:2017</ram:ID>');
    expect(xml).toContain('<ram:TypeCode>380</ram:TypeCode>');
    expect(xml).toContain('<ram:ID schemeID="0002">732829320</ram:ID>');
    expect(xml).toContain('<ram:SubjectCode>PMT</ram:SubjectCode>');
    expect(xml).toContain('Krug — Grande Cuvée &amp; « Édition 171 »');
    expect(xml).toContain(`<ram:GrandTotalAmount>${doc.totalTTC.toFixed(2)}</ram:GrandTotalAmount>`);
    expect(xml).toContain('<ram:IBANID>FR7630006000011234567890189</ram:IBANID>');
  });

  it('se relit à l’identique (aller-retour export → import)', () => {
    const doc = invoice();
    const back = parseEInvoiceXml(buildCiiXml(doc, seller, client));
    expect(back).toMatchObject({ supplierName: legal.legalName, number: 'FAC-2026-0042', date: '2026-11-02', dueDate: '2026-12-02', shippingHT: 25 });
    expect(back.totalHT).toBe(doc.totalHT);
    expect(back.totalVAT).toBe(doc.totalVAT);
    expect(back.totalTTC).toBe(doc.totalTTC);
    expect(back.lines.map((l) => [l.qty, l.vatRate])).toEqual([[6, 20], [3, 20], [1, 20]]);
    expect(back.lines[0].vintage).toBe('2020');
  });

  it('un avoir porte le type 381 et la référence de la facture d’origine', () => {
    const xml = buildCiiXml(invoice({ type: 'credit_note', number: 'AV-2026-0003' }), seller, client, invoice());
    expect(xml).toContain('<ram:TypeCode>381</ram:TypeCode>');
    expect(xml).toContain('<ram:IssuerAssignedID>FAC-2026-0042</ram:IssuerAssignedID>');
  });
});

describe('facture électronique : réception', () => {
  const wines: Wine[] = [{ id: 'w9', producer: 'Domaine Tempier', name: 'Bandol Rosé', vintage: '2023', color: 'rose', formatCl: 75, region: 'Provence', alertThreshold: 0, canonicalKey: 'w9', createdAt: 0, updatedAt: 0 }];

  it('lit une facture UBL et rapproche le vin connu', () => {
    const ubl = `<?xml version="1.0"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
      <cbc:ID>F-889</cbc:ID><cbc:IssueDate>2026-10-28</cbc:IssueDate><cbc:DueDate>2026-11-27</cbc:DueDate>
      <cac:AccountingSupplierParty><cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>Domaine Tempier</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
      <cac:AllowanceCharge><cbc:ChargeIndicator>true</cbc:ChargeIndicator><cbc:Amount currencyID="EUR">30.00</cbc:Amount></cac:AllowanceCharge>
      <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount currencyID="EUR">306.00</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">367.20</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
      <cac:InvoiceLine><cbc:InvoicedQuantity unitCode="C62">12</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="EUR">276.00</cbc:LineExtensionAmount><cac:Item><cbc:Name>Tempier Bandol Rosé 2023</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>20</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item></cac:InvoiceLine>
    </Invoice>`;
    const inv = parseEInvoiceXml(ubl, wines);
    expect(inv).toMatchObject({ supplierName: 'Domaine Tempier', number: 'F-889', date: '2026-10-28', dueDate: '2026-11-27', shippingHT: 30, totalHT: 306, totalVAT: 61.2, totalTTC: 367.2 });
    expect(inv.lines[0]).toMatchObject({ producer: 'Domaine Tempier', cuvee: 'Bandol Rosé', vintage: '2023', qty: 12, unitPriceHT: 23, vatRate: 20 });
  });

  it('refuse les XML à DOCTYPE et ce qui n’est pas une facture', () => {
    expect(() => parseEInvoiceXml('<!DOCTYPE x [<!ENTITY a "aaa">]><Invoice/>')).toThrow(EInvoiceError);
    expect(() => parseEInvoiceXml('<Commande/>')).toThrow(/pas une facture/);
  });

  it('extrait le XML embarqué d’un PDF Factur-X', async () => {
    const xml = buildCiiXml(invoice(), seller, client);
    const packed = zlib.deflateSync(Buffer.from(xml, 'utf8'));
    const pdf = Buffer.concat([
      Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n4 0 obj\n<< /Length 12 >>\nstream\nBT /F1 Tf ET\nendstream\nendobj\n'),
      Buffer.from(`5 0 obj\n<< /Type /EmbeddedFile /Subtype /text#2Fxml /Filter /FlateDecode /Length ${packed.length} /Params << /Size ${xml.length} >> >>\nstream\n`),
      packed,
      Buffer.from('\nendstream\nendobj\n%%EOF\n'),
    ]);
    const found = await extractFacturXml(new Uint8Array(pdf));
    expect(found).toBe(xml);
    expect(await extractFacturXml(new Uint8Array(Buffer.from('%PDF-1.7\n%%EOF')))).toBeNull();
  });
});
