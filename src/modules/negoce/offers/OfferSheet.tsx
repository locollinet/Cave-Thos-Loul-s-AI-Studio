import type { CSSProperties } from 'react';
import type { Locale, WineColor } from '@/types';
import { themeVars } from '@/lib/brand';
import { dateFr, eur } from '@/lib/utils';
import { formatLabel } from '@/lib/wine';
import { COLOR_ORDER } from '@/modules/carte/build';
import { Ornament, useThemeFonts } from '@/modules/carte/ListView';
import { intlOf, msg } from '../reminders';
import type { PublicOfferDoc, PublicOfferItem } from './types';

export const OFFER_PRINT_CSS = `
@media print {
  @page { size: A4; margin: 12mm; }
  body * { visibility: hidden !important; }
  .offer-print, .offer-print * { visibility: visible !important; }
  .offer-print { display: block !important; position: absolute !important; left: 0; top: 0; width: 100% !important; margin: 0 !important; box-shadow: none !important; border: 0 !important; border-radius: 0 !important; zoom: 1 !important; }
  .offer-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 6mm 4mm !important; }
  .offer-item { break-inside: avoid; }
  .offer-sec-head { break-after: avoid; }
}`;

const head: CSSProperties = { fontFamily: 'var(--lt-head)', fontWeight: 500 };
const body: CSSProperties = { fontFamily: 'var(--lt-body)' };
const muted: CSSProperties = { color: 'var(--lt-muted)' };
const figures: CSSProperties = { fontVariantNumeric: 'lining-nums tabular-nums' };
const eyebrow: CSSProperties = { ...body, color: 'var(--lt-accent)', letterSpacing: '0.32em', fontSize: '0.66rem', textTransform: 'uppercase' };

export function groupByColor(items: PublicOfferItem[]): { color: WineColor; items: PublicOfferItem[] }[] {
  return COLOR_ORDER.map((color) => ({ color, items: items.filter((i) => i.color === color) })).filter((g) => g.items.length);
}

