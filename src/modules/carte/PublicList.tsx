import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronDown, Loader2, Search } from 'lucide-react';
import type { WineColor } from '@/types';
import { useI18n, type TFn } from '@/i18n';
import { core } from '@/i18n/core';
import { carte } from '@/i18n/carte';
import { discovery } from '@/i18n/discovery';
import { getStore } from '@/data/store';
import { norm } from '@/lib/wine';
import { ensureFonts, themeVars } from '@/lib/brand';
import { AiPanel } from './AiPanel';
import { COLOR_ORDER, publicTheme } from './build';
import { LANG_NAMES, isContentLang, offeredLanguages, type ContentLang } from './content';
import { localizeDoc } from './translate';
import { ListView, SheetHeader, indexSections, type IndexedSection } from './ListView';
import type { PublicListDoc, SommelierAnswer } from './types';

type Load = { status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'ready'; doc: PublicListDoc };

/** Interface de la page publique en anglais pour les langues de carte autres que fr/en (pas de dictionnaire complet). */
const EN_CHROME: Record<string, string> = { ...core.en, ...carte.en, ...(discovery as { en: Record<string, string> }).en };

/** Langue initiale du contenu : langue du navigateur si la carte la propose, sinon langue de l'interface. */
const initialLang = (doc: PublicListDoc, locale: ContentLang): ContentLang => {
  const nav = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2).toLowerCase() : '';
  const offered = offeredLanguages(doc.languages);
  return isContentLang(nav) && nav !== 'fr' && nav !== 'en' && offered.includes(nav) ? nav : locale;
};

export default function PublicList() {
  const { publicId = '' } = useParams();
  const { t: uiT, locale, setLocale } = useI18n();
  const [chosen, setChosen] = useState<ContentLang | null>(null);
  const [state, setState] = useState<Load>({ status: 'loading' });
  const [q, setQ] = useState('');
  const [color, setColor] = useState<WineColor | 'all'>('all');
  const [answer, setAnswer] = useState<SommelierAnswer | null>(null);

  useEffect(() => {
    setState({ status: 'loading' });
    return getStore(false).subscribeDoc<PublicListDoc>(
      `public_lists/${publicId}`,
      (doc) => setState(doc ? { status: 'ready', doc } : { status: 'missing' }),
      () => setState({ status: 'error' }),
    );
  }, [publicId]);

  const raw = state.status === 'ready' ? state.doc : null;
  const offered = useMemo(() => offeredLanguages(raw?.languages), [raw?.languages]);
  const lang: ContentLang = chosen && offered.includes(chosen) ? chosen : raw ? initialLang(raw, locale) : locale;
  const doc = useMemo(() => (raw ? localizeDoc(raw, lang) : null), [raw, lang]);
  const english = lang !== 'fr' && lang !== 'en';
  const t = useCallback<TFn>(
    (key, vars) => {
      if (!english) return uiT(key, vars);
      let out = EN_CHROME[key] ?? uiT(key);
      if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
      return out;
    },
    [english, uiT],
  );
  const choose = (l: ContentLang) => {
    setChosen(l);
    if (l === 'fr' || l === 'en') setLocale(l);
  };
  useEffect(() => {
    if (doc) document.title = `${doc.name} — ${doc.orgName}`;
  }, [doc]);
  useEffect(() => {
    if (!doc) return;
    const prev = document.documentElement.lang;
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = prev;
    };
  }, [doc, lang]);

  const all = useMemo(() => (doc ? indexSections(doc.sections) : []), [doc]);
  const flat = useMemo(() => all.flatMap((s) => s.items), [all]);
  const colors = useMemo(() => COLOR_ORDER.filter((c) => flat.some((i) => i.item.color === c)), [flat]);

  const filtered = useMemo<IndexedSection[]>(() => {
    const nq = norm(q);
    return all
      .map((s) => ({
        title: s.title,
        items: s.items.filter(
          ({ item }) =>
            (color === 'all' || item.color === color) && (!nq || norm(`${item.producer} ${item.name} ${item.vintage} ${item.region ?? ''} ${item.grapes ?? ''}`).includes(nq)),
        ),
      }))
      .filter((s) => s.items.length);
  }, [all, q, color]);

  const picks = useMemo(() => new Map((answer?.picks ?? []).filter((p) => p.index !== undefined).map((p) => [p.index as number, p.reason])), [answer]);
  const theme = useMemo(() => (doc ? publicTheme(doc) : null), [doc]);
  useEffect(() => {
    if (theme) ensureFonts([theme.headingFont, theme.bodyFont]);
  }, [theme]);

  if (!doc || !theme) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg p-6 text-center text-ink">
        {state.status === 'loading' ? (
          <Loader2 className="size-7 animate-spin text-muted" aria-label={t('common.loading')} />
        ) : (
          <div>
            <h1 className="font-display text-2xl font-semibold">{t(state.status === 'missing' ? 'carte.public.missing' : 'carte.public.error')}</h1>
            <p className="mt-2 text-sm text-muted">{t(state.status === 'missing' ? 'carte.public.missingHint' : 'carte.public.errorHint')}</p>
          </div>
        )}
      </div>
    );
  }

  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-xs transition ${active ? 'border-brand bg-brand text-brand-fg' : 'border-border text-ink hover:bg-surface-2'}`;
  return (
    <div className="min-h-dvh" lang={lang} style={themeVars(theme)}>
      <div className="mx-auto max-w-2xl px-5 pb-10 pt-4 sm:px-10">
        <div className="flex flex-wrap justify-end gap-1 text-xs" role="group" aria-label={t('carte.public.language')}>
          {offered.map((l) => (
            <button key={l} type="button" lang={l} title={LANG_NAMES[l]} aria-label={LANG_NAMES[l]} aria-pressed={lang === l} onClick={() => choose(l)} className={`${chip(lang === l)} uppercase`}>
              {l}
            </button>
          ))}
        </div>
        <div className="pt-8">
          <SheetHeader doc={doc} theme={theme} />
        </div>

        <div className="mt-10 space-y-4">
          <label className="relative block">
            <span className="sr-only">{t('carte.public.search')}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('carte.public.search')}
              className="h-11 w-full rounded-full border border-border bg-surface pl-9 pr-4 text-sm text-ink placeholder:text-muted focus:outline-2 focus:outline-offset-2 focus:outline-brand"
            />
          </label>
          {colors.length > 1 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('carte.public.filterColor')}>
              {(['all', ...colors] as const).map((c) => (
                <button key={c} type="button" aria-pressed={color === c} onClick={() => setColor(c)} className={chip(color === c)}>
                  {c === 'all' ? t('common.all') : t(`carte.color.${c}`)}
                </button>
              ))}
            </div>
          )}
          <details className="group rounded-2xl border border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block text-[10px] uppercase tracking-[0.3em] text-brand">{t('carte.public.sommelier')}</span>
                <span className="mt-1 block text-lg" style={{ fontFamily: 'var(--lt-head)' }}>
                  {t('carte.public.sommelierHint')}
                </span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted transition group-open:rotate-180" />
            </summary>
            <div className="border-t border-border">
              <AiPanel sections={doc.sections} language={english ? 'en' : (lang as 'fr' | 'en')} context="guest" onAnswer={setAnswer} embedded t={t} publicId={publicId} />
            </div>
          </details>
        </div>

        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted">{t('carte.public.noMatch')}</p>
        ) : (
          <ListView doc={doc} lang={lang} sections={filtered} picks={picks} columns={false} header={false} inherit className="!px-0 !pb-0 !pt-10" />
        )}
      </div>
    </div>
  );
}
