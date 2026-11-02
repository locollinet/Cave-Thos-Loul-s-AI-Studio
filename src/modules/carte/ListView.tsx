import { useEffect, type CSSProperties } from 'react';
import { Sparkles } from 'lucide-react';
import type { BrandTheme } from '@/types';
import { useI18n } from '@/i18n';
import { formatLabel } from '@/lib/wine';
import { FONTS, ensureFonts, themeVars } from '@/lib/brand';
import { publicTheme } from './build';
import { LANG_INTL, contentFor, isContentLang, type ContentLang } from './content';
import type { PublicItem, PublicSection } from './types';
import type { SheetDoc } from './templates';

export interface IndexedSection {
  title: string;
  items: { item: PublicItem; index: number }[];
}

export const indexSections = (sections: PublicSection[]): IndexedSection[] => {
  let n = 0;
  return sections.map((s) => ({ title: s.title, items: s.items.map((item) => ({ item, index: n++ })) }));
};

const clLabel = (cl: number, intl: string) => `${new Intl.NumberFormat(intl, { maximumFractionDigits: 1 }).format(cl)} cl`;

export function PriceText({ value, intl }: { value: number | null; intl: string }) {
  if (value === null || value === undefined) return <>—</>;
  return <>{new Intl.NumberFormat(intl, { style: 'currency', currency: 'EUR', minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value)}</>;
}

export function useThemeFonts(theme: BrandTheme): void {
  useEffect(() => ensureFonts([theme.headingFont, theme.bodyFont]), [theme.headingFont, theme.bodyFont]);
}

const DENSITY: Record<BrandTheme['density'], { item: string; section: string }> = {
  compact: { item: '0.3rem', section: '1.6rem' },
  normal: { item: '0.55rem', section: '2.2rem' },
  airy: { item: '0.85rem', section: '3rem' },
};
const TITLE: Record<BrandTheme['titleScale'], string> = { sm: '1.75rem', md: '2.25rem', lg: '2.9rem' };
const CASE: Record<BrandTheme['sectionCase'], CSSProperties> = {
  upper: { textTransform: 'uppercase', letterSpacing: '0.24em', fontSize: '0.92rem' },
  smallcaps: { fontVariant: 'all-small-caps', letterSpacing: '0.14em', fontSize: '1.3rem' },
  normal: { fontSize: '1.5rem' },
};
const head: CSSProperties = { fontFamily: 'var(--lt-head)', fontWeight: 500 };
const body: CSSProperties = { fontFamily: 'var(--lt-body)' };
const muted: CSSProperties = { color: 'var(--lt-muted)' };
const figures: CSSProperties = { fontVariantNumeric: 'lining-nums tabular-nums' };

export function Ornament({ kind, align = 'center', wide = false }: { kind: BrandTheme['ornament']; align?: BrandTheme['align']; wide?: boolean }) {
  const margin = align === 'center' ? 'mx-auto' : '';
  const rule: CSSProperties = { background: 'var(--lt-rule)' };
  switch (kind) {
    case 'line':
      return <div aria-hidden className={`h-px ${margin}`} style={{ ...rule, width: wide ? '100%' : '4rem' }} />;
    case 'double':
      return <div aria-hidden className={margin} style={{ width: wide ? '100%' : '5rem', height: 4, borderTop: '1px solid var(--lt-rule)', borderBottom: '1px solid var(--lt-rule)' }} />;
    case 'fade':
      return <div aria-hidden className={`h-px ${margin}`} style={{ width: wide ? '100%' : '11rem', background: 'linear-gradient(90deg, transparent, var(--lt-accent), transparent)' }} />;
    case 'dots':
      return <div aria-hidden style={{ color: 'var(--lt-rule)', letterSpacing: '0.6em', textAlign: align }}>···</div>;
    case 'diamond':
      return (
        <div aria-hidden className={`flex items-center gap-2 ${margin}`} style={{ width: wide ? '100%' : '7rem' }}>
          <span className="h-px flex-1" style={rule} />
          <span className="size-1.5 rotate-45" style={{ background: 'var(--lt-accent)' }} />
          <span className="h-px flex-1" style={rule} />
        </div>
      );
    default:
      return null;
  }
}

export function SheetHeader({ doc, theme }: { doc: Pick<SheetDoc, 'name' | 'orgName' | 'logoDataUrl'>; theme: BrandTheme }) {
  const center = theme.align === 'center';
  return (
    <header className="pb-2" style={{ textAlign: theme.align }}>
      {doc.logoDataUrl && <img src={doc.logoDataUrl} alt={doc.orgName} className={`mb-5 max-h-20 max-w-52 object-contain ${center ? 'mx-auto' : ''}`} />}
      <div style={{ ...body, color: 'var(--lt-accent)', letterSpacing: '0.38em', fontSize: '0.66rem', textTransform: 'uppercase' }}>{doc.orgName}</div>
      <h2 style={{ ...head, fontSize: TITLE[theme.titleScale], lineHeight: 1.1, marginTop: '0.7rem' }}>{doc.name}</h2>
      {theme.tagline && <p style={{ ...head, ...muted, fontStyle: 'italic', fontSize: '1.05rem', marginTop: '0.5rem' }}>{theme.tagline}</p>}
      {theme.ornament !== 'none' && (
        <div className="mt-6">
          <Ornament kind={theme.ornament} align={theme.align} />
        </div>
      )}
    </header>
  );
}

function Item({ item, theme, pick, intl, lang }: { item: PublicItem; theme: BrandTheme; pick?: string; intl: string; lang: ContentLang }) {
  const script = FONTS[theme.headingFont].kind === 'script';
  const glass = item.glassPriceTTC !== undefined && item.glassPriceTTC !== null;
  const c = contentFor(lang);
  const meta = [glass ? [c.glassUnit, item.glassCl ? clLabel(item.glassCl, intl) : ''].filter(Boolean).join(' ') : item.formatCl ? formatLabel(item.formatCl) : '', item.grapes]
    .filter(Boolean)
    .join(' · ');
  const bottle = glass && item.priceTTC !== null && item.priceTTC !== undefined;
  const name = (
    <span style={{ ...head, fontSize: script ? '1.35rem' : '1.1rem', lineHeight: 1.25 }}>
      {item.name}
      {item.vintage && <span style={figures}> {item.vintage}</span>}
    </span>
  );
  const price = (
    <span className="shrink-0" style={{ ...head, ...figures, fontSize: script ? '1.3rem' : '1.08rem' }}>
      <PriceText value={glass ? (item.glassPriceTTC as number) : item.priceTTC} intl={intl} />
    </span>
  );
  return (
    <li className="lt-item" style={{ padding: `${DENSITY[theme.density].item} 0` }}>
      <div style={{ ...body, color: 'var(--lt-accent)', fontSize: '0.7rem', letterSpacing: '0.14em', textTransform: 'uppercase' }}>{item.producer}</div>
      {theme.priceStyle === 'right' && (
        <div className="flex items-baseline justify-between gap-4">
          {name}
          {price}
        </div>
      )}
      {theme.priceStyle === 'leader' && (
        <div className="flex items-baseline gap-2">
          <span className="min-w-0">{name}</span>
          <span aria-hidden className="min-w-6 flex-1 border-b border-dotted" style={{ borderColor: 'var(--lt-rule)', transform: 'translateY(-0.3em)' }} />
          {price}
        </div>
      )}
      {theme.priceStyle === 'below' && <div>{name}</div>}
      {(meta || bottle) && (
        <div style={{ ...body, ...muted, fontSize: '0.78rem', marginTop: '0.1rem' }}>
          {meta}
          {bottle && (
            <span style={figures}>
              {meta ? ' · ' : ''}
              {c.bottle}
              {item.formatCl && item.formatCl !== 75 ? ` ${formatLabel(item.formatCl)}` : ''} <PriceText value={item.priceTTC} intl={intl} />
            </span>
          )}
        </div>
      )}
      {theme.priceStyle === 'below' && <div style={{ color: 'var(--lt-accent)', marginTop: '0.2rem' }}>{price}</div>}
      {item.allergens?.length ? (
        <div style={{ ...body, ...muted, fontSize: '0.72rem', marginTop: '0.15rem' }}>
          {c.contains} : {item.allergens.map((a) => c.allergens[a]).join(', ')}
        </div>
      ) : null}
      {item.note && <p style={{ ...head, ...muted, fontStyle: 'italic', fontSize: '0.95rem', marginTop: '0.2rem' }}>{item.note}</p>}
      {pick && (
        <p className="no-print mt-2 flex items-start gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs" style={body}>
          <Sparkles className="mt-0.5 size-3.5 shrink-0" style={{ color: 'var(--lt-accent)' }} />
          <span>{pick}</span>
        </p>
      )}
    </li>
  );
}

interface Props {
  doc: SheetDoc;
  header?: boolean;
  sections?: IndexedSection[];
  picks?: Map<number, string>;
  className?: string;
  columns?: boolean;
  bookMode?: boolean; // Format livre de cave : sommaire automatique, marges de reliure et sauts de page
  /** Ne pas redéfinir les variables du thème (déjà posées par un parent, ex. page publique). */
  inherit?: boolean;
  /** Langue du contenu (libellés standard, format des prix) ; par défaut celle de la carte. Le document doit déjà être localisé. */
  lang?: ContentLang;
}

/** Rendu d'une carte selon sa charte : aperçu, impression et page publique. */
export function ListView({ doc, sections, picks, className = '', columns = true, header = true, bookMode = false, inherit = false, lang }: Props) {
  const { locale } = useI18n();
  const contentLang: ContentLang = lang ?? (isContentLang(doc.language) ? doc.language : locale);
  const intl = LANG_INTL[contentLang];
  const theme = publicTheme(doc);
  useThemeFonts(theme);
  const data = sections ?? indexSections(doc.sections);
  const sectionRule = theme.ornament === 'none' ? 'none' : theme.ornament === 'dots' ? 'dots' : 'line';
  return (
    <div lang={contentLang} className={`lt-sheet ${bookMode ? 'book-mode' : ''} px-6 py-10 sm:px-12 sm:py-14 ${className}`} style={inherit ? body : themeVars(theme)}>
      {header && <SheetHeader doc={doc} theme={theme} />}

      {/* Sommaire automatique pour le format Livre de Cave */}
      {bookMode && data.length > 1 && (
        <nav aria-label="Sommaire de la cave" className="mb-12 border-y border-amber-900/30 py-6 print:break-after-page">
          <h4 style={{ ...head, color: 'var(--lt-accent)', letterSpacing: '0.24em', textTransform: 'uppercase', fontSize: '0.85rem', textAlign: 'center', marginBottom: '1rem' }}>
            Sommaire de la Cave
          </h4>
          <div className="mx-auto max-w-md space-y-2 text-xs" style={body}>
            {data.map((sec) => (
              <div key={sec.title} className="flex items-baseline gap-2">
                <span className="font-semibold text-ink">{sec.title}</span>
                <span aria-hidden className="min-w-6 flex-1 border-b border-dotted" style={{ borderColor: 'var(--lt-rule)', transform: 'translateY(-0.3em)' }} />
                <span style={figures} className="text-muted">{sec.items.length} {sec.items.length > 1 ? 'vins' : 'vin'}</span>
              </div>
            ))}
          </div>
        </nav>
      )}

      <div className={`${header ? 'mt-10' : ''} ${columns ? 'lt-cols' : ''}`}>
        {data.map((sec) => (
          <section key={sec.title} className={`lt-section ${bookMode ? 'book-section' : ''}`} style={{ marginBottom: DENSITY[theme.density].section }}>
            <div className="lt-head" style={{ textAlign: theme.align, marginBottom: '0.9rem' }}>
              <h3 style={{ ...head, ...CASE[theme.sectionCase], color: 'var(--lt-accent)' }}>{sec.title}</h3>
              {sectionRule !== 'none' && (
                <div className="mt-2">
                  <Ornament kind={sectionRule} align={theme.align} />
                </div>
              )}
            </div>
            <ul>
              {sec.items.map(({ item, index }) => (
                <Item key={index} item={item} theme={theme} pick={picks?.get(index)} intl={intl} lang={contentLang} />
              ))}
            </ul>
          </section>
        ))}
      </div>
      <footer className="mt-12 space-y-1.5" style={{ ...body, ...muted, fontSize: '0.7rem', textAlign: theme.align }}>
        {theme.footer && <p style={{ whiteSpace: 'pre-line' }}>{theme.footer}</p>}
        <p>{contentFor(contentLang).footer}</p>
      </footer>
    </div>
  );
}

export const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 12mm; }
  body * { visibility: hidden !important; }
  .print-area, .print-area * { visibility: visible !important; }
  .print-area { position: absolute !important; left: 0; top: 0; width: 100% !important; margin: 0 !important; box-shadow: none !important; border: 0 !important; border-radius: 0 !important; }
  .lt-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 8mm !important; }
  .lt-sheet.book-mode { padding: 12mm 16mm 12mm 24mm !important; }
  .lt-sheet.book-mode .book-section { break-before: page !important; page-break-before: always !important; }
  .lt-cols { column-count: 2; column-gap: 12mm; }
  .lt-head { break-after: avoid; }
  .lt-item { break-inside: avoid; }
}
`;
