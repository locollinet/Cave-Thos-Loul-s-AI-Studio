import type { BrandTheme, Locale, WineColor } from '@/types';
import type { ExtraLang } from './content';

/** Traductions des textes libres : langue → clé de texte (empreinte du texte source) → traduction. */
export type ListTranslations = Partial<Record<string, Record<string, string>>>;

export type ListKind = 'restaurant' | 'bar' | 'degustation' | 'emporter';
export type ListTemplate = 'palace' | 'prestige' | 'epure' | 'bistrot' | 'or';
export type GroupBy = 'region' | 'color' | 'country' | 'custom';
export type PriceMode = 'multiplier' | 'fixed';
export type Rounding = 0.5 | 1 | 5;

export const LIST_KINDS: ListKind[] = ['restaurant', 'bar', 'degustation', 'emporter'];
export const LIST_TEMPLATES: ListTemplate[] = ['palace', 'prestige', 'epure', 'bistrot', 'or'];
export const GROUPINGS: GroupBy[] = ['region', 'color', 'country', 'custom'];
export const ROUNDINGS: Rounding[] = [0.5, 1, 5];

export interface PriceRule {
  mode: PriceMode;
  multiplier: number; // appliqué au prix d'achat HT, puis TVA
  rounding: Rounding;
}

export interface WineList {
  id: string;
  name: string;
  kind: ListKind;
  siteIds: string[]; // vide = tous les sites
  template: ListTemplate;
  theme?: BrandTheme | null; // design sur mesure ; prioritaire sur le modèle
  useBrand?: boolean; // suit la charte de l'établissement (mise à jour automatique)
  language: Locale;
  groupBy: GroupBy;
  sectionOrder: string[];
  hideOutOfStock: boolean;
  minStock: number;
  excludedWineIds: string[];
  pinnedWineIds: string[];
  priceRule: PriceRule;
  priceOverrides: Record<string, number>;
  showVintage: boolean;
  showFormat: boolean;
  showDescription: boolean;
  showByGlass?: boolean; // section « Au verre » en tête (absent = affichée)
  languages?: ExtraLang[]; // langues proposées en plus du français et de l'anglais
  translations?: ListTranslations;
  dismissedSuggestions?: string[]; // suggestions de composition ignorées (`${kind}:${wineId}`)
  published: boolean;
  publicId: string;
  updatedAt: number;
}

export interface ListItem {
  wineId: string;
  producer: string;
  name: string;
  vintage: string;
  formatCl: number;
  color: WineColor;
  region?: string;
  grapes?: string;
  priceTTC: number | null;
  note?: string;
  pinned: boolean;
  qty: number;
  glassCl?: number;
  glassPriceTTC?: number;
}

export interface ListSection {
  key: string;
  title: string;
  /** Présent pour les titres standard (traduits sans IA) : couleur, __pinned, __other, __glass. */
  titleKey?: string;
  items: ListItem[];
}

export interface PublicItem {
  producer: string;
  name: string;
  vintage: string;
  formatCl: number;
  color: WineColor;
  region?: string;
  grapes?: string;
  priceTTC: number | null; // section « Au verre » : prix de la bouteille si elle figure aussi à la carte, sinon null
  note?: string;
  glassCl?: number;
  glassPriceTTC?: number;
}

export interface PublicSection {
  title: string;
  titleKey?: string;
  items: PublicItem[];
}

export interface PublicListDoc {
  publicId: string;
  orgId: string;
  orgName: string;
  name: string;
  template: ListTemplate;
  theme?: BrandTheme; // charte résolue au moment de la publication
  logoDataUrl?: string;
  language: Locale;
  languages?: ExtraLang[];
  translations?: ListTranslations;
  updatedAt: number;
  sections: PublicSection[];
}

export interface SommelierPick {
  index?: number;
  name?: string;
  reason: string;
}

export interface SommelierAnswer {
  picks: SommelierPick[];
  text: string;
}
