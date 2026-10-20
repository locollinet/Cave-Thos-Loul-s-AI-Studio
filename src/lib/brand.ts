import type { CSSProperties } from 'react';
import type { BrandTheme, FontId } from '@/types';

export type FontKind = 'serif' | 'display' | 'sans' | 'script';

export const FONTS: Record<FontId, { label: string; kind: FontKind; stack: string; google: string }> = {
  cormorant: { label: 'Cormorant Garamond', kind: 'serif', stack: "'Cormorant Garamond', Garamond, serif", google: 'Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400' },
  playfair: { label: 'Playfair Display', kind: 'serif', stack: "'Playfair Display', Georgia, serif", google: 'Playfair+Display:ital,wght@0,400;0,500;0,600;1,400' },
  bodoni: { label: 'Bodoni Moda', kind: 'serif', stack: "'Bodoni Moda', Didot, serif", google: 'Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,500;0,6..96,600;1,6..96,400' },
  ebgaramond: { label: 'EB Garamond', kind: 'serif', stack: "'EB Garamond', Garamond, serif", google: 'EB+Garamond:ital,wght@0,400;0,500;0,600;1,400' },
  caslon: { label: 'Libre Caslon', kind: 'serif', stack: "'Libre Caslon Text', Georgia, serif", google: 'Libre+Caslon+Text:ital,wght@0,400;0,700;1,400' },
  fraunces: { label: 'Fraunces', kind: 'serif', stack: "'Fraunces', Georgia, serif", google: 'Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400' },
  cinzel: { label: 'Cinzel', kind: 'display', stack: "'Cinzel', 'Trajan Pro', serif", google: 'Cinzel:wght@400;500;600' },
  marcellus: { label: 'Marcellus', kind: 'display', stack: "'Marcellus', serif", google: 'Marcellus' },
  italiana: { label: 'Italiana', kind: 'display', stack: "'Italiana', serif", google: 'Italiana' },
  inter: { label: 'Inter', kind: 'sans', stack: "'Inter', system-ui, sans-serif", google: 'Inter:wght@400;500;600' },
  jost: { label: 'Jost', kind: 'sans', stack: "'Jost', 'Futura', sans-serif", google: 'Jost:wght@300;400;500;600' },
  montserrat: { label: 'Montserrat', kind: 'sans', stack: "'Montserrat', sans-serif", google: 'Montserrat:wght@300;400;500;600' },
  josefin: { label: 'Josefin Sans', kind: 'sans', stack: "'Josefin Sans', sans-serif", google: 'Josefin+Sans:wght@300;400;600' },
  lato: { label: 'Lato', kind: 'sans', stack: "'Lato', sans-serif", google: 'Lato:wght@300;400;700' },
  pinyon: { label: 'Pinyon Script', kind: 'script', stack: "'Pinyon Script', cursive", google: 'Pinyon+Script' },
  caveat: { label: 'Caveat', kind: 'script', stack: "'Caveat', 'Segoe Print', cursive", google: 'Caveat:wght@400;600;700' },
};

export const FONT_IDS = Object.keys(FONTS) as FontId[];
export const ORNAMENTS: BrandTheme['ornament'][] = ['none', 'line', 'double', 'fade', 'dots', 'diamond'];
export const ALIGNS: BrandTheme['align'][] = ['center', 'left'];
export const CASES: BrandTheme['sectionCase'][] = ['upper', 'smallcaps', 'normal'];
export const DENSITIES: BrandTheme['density'][] = ['compact', 'normal', 'airy'];
export const PRICE_STYLES: BrandTheme['priceStyle'][] = ['right', 'leader', 'below'];
export const TITLE_SCALES: BrandTheme['titleScale'][] = ['sm', 'md', 'lg'];

