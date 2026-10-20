import { describe, expect, it } from 'vitest';
import type { BrandTheme } from '@/types';
import { PRESETS, PRESET_IDS, appBrandColor, checkTheme, contrast, readableOn, sanitizeTheme, themeVars } from '@/lib/brand';
import { MAX_LOGO_CHARS, defaultWineList, hashPublicDoc, publicTheme, resolveListTheme, toPublicDoc } from '@/modules/carte/build';
import { LIST_TEMPLATES } from '@/modules/carte/types';
import { brand } from '@/i18n/brand';

const custom: BrandTheme = { ...PRESETS.palace, background: '#14261f', text: '#efe8d6', accent: '#c9a96a', headingFont: 'bodoni', tagline: 'Sélection du Chef Sommelier' };
const logo = `data:image/png;base64,${'A'.repeat(100)}`;
const org = { id: 'o1', name: 'Le Grand Palais', legal: { logoDataUrl: logo } as never };

describe('brand themes', () => {
  it('every list template has a valid preset', () => {
    for (const tp of LIST_TEMPLATES) expect(sanitizeTheme(PRESETS[tp])).toEqual(PRESETS[tp]);
    expect([...PRESET_IDS].sort()).toEqual([...LIST_TEMPLATES].sort());
  });

  it('computes WCAG contrast and readable foregrounds', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#777777')).toBe(1);
    expect(readableOn('#0b0b0c')).toBe('#ffffff');
    expect(readableOn('#f8f5ee')).toBe('#000000');
  });

  it('presets are legible', () => {
    for (const id of PRESET_IDS) {
      const c = checkTheme(PRESETS[id]);
      expect(c.textOk, id).toBe(true);
      expect(c.accentOk, id).toBe(true);
    }
    expect(checkTheme({ ...PRESETS.palace, text: '#eeeeee' }).textOk).toBe(false);
  });

  it('sanitizes untrusted public data', () => {
    const t = sanitizeTheme({ headingFont: 'comic', background: 'red;}body{display:none', text: '#ABCDEF', ornament: 'x', tagline: 'x'.repeat(500), showLogo: 'yes', extra: 1 }, PRESETS.epure);
    expect(t.headingFont).toBe(PRESETS.epure.headingFont);
    expect(t.background).toBe(PRESETS.epure.background);
    expect(t.text).toBe('#abcdef');
    expect(t.ornament).toBe(PRESETS.epure.ornament);
    expect(t.tagline).toHaveLength(120);
    expect(t.showLogo).toBe(PRESETS.epure.showLogo);
    expect(Object.keys(t)).not.toContain('extra');
    expect(sanitizeTheme(null)).toEqual(PRESETS.prestige);
  });

  it('exposes interface tokens so shared components adopt the identity', () => {
    const v = themeVars(custom) as Record<string, string>;
    expect(v['--brand']).toBe(custom.accent);
    expect(v['--bg']).toBe(custom.background);
    expect(v['--text']).toBe(custom.text);
    expect(v['--lt-head']).toContain('Bodoni');
    expect(contrast(v['--brand-fg'], custom.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('only uses a brand colour in the app when it is legible', () => {
    expect(appBrandColor({ ...PRESETS.palace, accent: '#8a2a3b' }, '#ffffff')).toBe('#8a2a3b');
    expect(appBrandColor(PRESETS.palace, '#ffffff')).toBe(PRESETS.palace.text);
    expect(appBrandColor(PRESETS.palace, '#1c1517')).toBe(PRESETS.palace.accent);
    expect(appBrandColor({ ...PRESETS.or }, '#ffffff')).toBe(PRESETS.or.background);
    expect(appBrandColor({ ...PRESETS.palace, accent: '#fafafa', text: '#f0f0f0', background: '#ffffff' }, '#ffffff')).toBeNull();
  });
});

describe('list theme resolution & publication', () => {
  const list = { ...defaultWineList('fr', 'Carte'), id: 'l1', publicId: 'p'.repeat(24), template: 'or' as const };

  it('preset → bespoke → house style', () => {
    expect(resolveListTheme(list)).toEqual(PRESETS.or);
    expect(resolveListTheme({ ...list, theme: custom })).toEqual(custom);
    expect(resolveListTheme({ ...list, theme: custom, useBrand: true }, { brand: PRESETS.epure })).toEqual(PRESETS.epure);
    expect(resolveListTheme({ ...list, useBrand: true }, {})).toEqual(PRESETS.or);
  });

  it('new lists follow the house style when one exists', () => {
    expect(defaultWineList('fr', 'x').useBrand).toBe(false);
    expect(defaultWineList('fr', 'x', { brand: custom }).useBrand).toBe(true);
  });

  it('public snapshot embeds the resolved theme and a bounded logo', () => {
    const doc = toPublicDoc({ ...list, theme: custom }, [], org, 1);
    expect(doc.theme).toEqual(custom);
    expect(doc.logoDataUrl).toBe(logo);
    expect(toPublicDoc({ ...list, theme: { ...custom, showLogo: false } }, [], org, 1).logoDataUrl).toBeUndefined();
    const huge = { ...org, legal: { logoDataUrl: `data:image/png;base64,${'A'.repeat(MAX_LOGO_CHARS)}` } as never };
    expect(toPublicDoc({ ...list, theme: custom }, [], huge, 1).logoDataUrl).toBeUndefined();
    const html = { ...org, legal: { logoDataUrl: 'data:text/html;base64,PHNjcmlwdD4=' } as never };
    expect(toPublicDoc({ ...list, theme: custom }, [], html, 1).logoDataUrl).toBeUndefined();
  });

  it('design changes trigger republication; legacy docs still render', () => {
    const a = toPublicDoc(list, [], org, 1);
    const b = toPublicDoc({ ...list, theme: { ...PRESETS.or, accent: '#c0c0c0' } }, [], org, 1);
    expect(hashPublicDoc(a)).not.toBe(hashPublicDoc(b));
    expect(publicTheme({ template: 'bistrot' })).toEqual(PRESETS.bistrot);
    expect(publicTheme({ template: 'unknown' as never })).toEqual(PRESETS.prestige);
  });
});

describe('i18n brand', () => {
  it('same keys in FR and EN', () => {
    expect(Object.keys(brand.fr).sort()).toEqual(Object.keys(brand.en).sort());
  });
});
