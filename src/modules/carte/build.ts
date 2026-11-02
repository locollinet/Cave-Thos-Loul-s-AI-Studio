import type { BrandTheme, Locale, Org, StockLevel, Wine, WineColor } from '@/types';
import { norm } from '@/lib/wine';
import { round2, ttcFromHt } from '@/lib/utils';
import { PRESETS, sanitizeTheme } from '@/lib/brand';
import { CONTENT, GLASS_KEY, OTHER_KEY, PINNED_KEY, normalizeLanguages, offeredLanguages } from './content';
import { pickTranslations, translatableTexts } from './translate';
import type { ListItem, ListSection, PublicListDoc, PublicSection, WineList } from './types';

/** Taille maximale du logo embarqué dans la carte publique (document Firestore limité à 1 Mo). */
export const MAX_LOGO_CHARS = 400_000;

type BrandOrg = Pick<Org, 'id' | 'name'> & Partial<Pick<Org, 'brand' | 'legal'>>;

/** Design effectif : charte de l'établissement, design sur mesure ou modèle. */
export function resolveListTheme(list: Pick<WineList, 'template' | 'theme' | 'useBrand'>, org?: Partial<Pick<Org, 'brand'>>): BrandTheme {
  const preset = PRESETS[list.template] ?? PRESETS.prestige;
  if (list.useBrand && org?.brand) return sanitizeTheme(org.brand, preset);
  if (list.theme) return sanitizeTheme(list.theme, preset);
  return preset;
}

/** Thème d'une carte publiée ; les anciennes publications n'ont que l'identifiant du modèle. */
export const publicTheme = (doc: Pick<PublicListDoc, 'template' | 'theme'>): BrandTheme => sanitizeTheme(doc.theme, PRESETS[doc.template] ?? PRESETS.prestige);

export function publicLogo(theme: BrandTheme, org?: Partial<Pick<Org, 'legal'>>): string | undefined {
  const logo = org?.legal?.logoDataUrl;
  return theme.showLogo && logo && /^data:image\/(png|jpe?g|webp|svg\+xml);base64,/.test(logo) && logo.length <= MAX_LOGO_CHARS ? logo : undefined;
}

export const COLOR_ORDER: WineColor[] = ['bulles', 'blanc', 'rose', 'orange', 'rouge', 'doux', 'spiritueux', 'autre'];

const REGION_ORDER = [
  'champagne',
  'alsace',
  'loire',
  'chablis',
  'bourgogne',
  'beaujolais',
  'jura',
  'savoie',
  'rhone',
  'provence',
  'languedoc',
  'roussillon',
  'sud ouest',
  'bordeaux',
  'corse',
];

export { GLASS_KEY, OTHER_KEY, PINNED_KEY };

export const defaultWineList = (language: Locale, name = '', org?: Partial<Pick<Org, 'brand'>>): WineList => ({
  id: '',
  name,
  kind: 'restaurant',
  siteIds: [],
  template: 'prestige',
  useBrand: !!org?.brand,
  language,
  groupBy: 'color',
  sectionOrder: [],
  hideOutOfStock: true,
  minStock: 1,
  excludedWineIds: [],
  pinnedWineIds: [],
  priceRule: { mode: 'multiplier', multiplier: 3, rounding: 1 },
  priceOverrides: {},
  showVintage: true,
  showFormat: true,
  showDescription: false,
  showByGlass: true,
  published: false,
  publicId: '',
  updatedAt: 0,
});

export function newPublicId(len = 24): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export const roundTo = (n: number, step: number): number => Math.round(n / step) * step;

/** Prix TTC en carte : surcharge de la carte > prix carte de la fiche > règle de la carte. */
export function priceFor(list: WineList, wine: Wine, vatRate: number): number | null {
  const override = list.priceOverrides[wine.id];
  if (override && override > 0) return override;
  if (wine.menuPriceTTC && wine.menuPriceTTC > 0) return wine.menuPriceTTC;
  const { mode, multiplier, rounding } = list.priceRule;
  const ht = mode === 'multiplier' ? (wine.buyPriceHT ?? 0) * multiplier : (wine.sellPriceHT ?? 0);
  if (ht <= 0) return null;
  return round2(roundTo(ttcFromHt(ht, vatRate), rounding));
}

export function qtyForSites(stock: StockLevel[], siteIds: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of stock) {
    if (siteIds.length && !siteIds.includes(s.siteId)) continue;
    m.set(s.wineId, (m.get(s.wineId) ?? 0) + s.qty);
  }
  return m;
}

