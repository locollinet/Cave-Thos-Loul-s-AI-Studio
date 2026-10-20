import type { Org, Wine } from '@/types';
import type { Op } from '@/data/store';
import { newPublicId } from '@/modules/carte/build';
import { clean } from '../ops';
import { offerCounterKey, toPublicOffer } from './calc';
import type { Offer, PublicOfferDoc } from './types';

export const offerPath = (orgId: string, id: string) => `orgs/${orgId}/offers/${id}`;
export const publicOfferPath = (publicId: string) => `public_offers/${publicId}`;

type BrandOrg = Pick<Org, 'name'> & Partial<Pick<Org, 'brand' | 'legal' | 'locale' | 'defaultVatRate'>>;

export const counterOp = (orgId: string, year: string | number): Op => {
  const key = offerCounterKey(year);
  return { op: 'inc', path: `orgs/${orgId}/counters/${key}`, field: 'value', by: 1, data: { id: key } };
};

/** Enregistre l'offre ; si elle est publiée, l'instantané public est rafraîchi dans le même lot. */
export function saveOfferOps(orgId: string, offer: Offer, org: BrandOrg, wines: Wine[], now = Date.now()): Op[] {
  const next = { ...offer, updatedAt: now };
  const ops: Op[] = [{ op: 'set', path: offerPath(orgId, next.id), data: clean(next) as never }];
  if (next.published && next.publicId) ops.push({ op: 'set', path: publicOfferPath(next.publicId), data: clean(toPublicOffer(next, org, orgId, wines, next.publicId, now)) as never });
  return ops;
}

export function publishOfferOps(orgId: string, offer: Offer, org: BrandOrg, wines: Wine[], now = Date.now()): { offer: Offer; doc: PublicOfferDoc; ops: Op[] } {
  const publicId = offer.publicId && offer.publicId.length >= 16 ? offer.publicId : newPublicId();
  const next: Offer = { ...offer, publicId, published: true, status: offer.status === 'draft' ? 'sent' : offer.status, updatedAt: now };
  const doc = toPublicOffer(next, org, orgId, wines, publicId, now);
  return {
    offer: next,
    doc,
    ops: [
      { op: 'set', path: offerPath(orgId, next.id), data: clean(next) as never },
      { op: 'set', path: publicOfferPath(publicId), data: clean(doc) as never },
    ],
  };
}

export function unpublishOfferOps(orgId: string, offer: Offer, now = Date.now()): Op[] {
  const ops: Op[] = [{ op: 'set', path: offerPath(orgId, offer.id), data: { published: false, updatedAt: now }, merge: true }];
  if (offer.publicId) ops.push({ op: 'delete', path: publicOfferPath(offer.publicId) });
  return ops;
}

export function deleteOfferOps(orgId: string, offer: Offer): Op[] {
  const ops: Op[] = [{ op: 'delete', path: offerPath(orgId, offer.id) }];
  if (offer.publicId) ops.push({ op: 'delete', path: publicOfferPath(offer.publicId) });
  return ops;
}
