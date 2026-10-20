import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Mail, Printer } from 'lucide-react';
import type { Locale } from '@/types';
import { getStore, localStore } from '@/data/store';
import { PRESETS, themeVars } from '@/lib/brand';
import { dateFr, today } from '@/lib/utils';
import { intlOf, mailtoHref, msg } from '../reminders';
import { sanitizePublicOffer } from './calc';
import OfferSheet, { OFFER_PRINT_CSS } from './OfferSheet';
import type { PublicOfferDoc } from './types';

type Load = { status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'ready'; doc: PublicOfferDoc };

/** Page publique d'une offre : /o/:publicId — sans connexion, à la charte de la maison. */
export default function PublicOffer() {
  const { publicId = '' } = useParams();
  const [state, setState] = useState<Load>({ status: 'loading' });
  const [lang, setLang] = useState<Locale | null>(null);

  useEffect(() => {
    setState({ status: 'loading' });
    const store = getStore(false);
    let fallback: (() => void) | undefined;
    const unsub = store.subscribeDoc<unknown>(
      `public_offers/${publicId}`,
      (raw) => {
        const doc = sanitizePublicOffer(raw);
        if (doc) {
          setState({ status: 'ready', doc });
          return;
        }
        // Mode démo : une offre publiée en local n'existe que dans le stockage du navigateur.
        if (store !== localStore && !fallback) {
          fallback = localStore.subscribeDoc<unknown>(`public_offers/${publicId}`, (r) => {
            const d = sanitizePublicOffer(r);
            setState(d ? { status: 'ready', doc: d } : { status: 'missing' });
          });
          return;
        }
        setState({ status: 'missing' });
      },
      () => setState({ status: 'error' }),
    );
    return () => {
      unsub();
      fallback?.();
    };
  }, [publicId]);

  const doc = state.status === 'ready' ? state.doc : null;
  const l: Locale = lang ?? doc?.language ?? (typeof navigator !== 'undefined' && navigator.language?.startsWith('en') ? 'en' : 'fr');
  const shown = useMemo(() => (doc ? { ...doc, language: l } : null), [doc, l]);

  useEffect(() => {
    if (doc) document.title = `${doc.title || msg(l, 'offer.untitled')} — ${doc.orgName}`;
  }, [doc, l]);

  if (!shown) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center" style={themeVars(PRESETS.palace)}>
        {state.status === 'loading' ? (
          <Loader2 className="size-7 animate-spin text-muted" aria-label={msg(l, 'offer.public.loading')} />
        ) : (
          <div>
            <h1 className="font-display text-2xl font-semibold">{msg(l, state.status === 'missing' ? 'offer.public.missing' : 'offer.public.error')}</h1>
            <p className="mt-2 text-sm text-muted">{msg(l, state.status === 'missing' ? 'offer.public.missingHint' : 'offer.public.errorHint')}</p>
          </div>
        )}
      </div>
    );
  }

  const expired = !!shown.validUntil && shown.validUntil < today();
  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-xs uppercase transition ${active ? 'border-brand bg-brand text-brand-fg' : 'border-border hover:bg-surface-2'}`;
  const reply = shown.contactEmail
    ? mailtoHref(shown.contactEmail, msg(l, 'offer.public.replySubject', { number: shown.number, title: shown.title }), msg(l, 'offer.public.replyBody', { number: shown.number, title: shown.title }))
    : '';

  return (
    <div className="min-h-dvh" style={themeVars(shown.theme)}>
      <style>{OFFER_PRINT_CSS}</style>
      <main className="mx-auto max-w-3xl px-2 pb-12 pt-4 sm:px-6">
        <div className="no-print flex items-center justify-between gap-2 px-2">
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-2">
            <Printer className="size-3.5" aria-hidden />
            {msg(l, 'offer.public.print')}
          </button>
          <div className="flex gap-1" role="group" aria-label={msg(l, 'offer.public.language')}>
            {(['fr', 'en'] as const).map((x) => (
              <button key={x} type="button" aria-pressed={l === x} onClick={() => setLang(x)} className={chip(l === x)}>
                {x}
              </button>
            ))}
          </div>
        </div>
        {expired && (
          <p role="status" className="no-print mx-2 mt-4 rounded-xl border border-border bg-surface-2 px-4 py-3 text-center text-sm">
            {msg(l, 'offer.public.expired', { date: dateFr(shown.validUntil, intlOf(l)) })}
          </p>
        )}
        <div className="offer-print mt-2">
          <OfferSheet doc={shown} />
        </div>
        {reply && !expired && (
          <div className="no-print mt-2 text-center">
            <a
              href={reply}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-medium text-brand-fg shadow-sm hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <Mail className="size-4" aria-hidden />
              {msg(l, 'offer.public.reply')}
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