const regionRank = (key: string): number => {
  const i = REGION_ORDER.findIndex((r) => norm(key).startsWith(r) || norm(key).includes(r));
  return i === -1 ? REGION_ORDER.length : i;
};

function groupKey(list: WineList, w: Wine): string {
  const pick = (v: string | undefined) => (v && v.trim() ? v.trim() : OTHER_KEY);
  switch (list.groupBy) {
    case 'color':
      return w.color;
    case 'country':
      return pick(w.country);
    case 'custom':
      return pick(w.appellation || w.subRegion || w.region);
    default:
      return pick(w.region);
  }
}

const isStandardKey = (list: WineList, key: string): boolean =>
  key === PINNED_KEY || key === OTHER_KEY || key === GLASS_KEY || (list.groupBy === 'color' && key in CONTENT.fr.colors);

function sectionTitle(list: WineList, key: string): string {
  const c = CONTENT[list.language] ?? CONTENT.fr;
  if (key === PINNED_KEY) return c.pinned;
  if (key === OTHER_KEY) return c.other;
  if (key === GLASS_KEY) return c.glass;
  return list.groupBy === 'color' ? c.colors[key as WineColor] ?? key : key;
}

function defaultRank(list: WineList, key: string): number {
  if (key === OTHER_KEY) return 1e6;
  if (list.groupBy === 'color') return COLOR_ORDER.indexOf(key as WineColor);
  return list.groupBy === 'region' ? regionRank(key) : 0;
}

const cmp = (a: string, b: string) => a.localeCompare(b, 'fr', { sensitivity: 'base' });

const compareItems = (a: ListItem, b: ListItem): number =>
  COLOR_ORDER.indexOf(a.color) - COLOR_ORDER.indexOf(b.color) ||
  cmp(a.producer, b.producer) ||
  cmp(a.name, b.name) ||
  cmp(a.vintage, b.vintage) ||
  a.formatCl - b.formatCl;

