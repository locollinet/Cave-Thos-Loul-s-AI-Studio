import type { Org, Partner, Wine } from '@/types';
import type { Op } from '@/data/store';
import { newPublicId } from '@/modules/carte/build';
import { addDays } from '../calc';
import { clean } from '../ops';
import { formatOfferNumber, itemsFromWineIds, offerCounterKey, toPublicOffer } from './calc';
import { offerPath, publicOfferPath } from './ops';
import type { Offer } from './types';

type DemoOrg = Pick<Org, 'name'> & Partial<Pick<Org, 'brand' | 'legal' | 'locale' | 'defaultVatRate'>>;

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Trois offres de démonstration : une publiée (avec son instantané public), une acceptée, une en brouillon.
 * `org` (facultatif) sert au nom et à la charte de l'instantané public.
 */
export function buildOffersDemoOps(orgId: string, wines: Wine[], clients: Partner[], now = Date.now(), org: DemoOrg = { name: 'Maison de négoce' }): Op[] {
  const pool = wines.filter((w) => !w.isArchived && (w.sellPriceHT ?? 0) > 0);
  if (!pool.length) return [];
  const pick = (from: number, n: number) => Array.from({ length: Math.min(n, pool.length) }, (_, i) => pool[(from + i) % pool.length].id);
  const year = iso(now).slice(0, 4);
  const day = 86_400_000;
  const [c1, c2] = [clients[0], clients[1] ?? clients[0]];
  const lang = org.locale ?? 'fr';
  const en = lang === 'en';

  const base = (n: number, createdDaysAgo: number): Pick<Offer, 'id' | 'number' | 'createdAt' | 'updatedAt' | 'language' | 'published'> => ({
    id: `demo-offer-${n}`,
    number: formatOfferNumber(year, n),
    createdAt: now - createdDaysAgo * day,
    updatedAt: now - createdDaysAgo * day,
    language: lang,
    published: false,
  });

  const published: Offer = {
    ...base(1, 3),
    title: en ? 'Autumn selection — Burgundy & Rhône' : 'Sélection d’automne — Bourgogne & Rhône',
    intro: en
      ? 'A short selection of wines we have tasted this season, reserved for your house at preferential prices.'
      : 'Une courte sélection de vins dégustés cette saison, réservée à votre maison à des conditions préférentielles.',
    partnerId: c1?.id,
    partnerName: c1?.name,
    items: itemsFromWineIds(pick(0, 4), pool, c1).map((it, i) => (i === 0 ? { ...it, minQty: 6, note: en ? 'Last cases of this vintage.' : 'Dernières caisses du millésime.' } : it)),
    validUntil: iso(now + 27 * day),
    status: 'sent',
    publicId: newPublicId(),
  };
  published.published = true;

  const accepted: Offer = {
    ...base(2, 12),
    title: en ? 'End-of-year festive wines' : 'Vins de fêtes',
    intro: en ? 'Bubbles and great whites for your end-of-year menus.' : 'Bulles et grands blancs pour vos menus de fin d’année.',
    partnerId: c2?.id,
    partnerName: c2?.name,
    items: itemsFromWineIds(pick(4, 3), pool, c2).map((it) => ({ ...it, minQty: 12 })),
    validUntil: iso(now + 18 * day),
    status: 'accepted',
  };

  const draft: Offer = {
    ...base(3, 1),
    title: en ? 'En primeur campaign' : 'Campagne primeurs',
    intro: '',
    items: itemsFromWineIds(pick(7, 5), pool),
    validUntil: addDays(iso(now), 30),
    status: 'draft',
  };

  const key = offerCounterKey(year);
  return [
    ...[published, accepted, draft].map((o): Op => ({ op: 'set', path: offerPath(orgId, o.id), data: clean(o) as never })),
    { op: 'set', path: publicOfferPath(published.publicId!), data: clean(toPublicOffer(published, org, orgId, pool, published.publicId!, now)) as never },
    { op: 'set', path: `orgs/${orgId}/counters/${key}`, data: { id: key, value: 3 } },
  ];
}
