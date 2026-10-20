import { useEffect, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import type { BrandTheme, FontId } from '@/types';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Checkbox, Field, Input, Segmented, Select, Textarea, cx, useToast } from '@/ui';
import { CASES, DENSITIES, FONTS, FONT_IDS, ORNAMENTS, PRICE_STYLES, TITLE_SCALES, checkTheme, ensureFonts, type FontKind } from '@/lib/brand';

const HEX = /^#[0-9a-f]{6}$/i;
const KINDS: FontKind[] = ['serif', 'display', 'sans', 'script'];

/** Harmonies inspirées de l'hôtellerie de luxe : fond, texte, accent. */
export const PALETTES: { name: string; colors: [string, string, string] }[] = [
  { name: 'Ivoire & bronze', colors: ['#f8f5ee', '#1b2233', '#9a7b4f'] },
  { name: 'Crème & bordeaux', colors: ['#fbf7ef', '#2b1a1d', '#8a2a3b'] },
  { name: 'Nuit & or', colors: ['#0b0b0c', '#ece3cc', '#d4af37'] },
  { name: 'Vert anglais & laiton', colors: ['#14261f', '#efe8d6', '#c9a96a'] },
  { name: 'Bleu Riviera', colors: ['#f6f4ef', '#12304a', '#3d6f8e'] },
  { name: 'Blanc & graphite', colors: ['#ffffff', '#171717', '#6b6b6b'] },
  { name: 'Velours prune', colors: ['#2a1420', '#f3e6ea', '#d9a6b3'] },
  { name: 'Pierre & terre de Sienne', colors: ['#efe9df', '#2d2620', '#a0522d'] },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t border-border pt-5">
      <legend className="pr-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{title}</legend>
      {children}
    </fieldset>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-1" />
        <Input
          aria-label={`${label} (hex)`}
          value={draft}
          maxLength={7}
          onChange={(e) => {
            setDraft(e.target.value);
            if (HEX.test(e.target.value)) onChange(e.target.value.toLowerCase());
          }}
          className="font-mono uppercase"
        />
      </div>
    </Field>
  );
}

function FontField({ label, value, onChange }: { label: string; value: FontId; onChange: (v: FontId) => void }) {
  const { t } = useI18n();
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value as FontId)}>
        {KINDS.map((k) => (
          <optgroup key={k} label={t(`brand.kind.${k}`)}>
            {FONT_IDS.filter((id) => FONTS[id].kind === k).map((id) => (
              <option key={id} value={id}>
                {FONTS[id].label}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
      <p className="truncate pt-1 text-2xl text-ink" style={{ fontFamily: FONTS[value].stack }}>
        Grand Cru 2015 — 480 €
      </p>
    </Field>
  );
}

function Contrast({ label, ratio, ok, min }: { label: string; ratio: number; ok: boolean; min: number }) {
  const { t, intl } = useI18n();
  const n = new Intl.NumberFormat(intl, { maximumFractionDigits: 1 }).format(ratio);
  return (
    <p className={cx('flex items-start gap-1.5 text-xs', ok ? 'text-ok' : 'text-warn')} role={ok ? undefined : 'alert'}>
      {ok ? <CircleCheck className="mt-px size-3.5 shrink-0" /> : <CircleAlert className="mt-px size-3.5 shrink-0" />}
      <span>
        {t(label, { n })}
        {!ok && ` ${t('brand.contrastLow', { n: min })}`}
      </span>
    </p>
  );
}

/** Logo de l'établissement (stocké dans l'organisation, réutilisé sur les documents et les cartes). */
export function LogoUpload() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { org, updateOrg, can } = useOrg();
  if (!can('manager')) return null;
  const upload = (file?: File) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type)) return toast(t('brand.logoType'), 'bad');
    if (file.size > 300 * 1024) return toast(t('brand.logoTooBig'), 'bad');
    const reader = new FileReader();
    reader.onload = async () => {
      await updateOrg({ legal: { ...org.legal, logoDataUrl: String(reader.result) } });
      toast(t('common.saved'));
    };
    reader.readAsDataURL(file);
  };
  return (
    <Field label={t('brand.logo')}>
      <div className="flex items-center gap-3">
        {org.legal.logoDataUrl && <img src={org.legal.logoDataUrl} alt="" className="h-12 max-w-32 rounded border border-border bg-white object-contain p-1" />}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => upload(e.target.files?.[0])} className="min-w-0 text-sm" />
      </div>
    </Field>
  );
}