function Item({ item, lang }: { item: PublicOfferItem; lang: Locale }) {
  const intl = intlOf(lang);
  const meta = [item.appellation && item.appellation !== item.name ? item.appellation : '', item.region, item.formatCl ? formatLabel(item.formatCl) : ''].filter(Boolean).join(' · ');
  return (
    <li className="offer-item py-3" style={{ borderBottom: '1px solid var(--lt-rule)' }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div style={{ ...body, color: 'var(--lt-accent)', fontSize: '0.68rem', letterSpacing: '0.16em', textTransform: 'uppercase' }}>{item.producer}</div>
          <div style={{ ...head, fontSize: '1.15rem', lineHeight: 1.25 }}>
            {item.name}
            {item.vintage && item.vintage !== 'NM' && <span style={figures}> {item.vintage}</span>}
          </div>
          {meta && <div style={{ ...body, ...muted, fontSize: '0.78rem', marginTop: '0.1rem' }}>{meta}</div>}
        </div>
        <div className="shrink-0 text-right">
          <div style={{ ...head, ...figures, fontSize: '1.15rem' }}>
            {eur(item.priceHT, 'EUR', intl)} <span style={{ ...body, ...muted, fontSize: '0.66rem' }}>{msg(lang, 'offer.sheet.ht')}</span>
          </div>
          <div style={{ ...body, ...muted, ...figures, fontSize: '0.72rem' }}>
            {eur(item.priceTTC, 'EUR', intl)} {msg(lang, 'offer.sheet.ttc')}
          </div>
        </div>
      </div>
      {(item.note || item.minQty) && (
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4">
          {item.note ? <p style={{ ...head, ...muted, fontStyle: 'italic', fontSize: '0.98rem' }}>{item.note}</p> : <span />}
          {item.minQty && <span style={{ ...body, ...muted, fontSize: '0.72rem' }}>{msg(lang, 'offer.sheet.minQty', { n: item.minQty })}</span>}
        </div>
      )}
    </li>
  );
}

/** Rendu de l'offre à la charte de la maison : aperçu, impression et page publique. */
export default function OfferSheet({ doc, className = '', level = 1 }: { doc: Omit<PublicOfferDoc, 'publicId' | 'orgId' | 'updatedAt'>; className?: string; level?: 1 | 2 }) {
  const theme = doc.theme;
  const Title = level === 1 ? 'h1' : 'h2';
  const SectionTitle = level === 1 ? 'h2' : 'h3';
  useThemeFonts(theme);
  const lang = doc.language;
  const intl = intlOf(lang);
  const groups = groupByColor(doc.items);
  const center = theme.align === 'center';
  return (
    <article lang={lang} className={`offer-sheet px-6 py-10 sm:px-12 sm:py-14 ${className}`} style={themeVars(theme)}>
      <header style={{ textAlign: theme.align }}>
        {doc.logoDataUrl && <img src={doc.logoDataUrl} alt={doc.orgName} className={`mb-5 max-h-20 max-w-52 object-contain ${center ? 'mx-auto' : ''}`} />}
        <div style={eyebrow}>{doc.orgName}</div>
        <div style={{ ...body, ...muted, fontSize: '0.72rem', marginTop: '0.9rem', letterSpacing: '0.08em' }}>
          {msg(lang, 'offer.sheet.kind')}
          {doc.number && ` · ${doc.number}`}
        </div>
        <Title style={{ ...head, fontSize: 'clamp(1.9rem, 5vw, 2.7rem)', lineHeight: 1.08, marginTop: '0.4rem' }}>{doc.title || msg(lang, 'offer.untitled')}</Title>
        {doc.clientName && <p style={{ ...head, ...muted, fontStyle: 'italic', fontSize: '1.05rem', marginTop: '0.5rem' }}>{msg(lang, 'offer.sheet.for', { name: doc.clientName })}</p>}
        {theme.ornament !== 'none' && (
          <div className="mt-6">
            <Ornament kind={theme.ornament} align={theme.align} />
          </div>
        )}
      </header>

      {doc.intro && <p style={{ ...head, fontSize: '1.08rem', lineHeight: 1.55, whiteSpace: 'pre-line', marginTop: '2rem', textAlign: center ? 'center' : 'left' }}>{doc.intro}</p>}

      <div className="mt-10 space-y-10">
        {groups.length === 0 && <p style={{ ...body, ...muted, textAlign: 'center', fontSize: '0.9rem' }}>{msg(lang, 'offer.sheet.empty')}</p>}
        {groups.map((g) => (
          <section key={g.color}>
            <SectionTitle className="offer-sec-head" style={{ ...head, color: 'var(--lt-accent)', textTransform: 'uppercase', letterSpacing: '0.24em', fontSize: '0.9rem', textAlign: theme.align, marginBottom: '0.4rem' }}>
              {msg(lang, `offer.color.${g.color}`)}
            </SectionTitle>
            <ul>
              {g.items.map((it, i) => (
                <Item key={`${it.producer}-${it.name}-${it.vintage}-${i}`} item={it} lang={lang} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className="mt-12 space-y-1.5" style={{ ...body, ...muted, fontSize: '0.74rem', textAlign: theme.align }}>
        {doc.validUntil && (
          <p style={{ ...head, fontSize: '1rem', color: 'var(--lt-ink)' }}>{msg(lang, 'offer.sheet.valid', { date: dateFr(doc.validUntil, intl) })}</p>
        )}
        <p>{msg(lang, 'offer.sheet.prices', { vat: doc.vatRate.toLocaleString(intl) })}</p>
        {doc.contactEmail && <p>{msg(lang, 'offer.sheet.contact', { email: doc.contactEmail })}</p>}
        {theme.footer && <p style={{ whiteSpace: 'pre-line' }}>{theme.footer}</p>}
        <p style={{ fontSize: '0.66rem' }}>{msg(lang, 'offer.sheet.abuse')}</p>
      </footer>
    </article>
  );
}
