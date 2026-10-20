import type { Locale, Org, Partner, Wine, WineColor } from '@/types';
import { WINE_COLORS } from '@/types';
import { PRESETS, sanitizeTheme } from '@/lib/brand';
import { round2, uid } from '@/lib/utils';
import { wineLabel } from '@/lib/wine';
import { publicLogo } from '@/modules/carte/build';
import { addDays, counterKey, formatNumber, newDocument, newLine, partnerSnapshot, withTotals } from '../calc';
import type { SaleDocument } from '../types';
import type { Offer, OfferItem, OfferStatus, PublicOfferDoc, PublicOfferItem } from './types';

export const OFFER_PREFIX = 'OF';
export const OFFER_VALIDITY_DAYS = 30;
export const MAX_OFFER_ITEMS = 200;

export const offerCounterKey = (year: number | string): string => counterKey(OFFER_PREFIX, year);
export const formatOfferNumber = (year: number | string, seq: number): string => formatNumber(OFFER_PREFIX, year, seq);

/** Prix client HT par défaut : prix de vente négoce moins la remise du client. */
export const offerPrice = (wine: Pick<Wine, 'sellPriceHT'>, partner?: Pick<Partner, 'discountPct'>): number =>
  round2((wine.sellPriceHT ?? 0) * (1 - (partner?.discountPct ?? 0) / 100));

export const priceTTC = (priceHT: number, vatRate: number): number => round2(priceHT * (1 + vatRate / 100));

export function newOffer(o: { date: string; lang: Locale; userId?: string; partner?: Partner; now?: number }): Offer {
  const now = o.now ?? Date.now();
  return {
    id: uid(),
    number: '',
    title: '',
    intro: '',
    partnerId: o.partner?.id,
    partnerName: o.partner?.name,
    language: o.lang,
    items: [],
    validUntil: addDays(o.date, OFFER_VALIDITY_DAYS),
    status: 'draft',
    published: false,
    createdAt: now,
    updatedAt: now,
    createdBy: o.userId,
  };
}

/** Lignes d'offre depuis une liste d'identifiants (ex. `?wines=a,b`), sans doublon ni vin archivé ou inconnu. */
export function itemsFromWineIds(ids: string[], wines: Wine[], partner?: Partner): OfferItem[] {
  const byId = new Map(wines.map((w) => [w.id, w]));
  const seen = new Set<string>();
  const out: OfferItem[] = [];
  for (const id of ids) {
    const w = byId.get(id);
    if (!w || w.isArchived || seen.has(id)) continue;
    seen.add(id);
    out.push({ wineId: id, priceHT: offerPrice(w, partner) });
  }
  return out.slice(0, MAX_OFFER_ITEMS);
}

/** Changement de client : les prix restés « par défaut » suivent la nouvelle remise, les prix négociés sont conservés. */
export function repriceItems(items: OfferItem[], wines: Wine[], from: Partner | undefined, to: Partner | undefined): OfferItem[] {
  const byId = new Map(wines.map((w) => [w.id, w]));
  return items.map((it) => {
    const w = byId.get(it.wineId);
    if (!w || Math.abs(it.priceHT - offerPrice(w, from)) > 0.004) return it;
    return { ...it, priceHT: offerPrice(w, to) };
  });
}

/** Statut affiché : une offre brouillon ou envoyée dont la date de validité est passée est « expirée ». */
export const effectiveStatus = (o: Pick<Offer, 'status' | 'validUntil'>, asOf: string): OfferStatus =>
  (o.status === 'draft' || o.status === 'sent') && o.validUntil && o.validUntil < asOf ? 'expired' : o.status;

export function offerTotals(items: OfferItem[], vatRate: number): { bottles: number; totalHT: number; totalTTC: number } {
  const bottles = items.reduce((s, i) => s + (i.minQty ?? 1), 0);
  const totalHT = round2(items.reduce((s, i) => s + i.priceHT * (i.minQty ?? 1), 0));
  return { bottles, totalHT, totalTTC: priceTTC(totalHT, vatRate) };
}

type BrandOrg = Pick<Org, 'name'> & Partial<Pick<Org, 'brand' | 'legal' | 'locale' | 'defaultVatRate'>>;

export const offerTheme = (org: Partial<Pick<Org, 'brand'>>) => sanitizeTheme(org.brand, PRESETS.palace);

/** Élément public : seulement ce que le client doit voir (ni prix d'achat, ni stock, ni identifiant interne). */
export function publicItem(item: OfferItem, wine: Wine, vatRate: number): PublicOfferItem {
  const out: PublicOfferItem = {
    producer: wine.producer,
    name: wine.name,
    vintage: wine.vintage,
    formatCl: wine.formatCl,
    color: wine.color,
    priceHT: round2(item.priceHT),
    priceTTC: priceTTC(item.priceHT, vatRate),
  };
  if (wine.region) out.region = wine.region;
  if (wine.appellation) out.appellation = wine.appellation;
  if (item.minQty && item.minQty > 1) out.minQty = item.minQty;
  if (item.note?.trim()) out.note = item.note.trim();
  return out;
}