export function BrandControls({ value, onChange }: { value: BrandTheme; onChange: (v: BrandTheme) => void }) {
  const { t } = useI18n();
  const { org } = useOrg();
  const set = <K extends keyof BrandTheme>(k: K, v: BrandTheme[K]) => onChange({ ...value, [k]: v });
  const checks = checkTheme(value);
  useEffect(() => ensureFonts(FONT_IDS), []);

  return (
    <div className="space-y-5">
      <Section title={t('brand.typography')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FontField label={t('brand.headingFont')} value={value.headingFont} onChange={(v) => set('headingFont', v)} />
          <FontField label={t('brand.bodyFont')} value={value.bodyFont} onChange={(v) => set('bodyFont', v)} />
        </div>
        <p className="text-xs text-muted">{t('brand.fontsNote')}</p>
      </Section>

      <Section title={t('brand.colors')}>
        <div>
          <p className="mb-2 text-xs font-medium text-muted">{t('brand.palettes')}</p>
          <div className="flex flex-wrap gap-2">
            {PALETTES.map((p) => {
              const active = p.colors[0] === value.background && p.colors[1] === value.text && p.colors[2] === value.accent;
              return (
                <button
                  key={p.name}
                  type="button"
                  title={p.name}
                  aria-label={p.name}
                  aria-pressed={active}
                  onClick={() => onChange({ ...value, background: p.colors[0], text: p.colors[1], accent: p.colors[2] })}
                  className={cx('flex h-9 overflow-hidden rounded-full border transition', active ? 'border-brand ring-2 ring-brand/30' : 'border-border hover:border-muted')}
                >
                  {p.colors.map((c, i) => (
                    <span key={i} className="block h-full w-5" style={{ background: c }} />
                  ))}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <ColorField label={t('brand.background')} value={value.background} onChange={(v) => set('background', v)} />
          <ColorField label={t('brand.text')} value={value.text} onChange={(v) => set('text', v)} />
          <ColorField label={t('brand.accent')} value={value.accent} onChange={(v) => set('accent', v)} />
        </div>
        <div className="space-y-1">
          <Contrast label="brand.contrastText" ratio={checks.text} ok={checks.textOk} min={4.5} />
          <Contrast label="brand.contrastAccent" ratio={checks.accent} ok={checks.accentOk} min={3} />
        </div>
      </Section>

      <Section title={t('brand.layout')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('brand.ornament')}>
            <Select value={value.ornament} onChange={(e) => set('ornament', e.target.value as BrandTheme['ornament'])}>
              {ORNAMENTS.map((o) => (
                <option key={o} value={o}>
                  {t(`brand.orn.${o}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('brand.case')}>
            <Select value={value.sectionCase} onChange={(e) => set('sectionCase', e.target.value as BrandTheme['sectionCase'])}>
              {CASES.map((c) => (
                <option key={c} value={c}>
                  {t(`brand.case.${c}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('brand.price')}>
            <Select value={value.priceStyle} onChange={(e) => set('priceStyle', e.target.value as BrandTheme['priceStyle'])}>
              {PRICE_STYLES.map((p) => (
                <option key={p} value={p}>
                  {t(`brand.price.${p}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('brand.align')} className="sm:col-span-2">
            <Segmented value={value.align} onChange={(v) => set('align', v)} options={(['center', 'left'] as const).map((a) => ({ value: a, label: t(`brand.align.${a}`) }))} />
          </Field>
          <Field label={t('brand.density')} className="sm:col-span-2">
            <Segmented value={value.density} onChange={(v) => set('density', v)} options={DENSITIES.map((d) => ({ value: d, label: t(`brand.density.${d}`) }))} />
          </Field>
          <Field label={t('brand.titleScale')} className="sm:col-span-2">
            <Segmented value={value.titleScale} onChange={(v) => set('titleScale', v)} options={TITLE_SCALES.map((s) => ({ value: s, label: t(`brand.scale.${s}`) }))} />
          </Field>
        </div>
      </Section>

      <Section title={t('brand.identity')}>
        <Checkbox checked={value.showLogo} onChange={(v) => set('showLogo', v)} label={t('brand.showLogo')} />
        {value.showLogo && !org.legal.logoDataUrl && <p className="text-xs text-muted">{t('brand.noLogo')}</p>}
        <LogoUpload />
        <Field label={t('brand.tagline')}>
          <Input value={value.tagline} maxLength={120} onChange={(e) => set('tagline', e.target.value)} placeholder={t('brand.taglinePh')} />
        </Field>
        <Field label={t('brand.footer')}>
          <Textarea rows={2} value={value.footer} maxLength={240} onChange={(e) => set('footer', e.target.value)} placeholder={t('brand.footerPh')} />
        </Field>
      </Section>
    </div>
  );
}