/** Charge à la demande les polices Google nécessaires (une seule fois par police). */
export function ensureFonts(ids: FontId[]): void {
  if (typeof document === 'undefined') return;
  for (const id of new Set(ids)) {
    const font = FONTS[id];
    if (!font || document.getElementById(`lt-font-${id}`)) continue;
    const link = document.createElement('link');
    link.id = `lt-font-${id}`;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`;
    document.head.appendChild(link);
  }
}

/* ------------------------------------------------------------------ couleurs */

const HEX = /^#[0-9a-f]{6}$/i;

export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG 2.x (1 à 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const readableOn = (hex: string): string => (contrast(hex, '#000000') >= contrast(hex, '#ffffff') ? '#000000' : '#ffffff');

export function mix(a: string, b: string, weightA: number): string {
  const [ra, ga, ba] = rgb(a);
  const [rb, gb, bb] = rgb(b);
  const c = (x: number, y: number) => Math.round(x * weightA + y * (1 - weightA)).toString(16).padStart(2, '0');
  return `#${c(ra, rb)}${c(ga, gb)}${c(ba, bb)}`;
}

/* ------------------------------------------------------------------ préréglages */

const base: Omit<BrandTheme, 'headingFont' | 'bodyFont' | 'background' | 'text' | 'accent'> = {
  ornament: 'line',
  align: 'center',
  sectionCase: 'upper',
  density: 'normal',
  priceStyle: 'right',
  titleScale: 'md',
  showLogo: true,
  tagline: '',
  footer: '',
};

export const PRESETS = {
  palace: { ...base, headingFont: 'cormorant', bodyFont: 'jost', background: '#f8f5ee', text: '#1b2233', accent: '#9a7b4f', ornament: 'diamond', density: 'airy', priceStyle: 'leader', titleScale: 'lg' },
  prestige: { ...base, headingFont: 'fraunces', bodyFont: 'fraunces', background: '#fbf7ef', text: '#2b1a1d', accent: '#8a2a3b' },
  epure: { ...base, headingFont: 'inter', bodyFont: 'inter', background: '#ffffff', text: '#171717', accent: '#525252', ornament: 'none', align: 'left', density: 'compact' },
  bistrot: { ...base, headingFont: 'caveat', bodyFont: 'caveat', background: '#232a2c', text: '#f3f0e4', accent: '#e7c98a', ornament: 'dots', sectionCase: 'normal', titleScale: 'lg' },
  or: { ...base, headingFont: 'cinzel', bodyFont: 'cormorant', background: '#0b0b0c', text: '#ece3cc', accent: '#d4af37', ornament: 'fade' },
} satisfies Record<string, BrandTheme>;

export type PresetId = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

/* ------------------------------------------------------------------ validation (données publiques lues depuis Firestore) */

const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

export function sanitizeTheme(input: unknown, fallback: BrandTheme = PRESETS.prestige): BrandTheme {
  const v = (input && typeof input === 'object' ? input : {}) as Partial<Record<keyof BrandTheme, unknown>>;
  const color = (x: unknown, d: string) => (typeof x === 'string' && HEX.test(x) ? x.toLowerCase() : d);
  return {
    headingFont: oneOf(v.headingFont, FONT_IDS, fallback.headingFont),
    bodyFont: oneOf(v.bodyFont, FONT_IDS, fallback.bodyFont),
    background: color(v.background, fallback.background),
    text: color(v.text, fallback.text),
    accent: color(v.accent, fallback.accent),
    ornament: oneOf(v.ornament, ORNAMENTS, fallback.ornament),
    align: oneOf(v.align, ALIGNS, fallback.align),
    sectionCase: oneOf(v.sectionCase, CASES, fallback.sectionCase),
    density: oneOf(v.density, DENSITIES, fallback.density),
    priceStyle: oneOf(v.priceStyle, PRICE_STYLES, fallback.priceStyle),
    titleScale: oneOf(v.titleScale, TITLE_SCALES, fallback.titleScale),
    showLogo: typeof v.showLogo === 'boolean' ? v.showLogo : fallback.showLogo,
    tagline: text(v.tagline, 120),
    footer: text(v.footer, 240),
  };
}

export interface ThemeChecks {
  text: number;
  accent: number;
  textOk: boolean;
  accentOk: boolean;
}

/** Contraste texte (≥ 4,5:1) et accent, utilisé en titres et prix (≥ 3:1). */
export function checkTheme(t: BrandTheme): ThemeChecks {
  const tc = contrast(t.text, t.background);
  const ac = contrast(t.accent, t.background);
  return { text: tc, accent: ac, textOk: tc >= 4.5, accentOk: ac >= 3 };
}

/**
 * Variables CSS d'une charte. Redéfinit aussi les jetons de l'interface (--brand, --surface…)
 * pour que les composants communs (sommelier, recherche) adoptent l'identité de l'établissement.
 */
export function themeVars(t: BrandTheme): CSSProperties {
  const dark = luminance(t.background) < 0.2;
  return {
    '--lt-bg': t.background,
    '--lt-ink': t.text,
    '--lt-accent': t.accent,
    '--lt-muted': mix(t.text, t.background, 0.66),
    '--lt-rule': mix(t.accent, t.background, 0.55),
    '--lt-head': FONTS[t.headingFont].stack,
    '--lt-body': FONTS[t.bodyFont].stack,
    '--bg': t.background,
    '--surface': mix(t.text, t.background, dark ? 0.05 : 0.015),
    '--surface-2': mix(t.text, t.background, dark ? 0.1 : 0.05),
    '--border': mix(t.text, t.background, 0.16),
    '--text': t.text,
    '--muted': mix(t.text, t.background, 0.66),
    '--brand': t.accent,
    '--brand-fg': readableOn(t.accent),
    '--brand-soft': mix(t.accent, t.background, 0.14),
    '--app-sans': FONTS[t.bodyFont].stack,
    '--app-display': FONTS[t.headingFont].stack,
    backgroundColor: t.background,
    color: t.text,
    fontFamily: FONTS[t.bodyFont].stack,
  } as CSSProperties;
}

/** Couleur de marque utilisable dans l'application (lisible sur le fond clair ou sombre de l'interface). */
export function appBrandColor(t: BrandTheme, surface: string): string | null {
  return [t.accent, t.text, t.background].find((c) => contrast(c, surface) >= 4.5) ?? null;
}
