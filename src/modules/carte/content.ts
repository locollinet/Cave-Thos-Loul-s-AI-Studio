import type { Locale, WineColor } from '@/types';

/** Langues de contenu d'une carte : fr/en (interface complète) + langues de carte supplémentaires. */
export type ContentLang = Locale | 'it' | 'de' | 'es' | 'zh' | 'ja';
export type ExtraLang = Exclude<ContentLang, Locale>;

export const EXTRA_LANGS: ExtraLang[] = ['it', 'de', 'es', 'zh', 'ja'];
export const CONTENT_LANGS: ContentLang[] = ['fr', 'en', ...EXTRA_LANGS];

export const LANG_NAMES: Record<ContentLang, string> = {
  fr: 'Français',
  en: 'English',
  it: 'Italiano',
  de: 'Deutsch',
  es: 'Español',
  zh: '中文',
  ja: '日本語',
};

export const LANG_INTL: Record<ContentLang, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  it: 'it-IT',
  de: 'de-DE',
  es: 'es-ES',
  zh: 'zh-CN',
  ja: 'ja-JP',
};

export const isContentLang = (v: unknown): v is ContentLang => typeof v === 'string' && (CONTENT_LANGS as string[]).includes(v);
export const isExtraLang = (v: unknown): v is ExtraLang => typeof v === 'string' && (EXTRA_LANGS as string[]).includes(v);

/** Langues supplémentaires valides, sans doublon, dans l'ordre canonique. */
export const normalizeLanguages = (langs: readonly unknown[] | undefined): ExtraLang[] => EXTRA_LANGS.filter((l) => (langs ?? []).includes(l));

/** Langues proposées au lecteur : fr, en puis les langues supplémentaires de la carte. */
export const offeredLanguages = (langs: readonly unknown[] | undefined): ContentLang[] => ['fr', 'en', ...normalizeLanguages(langs)];

export const PINNED_KEY = '__pinned';
export const OTHER_KEY = '__other';
export const GLASS_KEY = '__glass';

interface Content {
  colors: Record<WineColor, string>;
  pinned: string;
  other: string;
  glass: string;
  glassUnit: string;
  bottle: string;
  footer: string;
}

/** Textes standard de la carte, traduits sans IA (fonctionne hors ligne). */
export const CONTENT: Record<ContentLang, Content> = {
  fr: {
    colors: {
      bulles: 'Bulles & Champagnes',
      blanc: 'Blancs',
      rose: 'Rosés',
      orange: 'Vins orange',
      rouge: 'Rouges',
      doux: 'Vins doux',
      spiritueux: 'Spiritueux',
      autre: 'Autres',
    },
    pinned: 'Coups de cœur',
    other: 'Autres vins',
    glass: 'Au verre',
    glassUnit: 'Verre',
    bottle: 'Bouteille',
    footer: 'Prix en euros, TTC. L’abus d’alcool est dangereux pour la santé, à consommer avec modération.',
  },
  en: {
    colors: {
      bulles: 'Sparkling & Champagne',
      blanc: 'White wines',
      rose: 'Rosé wines',
      orange: 'Orange wines',
      rouge: 'Red wines',
      doux: 'Sweet wines',
      spiritueux: 'Spirits',
      autre: 'Other',
    },
    pinned: "Sommelier's favourites",
    other: 'Other wines',
    glass: 'By the glass',
    glassUnit: 'Glass',
    bottle: 'Bottle',
    footer: 'Prices in euros, incl. VAT. Please drink responsibly.',
  },
  it: {
    colors: {
      bulles: 'Bollicine & Champagne',
      blanc: 'Vini bianchi',
      rose: 'Vini rosati',
      orange: 'Vini orange',
      rouge: 'Vini rossi',
      doux: 'Vini dolci',
      spiritueux: 'Distillati',
      autre: 'Altro',
    },
    pinned: 'I preferiti del sommelier',
    other: 'Altri vini',
    glass: 'Al calice',
    glassUnit: 'Calice',
    bottle: 'Bottiglia',
    footer: 'Prezzi in euro, IVA inclusa. Bevi responsabilmente.',
  },
  de: {
    colors: {
      bulles: 'Schaumweine & Champagner',
      blanc: 'Weißweine',
      rose: 'Roséweine',
      orange: 'Orange-Weine',
      rouge: 'Rotweine',
      doux: 'Süßweine',
      spiritueux: 'Spirituosen',
      autre: 'Sonstiges',
    },
    pinned: 'Empfehlungen des Sommeliers',
    other: 'Weitere Weine',
    glass: 'Glasweise',
    glassUnit: 'Glas',
    bottle: 'Flasche',
    footer: 'Preise in Euro inkl. MwSt. Bitte genießen Sie verantwortungsvoll.',
  },
  es: {
    colors: {
      bulles: 'Espumosos y Champagne',
      blanc: 'Vinos blancos',
      rose: 'Vinos rosados',
      orange: 'Vinos naranjas',
      rouge: 'Vinos tintos',
      doux: 'Vinos dulces',
      spiritueux: 'Destilados',
      autre: 'Otros',
    },
    pinned: 'Favoritos del sumiller',
    other: 'Otros vinos',
    glass: 'Por copas',
    glassUnit: 'Copa',
    bottle: 'Botella',
    footer: 'Precios en euros, IVA incluido. Bebe con moderación.',
  },
  zh: {
    colors: {
      bulles: '起泡酒与香槟',
      blanc: '白葡萄酒',
      rose: '桃红葡萄酒',
      orange: '橙酒',
      rouge: '红葡萄酒',
      doux: '甜酒',
      spiritueux: '烈酒',
      autre: '其他',
    },
    pinned: '侍酒师推荐',
    other: '其他葡萄酒',
    glass: '单杯',
    glassUnit: '每杯',
    bottle: '整瓶',
    footer: '价格以欧元计，含增值税。请理性饮酒。',
  },
  ja: {
    colors: {
      bulles: 'スパークリング＆シャンパーニュ',
      blanc: '白ワイン',
      rose: 'ロゼワイン',
      orange: 'オレンジワイン',
      rouge: '赤ワイン',
      doux: '甘口ワイン',
      spiritueux: 'スピリッツ',
      autre: 'その他',
    },
    pinned: 'ソムリエのおすすめ',
    other: 'その他のワイン',
    glass: 'グラスワイン',
    glassUnit: 'グラス',
    bottle: 'ボトル',
    footer: '価格はユーロ表示（税込）です。お酒は適量を。',
  },
};

export const contentFor = (lang: unknown): Content => CONTENT[isContentLang(lang) ? lang : 'fr'];

/** Titre standard (couleur, coups de cœur, au verre, autres vins) dans la langue demandée ; undefined si titre libre. */
export function builtInTitle(titleKey: string | undefined, lang: ContentLang): string | undefined {
  if (!titleKey) return undefined;
  const c = contentFor(lang);
  if (titleKey === PINNED_KEY) return c.pinned;
  if (titleKey === OTHER_KEY) return c.other;
  if (titleKey === GLASS_KEY) return c.glass;
  return (c.colors as Record<string, string>)[titleKey];
}