export function toPublicOffer(offer: Offer, org: BrandOrg, orgId: string, wines: Wine[], publicId: string, now = Date.now()): PublicOfferDoc {
  const byId = new Map(wines.map((w) => [w.id, w]));
  const vatRate = org.defaultVatRate ?? 20;
  const theme = offerTheme(org);
  const doc: PublicOfferDoc = {
    publicId,
    orgId,
    orgName: org.name,
    number: offer.number,
    title: offer.title,
    intro: offer.intro,
    language: offer.language ?? org.locale ?? 'fr',
    validUntil: offer.validUntil,
    vatRate,
    theme,
    items: offer.items
      .slice(0, MAX_OFFER_ITEMS)
      .map((it) => {
        const w = byId.get(it.wineId);
        return w ? publicItem(it, w, vatRate) : null;
      })
      .filter((x): x is PublicOfferItem => !!x),
    updatedAt: now,
  };
  if (offer.partnerName) doc.clientName = offer.partnerName;
  if (org.legal?.email) doc.contactEmail = org.legal.email;
  const logo = publicLogo(theme, org);
  if (logo) doc.logoDataUrl = logo;
  return doc;
}

/** Devis brouillon pré-rempli depuis une offre acceptée (prix client figés, quantité = minimum ou 1). */
export function offerToQuote(
  offer: Offer,
  partner: Partner | undefined,
  wines: Wine[],
  o: { siteId: string; vatRate: number; userId: string; date: string },
): SaleDocument {
  const byId = new Map(wines.map((w) => [w.id, w]));
  const base = newDocument('quote', o);
  const lines = offer.items
    .map((it) => {
      const w = byId.get(it.wineId);
      if (!w) return null;
      return { ...newLine(o.vatRate), wineId: w.id, description: wineLabel(w), qty: it.minQty && it.minQty > 0 ? it.minQty : 1, unitPriceHT: it.priceHT };
    })
    .filter((l): l is NonNullable<typeof l> => !!l);
  const snap = partner ? partnerSnapshot(partner) : {};
  return withTotals({
    ...base,
    ...snap,
    lines,
    validUntil: offer.validUntil > o.date ? offer.validUntil : base.validUntil,
    notes: offer.title ? `${offer.number ? `${offer.number} — ` : ''}${offer.title}` : '',
    offerId: offer.id,
  });
}

export const publicOfferUrl = (publicId: string, origin = typeof location !== 'undefined' ? location.origin : ''): string => `${origin}/o/${publicId}`;

/* ------------------------------------------------------------ lecture publique */

const str = (v: unknown, max = 400): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Les données publiques sont lues telles quelles : on les normalise avant affichage. */
export function sanitizePublicOffer(raw: unknown): PublicOfferDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const items = Array.isArray(d.items) ? d.items.slice(0, MAX_OFFER_ITEMS) : [];
  const logo = str(d.logoDataUrl, 400_000);
  return {
    publicId: str(d.publicId, 64),
    orgId: str(d.orgId, 64),
    orgName: str(d.orgName, 120),
    number: str(d.number, 40),
    title: str(d.title, 140),
    intro: str(d.intro, 2000),
    clientName: str(d.clientName, 120) || undefined,
    contactEmail: str(d.contactEmail, 120) || undefined,
    language: d.language === 'en' ? 'en' : 'fr',
    validUntil: /^\d{4}-\d{2}-\d{2}$/.test(str(d.validUntil)) ? str(d.validUntil) : '',
    vatRate: num(d.vatRate) || 20,
    theme: sanitizeTheme(d.theme, PRESETS.palace),
    logoDataUrl: /^data:image\/(png|jpe?g|webp|svg\+xml);base64,/.test(logo) ? logo : undefined,
    items: items
      .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
      .map(
        (i): PublicOfferItem => ({
          producer: str(i.producer, 120),
          name: str(i.name, 160),
          vintage: str(i.vintage, 10),
          formatCl: num(i.formatCl) || 75,
          color: (WINE_COLORS as string[]).includes(i.color as string) ? (i.color as WineColor) : 'autre',
          region: str(i.region, 80) || undefined,
          appellation: str(i.appellation, 120) || undefined,
          priceHT: num(i.priceHT),
          priceTTC: num(i.priceTTC),
          minQty: num(i.minQty) > 1 ? num(i.minQty) : undefined,
          note: str(i.note, 240) || undefined,
        }),
      ),
    updatedAt: num(d.updatedAt),
  };
}
