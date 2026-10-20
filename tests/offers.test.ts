import { describe, expect, it } from 'vitest';
import type { Partner, Wine } from '../src/types';
import {
  effectiveStatus,
  formatOfferNumber,
  itemsFromWineIds,
  newOffer,
  offerCounterKey,
  offerPrice,
  offerToQuote,
  repriceItems,
  sanitizePublicOffer,
  toPublicOffer,
} from '../src/modules/negoce/offers/calc';
import { deleteOfferOps, publishOfferOps, saveOfferOps, unpublishOfferOps } from '../src/modules/negoce/offers/ops';
import { buildOffersDemoOps } from '../src/modules/negoce/offers/demo';
import type { Offer } from '../src/modules/negoce/offers/types';

const wine = (id: string, sell = 40, buy = 18, extra: Partial<Wine> = {}): Wine => ({
  id,
  producer: `Domaine ${id}`,
  name: `Cuvée ${id}`,
  appellation: 'Meursault',
  region: 'Bourgogne',
  vintage: '2020',
  color: 'blanc',
  formatCl: 75,
  buyPriceHT: buy,
  sellPriceHT: sell,
  alertThreshold: 2,
  canonicalKey: id,
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});
const client = (id: string, discountPct?: number): Partner => ({ id, kind: 'client', name: `Client ${id}`, discountPct, createdAt: 0, email: `${id}@ex.fr` });
const wines = [wine('a'), wine('b', 25, 10, { color: 'rouge' }), wine('c', 60, 30, { isArchived: true }), wine('d', 0, 5)];
const org = { name: 'Maison Test', locale: 'fr' as const, defaultVatRate: 20, legal: { email: 'cave@maison.fr', iban: 'FR76 1234' } as never };

describe('offres — tarification', () => {
  it('prix client = prix de vente HT moins la remise client', () => {
    expect(offerPrice(wine('a', 40), client('p', 10))).toBe(36);
    expect(offerPrice(wine('a', 33.33), client('p', 15))).toBe(28.33);
    expect(offerPrice(wine('a', 40))).toBe(40);
    expect(offerPrice({ sellPriceHT: undefined })).toBe(0);
  });

  it('crée les lignes depuis ?wines= sans doublon, ni vin archivé ou inconnu', () => {
    const items = itemsFromWineIds(['a', 'b', 'a', 'c', 'zzz'], wines, client('p', 10));
    expect(items).toEqual([
      { wineId: 'a', priceHT: 36 },
      { wineId: 'b', priceHT: 22.5 },
    ]);
  });

  it('changement de client : seuls les prix par défaut suivent la remise', () => {
    const items = [
      { wineId: 'a', priceHT: 40 },
      { wineId: 'b', priceHT: 19 }, // négocié
    ];
    expect(repriceItems(items, wines, undefined, client('p', 10))).toEqual([
      { wineId: 'a', priceHT: 36 },
      { wineId: 'b', priceHT: 19 },
    ]);
  });
});

describe('offres — numérotation et statut', () => {
  it('numéro OF-AAAA-0001 et compteur dédié', () => {
    expect(formatOfferNumber(2026, 1)).toBe('OF-2026-0001');
    expect(formatOfferNumber('2026', 42)).toBe('OF-2026-0042');
    expect(offerCounterKey(2026)).toBe('OF-2026');
  });

  it('nouvelle offre : brouillon, validité 30 jours, non publiée', () => {
    const o = newOffer({ date: '2026-10-19', lang: 'en', partner: client('p') });
    expect(o).toMatchObject({ status: 'draft', validUntil: '2026-11-18', published: false, language: 'en', partnerId: 'p', partnerName: 'Client p', number: '' });
  });

  it('une offre brouillon ou envoyée dont la validité est dépassée est expirée', () => {
    expect(effectiveStatus({ status: 'sent', validUntil: '2026-10-01' }, '2026-10-19')).toBe('expired');
    expect(effectiveStatus({ status: 'draft', validUntil: '2026-10-19' }, '2026-10-19')).toBe('draft');
    expect(effectiveStatus({ status: 'accepted', validUntil: '2026-10-01' }, '2026-10-19')).toBe('accepted');
  });
});

const offer = (extra: Partial<Offer> = {}): Offer => ({
  ...newOffer({ date: '2026-10-19', lang: 'fr', partner: client('p', 10), now: 1 }),
  id: 'o1',
  number: 'OF-2026-0001',
  title: 'Sélection',
  intro: 'Bonjour',
  items: [
    { wineId: 'a', priceHT: 36, minQty: 6, note: '  Dernières caisses ' },
    { wineId: 'b', priceHT: 22.5 },
    { wineId: 'gone', priceHT: 10 },
  ],
  ...extra,
});

