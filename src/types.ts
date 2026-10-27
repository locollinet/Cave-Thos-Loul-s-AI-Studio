// Modèle de données commun à tous les modules. Tout est scopé par organisation :
// Firestore : orgs/{orgId}/{collection}/{id}

export type OrgProfile = 'negoce' | 'independant' | 'restaurant' | 'chaine';
export type ModuleId = 'stock' | 'carte' | 'achats' | 'negoce' | 'compta' | 'pilotage';
export type Role = 'owner' | 'manager' | 'sommelier' | 'accountant' | 'staff';
export type Locale = 'fr' | 'en';

export interface LegalInfo {
  legalName: string;
  legalForm: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  siret: string;
  vatNumber: string;
  exciseNumber: string; // n° d'accises / entrepositaire agréé
  iban: string;
  bic: string;
  legalMentions: string;
  logoDataUrl?: string;
}

export type FontId =
  | 'cormorant'
  | 'playfair'
  | 'bodoni'
  | 'ebgaramond'
  | 'caslon'
  | 'cinzel'
  | 'marcellus'
  | 'italiana'
  | 'fraunces'
  | 'inter'
  | 'jost'
  | 'montserrat'
  | 'josefin'
  | 'lato'
  | 'pinyon'
  | 'caveat';

/** Charte graphique d'un établissement ou d'une carte : rendue telle quelle sur l'aperçu, l'impression et la page publique. */
export interface BrandTheme {
  headingFont: FontId;
  bodyFont: FontId;
  background: string; // #rrggbb
  text: string;
  accent: string;
  ornament: 'none' | 'line' | 'double' | 'fade' | 'dots' | 'diamond';
  align: 'center' | 'left';
  sectionCase: 'upper' | 'smallcaps' | 'normal';
  density: 'compact' | 'normal' | 'airy';
  priceStyle: 'right' | 'leader' | 'below';
  titleScale: 'sm' | 'md' | 'lg';
  showLogo: boolean;
  tagline: string;
  footer: string;
}

export interface Org {
  id: string;
  ownerUid: string;
  name: string;
  brand?: BrandTheme; // charte de l'établissement
  brandApp?: boolean; // habiller l'application aux couleurs de l'établissement
  profile: OrgProfile;
  modules: ModuleId[];
  locale: Locale;
  currency: string;
  legal: LegalInfo;
  invoicePrefix: string;
  quotePrefix: string;
  defaultVatRate: number; // en %
  defaultCoefficient: number; // coefficient de prix de vente par défaut (HT achat -> HT vente)
  createdAt: number;
  isDemo?: boolean;
  expiresAt?: number; // timestamp d'expiration de la démo
}

export interface Member {
  uid: string;
  email: string;
  name: string;
  role: Role;
  createdAt: number;
}

export interface Invite {
  email: string; // = id (minuscule)
  role: Role;
  token?: string;
  createdAt: number;
  expiresAt?: number; // timestamp d'expiration (7 jours par défaut)
}

export type SiteKind = 'cave' | 'restaurant' | 'bar' | 'boutique' | 'entrepot' | 'chambre';

export interface Site {
  id: string;
  name: string;
  kind: SiteKind;
  address?: string;
  notes?: string;
  isArchived?: boolean;
  createdAt: number;
}

export type WineColor = 'rouge' | 'blanc' | 'rose' | 'bulles' | 'orange' | 'doux' | 'spiritueux' | 'autre';

export interface TechnicalSheet {
  aop?: string;
  lieuDit?: string;
  sol?: string;
  cepage?: string;
  ageVignes?: string;
  vinification?: string;
  elevage?: string;
  oeil?: string;
  nez?: string;
  bouche?: string;
  temperatureService?: string;
  garde?: string;
  accords?: string;
  generatedByAI?: boolean;
  sources?: string;
  confidence?: 'high' | 'medium' | 'estimated' | 'partial';
  missingInfo?: string;
}

export interface Producer {
  id: string;
  name: string;
  region?: string;
  country?: string;
  coefficient?: number; // surcharge du coefficient d'organisation
  contact?: string;
  notes?: string;
  isArchived?: boolean;
  createdAt: number;
}

export interface ByTheGlass {
  enabled: boolean;
  glassCl: number; // contenance d'un verre servi (ex. 12,5)
  priceTTC?: number; // prix du verre à la carte
}

export interface Wine {
  id: string;
  producerId?: string;
  producer: string; // nom dénormalisé (le référentiel peut évoluer sans casser l'affichage)
  name: string; // appellation / cuvée telle qu'affichée
  appellation?: string;
  cuvee?: string;
  vintage: string; // "2019" ou "NM"
  color: WineColor;
  formatCl: number; // 75, 150, 37.5…
  region?: string;
  subRegion?: string;
  country?: string;
  grapes?: string;
  abv?: number;
  byGlass?: ByTheGlass;
  hasImage?: boolean; // photo stockée à part : orgs/{orgId}/wineImages/{wineId}
  buyPriceHT?: number;
  sellPriceHT?: number; // prix de vente HT négoce
  menuPriceTTC?: number; // prix de vente TTC en carte (restauration) ; sinon calculé
  coefficient?: number;
  alertThreshold: number;
  apogeeFrom?: number;
  apogeeTo?: number;
  ean?: string;
  notes?: string;
  technicalSheet?: TechnicalSheet;
  hideFromMenu?: boolean;
  isPreSale?: boolean;
  isExceptional?: boolean; // Flacon d'exception / haute conservation (active la traçabilité unitaire)
  posCode?: string; // Code PLU / Caisse enregistreuse (POS)
  isArchived?: boolean;
  canonicalKey: string;
  createdAt: number;
  updatedAt: number;
}

