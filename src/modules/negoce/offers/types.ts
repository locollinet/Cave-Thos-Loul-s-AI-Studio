import type { BrandTheme, Locale, WineColor } from '@/types';

export type OfferStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';

export interface OfferItem {
  wineId: string;
  priceHT: number; // prix client HT (remise client déjà appliquée)
  minQty?: number;
  note?: string;
}

/** Offre commerciale : sélection de vins à prix client, envoyée en PDF ou par lien. orgs/{orgId}/offers/{id} */
export interface Offer {
  id: string;
  number: string; // OF-2026-0001
  title: string;
  intro: string;
  partnerId?: string;
  partnerName?: string;
  language?: Locale;
  items: OfferItem[];
  validUntil: string;
  status: OfferStatus;
  publicId?: string;
  published: boolean;
  quoteId?: string; // devis issu de l'offre
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
}

export interface PublicOfferItem {
  producer: string;
  name: string;
  vintage: string;
  formatCl: number;
  color: WineColor;
  region?: string;
  appellation?: string;
  priceHT: number;
  priceTTC: number;
  minQty?: number;
  note?: string;
}

/** Instantané public : public_offers/{publicId}. Jamais de prix d'achat ni de stock. */
export interface PublicOfferDoc {
  publicId: string;
  orgId: string;
  orgName: string;
  number: string;
  title: string;
  intro: string;
  clientName?: string;
  contactEmail?: string;
  language: Locale;
  validUntil: string;
  vatRate: number;
  theme: BrandTheme;
  logoDataUrl?: string;
  items: PublicOfferItem[];
  updatedAt: number;
}