describe('offres — instantané public', () => {
  it('ne contient ni prix d’achat, ni stock, ni identifiant de vin', () => {
    const doc = toPublicOffer(offer(), org, 'org1', wines, 'pub123', 5);
    const json = JSON.stringify(doc);
    expect(json).not.toMatch(/buyPrice|stock|"qty"|wineId|alertThreshold|canonicalKey|iban/i);
    expect(doc).toMatchObject({ publicId: 'pub123', orgId: 'org1', orgName: 'Maison Test', language: 'fr', vatRate: 20, clientName: 'Client p', contactEmail: 'cave@maison.fr' });
    expect(doc.items).toHaveLength(2);
    expect(doc.items[0]).toEqual({
      producer: 'Domaine a',
      name: 'Cuvée a',
      vintage: '2020',
      formatCl: 75,
      color: 'blanc',
      region: 'Bourgogne',
      appellation: 'Meursault',
      priceHT: 36,
      priceTTC: 43.2,
      minQty: 6,
      note: 'Dernières caisses',
    });
    expect(Object.keys(doc.items[1])).not.toContain('minQty');
  });

  it('charte : thème de la maison, sinon palace', () => {
    expect(toPublicOffer(offer(), org, 'o', wines, 'p').theme.headingFont).toBe('cormorant');
    const branded = toPublicOffer(offer(), { ...org, brand: { headingFont: 'cinzel', background: '#000000' } as never }, 'o', wines, 'p');
    expect(branded.theme.headingFont).toBe('cinzel');
    expect(branded.theme.background).toBe('#000000');
  });

  it('publication : publicId aléatoire, statut envoyé, écrit offre + instantané', () => {
    const r = publishOfferOps('org1', offer(), org, wines, 9);
    expect(r.offer.publicId).toMatch(/^[a-z0-9]{24}$/);
    expect(r.offer).toMatchObject({ published: true, status: 'sent' });
    expect(r.ops.map((o) => o.path)).toEqual(['orgs/org1/offers/o1', `public_offers/${r.offer.publicId}`]);
    // republier conserve le lien
    expect(publishOfferOps('org1', r.offer, org, wines).offer.publicId).toBe(r.offer.publicId);
    // enregistrer une offre publiée rafraîchit l'instantané
    expect(saveOfferOps('org1', r.offer, org, wines).map((o) => o.path)).toContain(`public_offers/${r.offer.publicId}`);
    expect(saveOfferOps('org1', offer(), org, wines)).toHaveLength(1);
    expect(unpublishOfferOps('org1', r.offer).map((o) => o.op)).toEqual(['set', 'delete']);
    expect(deleteOfferOps('org1', r.offer).every((o) => o.op === 'delete')).toBe(true);
  });

  it('lecture publique : données normalisées et bornées', () => {
    const d = sanitizePublicOffer({ title: 'x'.repeat(500), language: 'de', theme: { background: 'red' }, items: [{ color: 'bleu', priceHT: 'a', minQty: 1 }, null], logoDataUrl: 'javascript:alert(1)' });
    expect(d?.title).toHaveLength(140);
    expect(d?.language).toBe('fr');
    expect(d?.theme.background).toBe('#f8f5ee');
    expect(d?.items).toEqual([expect.objectContaining({ color: 'autre', priceHT: 0, minQty: undefined, formatCl: 75 })]);
    expect(d?.logoDataUrl).toBeUndefined();
    expect(sanitizePublicOffer(null)).toBeNull();
  });
});

describe('offres — conversion en devis', () => {
  it('pré-remplit un devis brouillon : client, prix figés, quantités minimales', () => {
    const q = offerToQuote(offer({ status: 'accepted', validUntil: '2026-11-30' }), client('p', 10), wines, { siteId: 's1', vatRate: 20, userId: 'u', date: '2026-10-20' });
    expect(q).toMatchObject({ type: 'quote', status: 'draft', number: '', partnerId: 'p', partnerName: 'Client p', siteId: 's1', offerId: 'o1', validUntil: '2026-11-30' });
    expect(q.lines.map((l) => [l.wineId, l.qty, l.unitPriceHT, l.discountPct])).toEqual([
      ['a', 6, 36, 0],
      ['b', 1, 22.5, 0],
    ]);
    expect(q.totalHT).toBe(238.5);
  });
});

describe('offres — démo', () => {
  it('3 offres dont une publiée avec son instantané', () => {
    const pool = Array.from({ length: 12 }, (_, i) => wine(`w${i}`, 20 + i, 9));
    const ops = buildOffersDemoOps('org1', pool, [client('c1', 5), client('c2')], Date.parse('2026-10-19T10:00:00Z'), org);
    const offers = ops.filter((o) => o.path.startsWith('orgs/org1/offers/'));
    expect(offers).toHaveLength(3);
    const pub = ops.filter((o) => o.path.startsWith('public_offers/'));
    expect(pub).toHaveLength(1);
    const data = pub[0].op === 'set' ? pub[0].data : {};
    expect(JSON.stringify(data)).not.toMatch(/buyPrice|wineId/);
    expect((data as { items: unknown[] }).items.length).toBeGreaterThan(0);
    const statuses = offers.map((o) => (o.op === 'set' ? (o.data as unknown as Offer).status : ''));
    expect(statuses.sort()).toEqual(['accepted', 'draft', 'sent']);
    expect(ops.find((o) => o.path === 'orgs/org1/counters/OF-2026')).toMatchObject({ data: { value: 3 } });
    expect(buildOffersDemoOps('org1', [], [], 0)).toEqual([]);
  });
});