export interface StockLevel {
  id: string; // `${wineId}__${siteId}`
  wineId: string;
  siteId: string;
  qty: number;
  bin?: string; // emplacement (casier, étagère)
  updatedAt: number;
}

/* ------------------------------------------------------------------ Cartographie & Casiers de cave */

export interface CellarRack {
  id: string;
  siteId: string;
  name: string; // Ex: "Casier A — Bourgogne Rouges"
  prefix: string; // Ex: "A", "B", "C"
  rows: number; // Ex: 5 rangées
  cols: number; // Ex: 6 colonnes
  capacityPerSlot?: number; // Capacité standard par alvéole (défaut 1)
  zone?: string; // Ex: "Cave voûtée", "Armoire salle", "Chambre froide"
  temperatureC?: number; // Ex: 12.5
  humidityPct?: number; // Ex: 75
  createdAt: number;
}

/* ------------------------------------------------------------------ Flacons d'exception & Traçabilité unitaire */

export type BottleConditionLevel = 'goulot' | 'bas_goulot' | 'haute_epaule' | 'mi_epaule';
export type BottleConditionLabel = 'parfaite' | 'griffee' | 'tachee' | 'fanee';
export type BottleConditionCapsule = 'integre' | 'ciree' | 'abimee';

export interface RareBottle {
  id: string;
  wineId: string;
  siteId: string;
  bottleNumber: string; // Ex: "04821 / 5000" gravé sur l'étiquette
  cbo?: boolean; // En Caisse Bois d'Origine cerclée
  conditionLevel: BottleConditionLevel;
  conditionLabel: BottleConditionLabel;
  conditionCapsule: BottleConditionCapsule;
  provenance?: string; // Ex: "Allocation Domaine 2021", "Enchères Baghera"
  bin?: string; // Coordonnée casier (ex: "A3")
  status: 'in_cellar' | 'served' | 'corked' | 'sold';
  servedAt?: number;
  servedBy?: string;
  servedTable?: string;
  servedNote?: string;
  notes?: string;
  createdAt: number;
  updatedAt?: number;
}

/* ------------------------------------------------------------------ Allocations Vignerons & Primeurs */

export interface WineAllocation {
  id: string;
  producerId?: string;
  producerName: string; // Ex: "Domaine de la Romanée-Conti"
  cuveeName: string; // Ex: "Romanée-Conti Grand Cru"
  vintage: string; // Ex: "2021"
  formatCl?: number; // 75, 150...
  campaignYear: number; // Année de campagne (ex: 2024)
  quotaBottles: number; // Quota réservé par le vigneron
  orderedBottles: number; // Nombre commandé
  receivedBottles: number; // Nombre livré en cave
  unitPriceHT?: number; // Prix d'achat HT domaine
  status: 'pending' | 'confirmed' | 'delivered' | 'cancelled';
  notes?: string;
  deadlineDate?: string; // Date limite de confirmation d'allocation
  createdAt: number;
  updatedAt?: number;
}

export type MovementType = 'in' | 'out' | 'transfer' | 'adjust';
export type MovementReason =
  | 'achat'
  | 'vente'
  | 'consommation'
  | 'casse'
  | 'degustation'
  | 'offert'
  | 'transfert'
  | 'inventaire'
  | 'depot_vente'
  | 'retour'
  | 'verre'
  | 'bouchonne'
  | 'oxyde'
  | 'autre';

export interface Movement {
  id: string;
  date: string; // ISO yyyy-mm-dd
  wineId: string;
  wineLabel: string;
  siteId: string;
  toSiteId?: string; // transferts
  type: MovementType;
  qty: number; // toujours positif ; pour 'adjust', delta signé
  reason: MovementReason;
  unitCostHT?: number;
  unitPriceHT?: number;
  partnerId?: string;
  documentId?: string;
  note?: string;
  userId: string;
  userName: string;
  createdAt: number;
}

export type PartnerKind = 'client' | 'supplier';

export interface Partner {
  id: string;
  kind: PartnerKind;
  name: string;
  customerType?: 'pro' | 'particulier';
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  vatNumber?: string;
  paymentTermsDays?: number;
  discountPct?: number;
  notes?: string;
  isArchived?: boolean;
  createdAt: number;
}

export interface InventorySession {
  id: string;
  siteId: string;
  name: string;
  status: 'open' | 'closed';
  counts: Record<string, number>; // wineId -> quantité comptée
  startedAt: number;
  closedAt?: number;
  userName: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  photoURL?: string;
  demo?: boolean;
  emailVerified?: boolean;
  isPlatformAdmin?: boolean;
}

export const WINE_COLORS: WineColor[] = ['rouge', 'blanc', 'rose', 'bulles', 'orange', 'doux', 'spiritueux', 'autre'];

export const ROLE_RANK: Record<Role, number> = { owner: 5, manager: 4, sommelier: 3, accountant: 2, staff: 1 };

/* ------------------------------------------------------------------ Achats (produit par l'import de factures, lu par compta et pilotage) */

export interface PurchaseLine {
  wineId?: string; // rapproché du référentiel
  description: string;
  producer?: string;
  vintage?: string;
  formatCl?: number;
  qty: number;
  unitPriceHT: number;
  vatRate: number; // %
  received: boolean; // entrée de stock effectuée
}

export interface PurchaseInvoice {
  id: string;
  supplierId?: string;
  supplierName: string;
  number: string;
  date: string; // yyyy-mm-dd
  dueDate?: string;
  lines: PurchaseLine[];
  shippingHT?: number;
  totalHT: number;
  totalVAT: number;
  totalTTC: number;
  status: 'draft' | 'received' | 'paid';
  paymentDate?: string;
  paymentMethod?: string;
  siteId?: string; // site de réception
  fileName?: string;
  createdAt: number;
  createdBy: string;
}