/** Construit les sections d'une carte à partir du référentiel et du stock courant (carte « vivante »). */
export function buildListSections(
  list: WineList,
  wines: Wine[],
  stock: StockLevel[],
  org: Pick<Org, 'defaultVatRate'>,
): ListSection[] {
  const qty = qtyForSites(stock, list.siteIds);
  const excluded = new Set(list.excludedWineIds);
  const pinned = new Set(list.pinnedWineIds);
  const groups = new Map<string, ListItem[]>();

  for (const w of wines) {
    if (w.isArchived || w.hideFromMenu || excluded.has(w.id)) continue;
    const n = qty.get(w.id) ?? 0;
    if (list.hideOutOfStock && n < Math.max(1, list.minStock)) continue;
    const item: ListItem = {
      wineId: w.id,
      producer: w.producer,
      name: w.name,
      vintage: w.vintage,
      formatCl: w.formatCl,
      color: w.color,
      region: w.region || undefined,
      grapes: w.grapes || undefined,
      priceTTC: priceFor(list, w, org.defaultVatRate),
      note: w.technicalSheet?.bouche || w.technicalSheet?.nez || undefined,
      pinned: pinned.has(w.id),
      qty: n,
      ...(w.allergens?.length ? { allergens: w.allergens } : {}),
    };
    const key = item.pinned ? PINNED_KEY : groupKey(list, w);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const customRank = new Map(list.sectionOrder.map((k, i) => [k, i]));
  const keys = [...groups.keys()].filter((k) => k !== PINNED_KEY);
  keys.sort((a, b) => {
    const ca = customRank.get(a);
    const cb = customRank.get(b);
    if (ca !== undefined || cb !== undefined) return (ca ?? 1e5) - (cb ?? 1e5) || defaultRank(list, a) - defaultRank(list, b);
    return defaultRank(list, a) - defaultRank(list, b) || cmp(sectionTitle(list, a), sectionTitle(list, b));
  });
  if (groups.has(PINNED_KEY)) keys.unshift(PINNED_KEY);

  if (list.showByGlass !== false) {
    const bottlePrice = new Map([...groups.values()].flat().map((i) => [i.wineId, i.priceTTC]));
    const glass: ListItem[] = [];
    for (const w of wines) {
      const g = w.byGlass;
      if (!g?.enabled || !g.priceTTC || g.priceTTC <= 0 || w.isArchived || w.hideFromMenu || excluded.has(w.id)) continue;
      const n = qty.get(w.id) ?? 0;
      if (list.hideOutOfStock && n < 1) continue;
      glass.push({
        wineId: w.id,
        producer: w.producer,
        name: w.name,
        vintage: w.vintage,
        formatCl: w.formatCl,
        color: w.color,
        region: w.region || undefined,
        grapes: w.grapes || undefined,
        priceTTC: bottlePrice.get(w.id) ?? null,
        note: w.technicalSheet?.bouche || w.technicalSheet?.nez || undefined,
        pinned: pinned.has(w.id),
        qty: n,
        ...(g.glassCl > 0 ? { glassCl: g.glassCl } : {}),
        glassPriceTTC: round2(g.priceTTC),
        ...(w.allergens?.length ? { allergens: w.allergens } : {}),
      });
    }
    if (glass.length) {
      groups.set(GLASS_KEY, glass);
      keys.unshift(GLASS_KEY);
    }
  }

  return keys.map((key) => ({
    key,
    title: sectionTitle(list, key),
    ...(isStandardKey(list, key) ? { titleKey: key } : {}),
    items: [...(groups.get(key) ?? [])].sort(compareItems),
  }));
}

/** Nombre de vins distincts affichés (un vin servi au verre et en bouteille compte une fois). */
export const countWines = (sections: ListSection[]): number => new Set(sections.flatMap((s) => s.items.map((i) => i.wineId))).size;

/** Instantané public : aucun prix d'achat, aucun stock. */
export function toPublicDoc(list: WineList, sections: ListSection[], org: BrandOrg, updatedAt: number): PublicListDoc {
  const pub: PublicSection[] = sections.map((s) => ({
    title: s.title,
    ...(s.titleKey ? { titleKey: s.titleKey } : {}),
    items: s.items.map((i) => {
      const out: PublicSection['items'][number] = {
        producer: i.producer,
        name: i.name,
        vintage: list.showVintage ? i.vintage : '',
        formatCl: list.showFormat ? i.formatCl : 0,
        color: i.color,
        priceTTC: i.priceTTC,
      };
      if (i.region) out.region = i.region;
      if (i.grapes) out.grapes = i.grapes;
      if (list.showDescription && i.note) out.note = i.note;
      if (i.glassPriceTTC !== undefined) {
        out.glassPriceTTC = i.glassPriceTTC;
        if (i.glassCl) out.glassCl = i.glassCl;
      }
      if (i.allergens?.length) out.allergens = i.allergens;
      return out;
    }),
  }));
  const theme = resolveListTheme(list, org);
  const logo = publicLogo(theme, org);
  const languages = normalizeLanguages(list.languages);
  const keys = new Set(translatableTexts({ name: list.name, sections: pub, theme }).map((x) => x.key));
  const translations = pickTranslations(list.translations, list.language, offeredLanguages(languages), keys);
  return {
    publicId: list.publicId,
    orgId: org.id,
    orgName: org.name,
    name: list.name,
    template: list.template,
    theme,
    ...(logo ? { logoDataUrl: logo } : {}),
    language: list.language,
    ...(languages.length ? { languages } : {}),
    ...(translations ? { translations } : {}),
    updatedAt,
    sections: pub,
  };
}

/** Sérialisation à clés triées : l'ordre des champs renvoyé par la base n'influe pas sur l'empreinte. */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : stableJson(x))).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** Empreinte du contenu (hors date) pour éviter les republications inutiles. */
export function hashPublicDoc(
  d: Pick<PublicListDoc, 'orgId' | 'orgName' | 'name' | 'template' | 'language' | 'sections' | 'theme' | 'logoDataUrl' | 'languages' | 'translations'>,
): string {
  const s = stableJson([d.orgId, d.orgName, d.name, d.template, d.language, d.sections, d.theme ?? null, d.logoDataUrl ?? '', d.languages ?? [], d.translations ?? {}]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${(h >>> 0).toString(36)}-${s.length}`;
}

export function listToCsvRows(sections: ListSection[]): (string | number)[][] {
  const rows: (string | number)[][] = [['section', 'producer', 'name', 'vintage', 'format_cl', 'color', 'region', 'price_ttc', 'glass_cl', 'glass_price_ttc']];
  for (const s of sections)
    for (const i of s.items)
      rows.push([s.title, i.producer, i.name, i.vintage, i.formatCl, i.color, i.region ?? '', i.priceTTC ?? '', i.glassCl ?? '', i.glassPriceTTC ?? '']);
  return rows;
}

/** Remonte ou descend une section dans l'ordre courant. */
export function moveSection(keys: string[], key: string, dir: -1 | 1): string[] {
  const i = keys.indexOf(key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= keys.length) return keys;
  const out = [...keys];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
