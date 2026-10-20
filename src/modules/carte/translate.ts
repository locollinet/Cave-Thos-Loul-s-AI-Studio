import type { Locale } from '@/types';
import { builtInTitle, offeredLanguages, type ContentLang } from './content';
import type { ListTranslations, WineList } from './types';
import type { SheetDoc } from './templates';

/** Longueur maximale d'un texte source envoyé à la traduction et d'une traduction publiée. */
export const MAX_SOURCE_CHARS = 1000;
export const MAX_TRANSLATION_CHARS = 1200;

/** Clé stable d'un texte libre : empreinte du texte source (une traduction devient caduque si le texte change). */
export function textKey(text: string): string {
  const s = text.trim();
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `t${(h >>> 0).toString(36)}${s.length.toString(36)}`;
}

export type TextKind = 'name' | 'tagline' | 'footer' | 'section' | 'note';
export interface SourceText {
  key: string;
  text: string;
  kind: TextKind;
}

/**
 * Textes libres à traduire : nom de la carte, accroche et pied de page du design, titres de section non standard, notes.
 * Les noms de domaine, cuvée, appellation et millésime ne sont jamais traduits.
 */
export function translatableTexts(doc: Pick<SheetDoc, 'name' | 'sections' | 'theme'>): SourceText[] {
  const out = new Map<string, SourceText>();
  const add = (raw: string | undefined, kind: TextKind) => {
    const text = raw?.trim();
    if (!text || text.length > MAX_SOURCE_CHARS) return;
    const key = textKey(text);
    if (!out.has(key)) out.set(key, { key, text, kind });
  };
  add(doc.name, 'name');
  add(doc.theme?.tagline, 'tagline');
  add(doc.theme?.footer, 'footer');
  for (const s of doc.sections) if (!s.titleKey) add(s.title, 'section');
  for (const s of doc.sections) for (const i of s.items) add(i.note, 'note');
  return [...out.values()];
}

/** Langues dans lesquelles la carte peut être traduite (toutes les langues proposées sauf la langue de rédaction). */
export const translationTargets = (list: Pick<WineList, 'language' | 'languages'>): ContentLang[] => offeredLanguages(list.languages).filter((l) => l !== list.language);

/** Traductions publiées : uniquement les langues proposées et les textes présents dans la carte, triées pour un hash stable. */
export function pickTranslations(all: ListTranslations | undefined, base: Locale, langs: ContentLang[], keys: Set<string>): ListTranslations | undefined {
  const out: ListTranslations = {};
  for (const lang of [...langs].sort()) {
    if (lang === base) continue;
    const src = all?.[lang];
    if (!src || typeof src !== 'object') continue;
    const m: Record<string, string> = {};
    for (const k of Object.keys(src).sort()) {
      const v = src[k];
      if (keys.has(k) && typeof v === 'string' && v.trim()) m[k] = v.trim().slice(0, MAX_TRANSLATION_CHARS);
    }
    if (Object.keys(m).length) out[lang] = m;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Version d'une carte dans une langue : titres standard intégrés, textes libres traduits (repli sur l'original). */
export function localizeDoc<T extends SheetDoc>(doc: T, lang: ContentLang): T {
  const base = doc.language ?? 'fr';
  if (lang === base) return doc;
  const dict = doc.translations?.[lang] ?? {};
  const tr = <S extends string | undefined>(s: S): S => (s ? ((dict[textKey(s)] ?? s) as S) : s);
  return {
    ...doc,
    name: tr(doc.name),
    ...(doc.theme ? { theme: { ...doc.theme, tagline: tr(doc.theme.tagline), footer: tr(doc.theme.footer) } } : {}),
    sections: doc.sections.map((s) => ({
      ...s,
      title: builtInTitle(s.titleKey, lang) ?? tr(s.title),
      items: s.items.map((i) => (i.note ? { ...i, note: tr(i.note) } : i)),
    })),
  };
}

/** Fusionne des traductions (IA ou saisie) pour une langue ; un texte vide supprime l'entrée. */
export function mergeTranslations(all: ListTranslations | undefined, lang: ContentLang, entries: { key: string; text: string }[]): ListTranslations {
  const cur = { ...(all?.[lang] ?? {}) };
  for (const { key, text } of entries) {
    const v = text.trim();
    if (v) cur[key] = v.slice(0, MAX_TRANSLATION_CHARS);
    else delete cur[key];
  }
  const next: ListTranslations = { ...(all ?? {}) };
  if (Object.keys(cur).length) next[lang] = cur;
  else delete next[lang];
  return next;
}
