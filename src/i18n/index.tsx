import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Locale } from '@/types';
import { core } from './core';
import { cave } from './cave';
import { carte } from './carte';
import { negoce } from './negoce';
import { discovery } from './discovery';
import { brand } from './brand';
import { service } from './service';
import { photos } from './photos';
import { dashboard } from './dashboard';
import { pwa } from './pwa';
import { ux } from './ux';

type Dict = Record<string, string>;
const all: Record<Locale, Dict> = {
  fr: { ...core.fr, ...cave.fr, ...carte.fr, ...negoce.fr, ...discovery.fr, ...brand.fr, ...service.fr, ...photos.fr, ...dashboard.fr, ...pwa.fr, ...ux.fr },
  en: { ...core.en, ...cave.en, ...carte.en, ...negoce.en, ...discovery.en, ...brand.en, ...service.en, ...photos.en, ...dashboard.en, ...pwa.en, ...ux.en },
};

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: TFn;
  intl: string;
}

const Ctx = createContext<I18n | null>(null);

const detect = (): Locale => {
  const saved = typeof localStorage !== 'undefined' ? (localStorage.getItem('lt-locale') as Locale | null) : null;
  if (saved === 'fr' || saved === 'en') return saved;
  return typeof navigator !== 'undefined' && navigator.language.startsWith('en') ? 'en' : 'fr';
};

/** Remplace les variables et accorde les pluriels « {n|référence|références} » (en français 0 et 1 sont au singulier). */
export function formatMessage(s: string, vars: Record<string, string | number> | undefined, locale: Locale): string {
  if (!vars) return s;
  let out = s.replace(/\{(\w+)\|([^|}]*)\|([^}]*)\}/g, (_m, name: string, one: string, other: string) => {
    const n = Number(vars[name]);
    return (locale === 'fr' ? Math.abs(n) < 2 : Math.abs(n) === 1) ? one : other;
  });
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLoc] = useState<Locale>(detect);
  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem('lt-locale', l);
    setLoc(l);
  }, []);
  const t = useCallback<TFn>((key, vars) => formatMessage(all[locale][key] ?? all.fr[key] ?? key, vars, locale), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t, intl: locale === 'en' ? 'en-GB' : 'fr-FR' }), [locale, setLocale, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const c = useContext(Ctx);
  if (!c) throw new Error('useI18n hors I18nProvider');
  return c;
}

export const useT = (): TFn => useI18n().t;
