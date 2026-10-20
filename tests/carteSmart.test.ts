import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import type { Movement, Org, StockLevel, Wine } from '@/types';
import { GLASS_KEY, PINNED_KEY, buildListSections, countWines, defaultWineList, hashPublicDoc, listToCsvRows, toPublicDoc } from '@/modules/carte/build';
import { CONTENT, CONTENT_LANGS, EXTRA_LANGS, builtInTitle, normalizeLanguages, offeredLanguages } from '@/modules/carte/content';
import { localizeDoc, mergeTranslations, pickTranslations, textKey, translatableTexts, translationTargets } from '@/modules/carte/translate';
import { applySuggestion, computeSuggestions } from '@/modules/carte/suggestions';
import type { WineList } from '@/modules/carte/types';
import { carte } from '@/i18n/carte';
import { InputError } from '../server/aiInput';
import { MAX_TEXTS, parseTranslate, sanitizeTranslations, translateRouter, translateSystem } from '../server/aiTranslate';

const org: Pick<Org, 'id' | 'name' | 'defaultVatRate'> = { id: 'o1', name: 'Chez Loul', defaultVatRate: 20 };
const NOW = Date.parse('2026-10-19T12:00:00Z');

const wine = (id: string, p: Partial<Wine> = {}): Wine => ({
  id,
  producer: `Dom ${id}`,
  name: `Cuvée ${id}`,
  vintage: '2020',
  color: 'rouge',
  formatCl: 75,
  region: 'Bourgogne',
  buyPriceHT: 20,
  alertThreshold: 2,
  canonicalKey: id,
  createdAt: NOW - 400 * 86_400_000,
  updatedAt: 0,
  ...p,
});
const stk = (wineId: string, qty: number, siteId = 's'): StockLevel => ({ id: `${wineId}__${siteId}`, wineId, siteId, qty, updatedAt: 0 });
const list = (p: Partial<WineList> = {}): WineList => ({ ...defaultWineList('fr', 'Carte'), id: 'l1', ...p });
const mv = (wineId: string, type: Movement['type'], date: string): Movement => ({
  id: `${wineId}-${date}-${type}`,
  date,
  wineId,
  wineLabel: wineId,
  siteId: 's',
  type,
  qty: 1,
  reason: type === 'out' ? 'vente' : 'achat',
  userId: 'u',
  userName: 'U',
  createdAt: Date.parse(date),
});
const glass = (priceTTC: number | undefined, glassCl = 12.5): Wine['byGlass'] => ({ enabled: true, glassCl, priceTTC });

describe('section « Au verre »', () => {
  const wines = [
    wine('a', { color: 'blanc', byGlass: glass(9) }),
    wine('b', { byGlass: glass(14, 15) }),
    wine('c', { byGlass: { enabled: false, glassCl: 12, priceTTC: 8 } }),
    wine('d', { byGlass: glass(undefined) }),
    wine('e'),
  ];
  const stock = wines.map((w) => stk(w.id, 6));

  it('arrive en tête avec le prix au verre, la contenance et le prix bouteille', () => {
    const s = buildListSections(list(), wines, stock, org);
    expect(s[0].key).toBe(GLASS_KEY);
    expect(s[0].titleKey).toBe(GLASS_KEY);
    expect(s[0].title).toBe('Au verre');
    expect(s[0].items.map((i) => [i.wineId, i.glassCl, i.glassPriceTTC, i.priceTTC])).toEqual([
      ['a', 12.5, 9, 72],
      ['b', 15, 14, 72],
    ]);
    expect(countWines(s)).toBe(5);
  });

  it('les anciennes cartes sans réglage l’affichent ; showByGlass=false la masque', () => {
    const legacy = list();
    delete legacy.showByGlass;
    expect(buildListSections(legacy, wines, stock, org)[0].key).toBe(GLASS_KEY);
    expect(buildListSections(list({ showByGlass: false }), wines, stock, org).some((x) => x.key === GLASS_KEY)).toBe(false);
  });

  it('respecte exclusions et stock ; prix bouteille null si le vin n’est pas en bouteille à la carte', () => {
    const s1 = buildListSections(list({ excludedWineIds: ['a'] }), wines, stock, org);
    expect(s1[0].items.map((i) => i.wineId)).toEqual(['b']);
    const s2 = buildListSections(list({ minStock: 3 }), wines, [stk('a', 2), stk('b', 0)], org);
    expect(s2[0].key).toBe(GLASS_KEY);
    expect(s2[0].items.map((i) => [i.wineId, i.priceTTC])).toEqual([['a', null]]);
  });

  it('se place avant les coups de cœur et n’entre pas dans l’ordre personnalisable', () => {
    const s = buildListSections(list({ pinnedWineIds: ['e'] }), wines, stock, org);
    expect(s.slice(0, 2).map((x) => x.key)).toEqual([GLASS_KEY, PINNED_KEY]);
  });

  it('instantané public : prix et contenance du verre, sans prix d’achat ni stock', () => {
    const sections = buildListSections(list(), wines, stock, org);
    const doc = toPublicDoc({ ...list(), publicId: 'x'.repeat(24) }, sections, org, 1);
    expect(doc.sections[0]).toMatchObject({ title: 'Au verre', titleKey: GLASS_KEY });
    expect(doc.sections[0].items[0]).toMatchObject({ glassCl: 12.5, glassPriceTTC: 9, priceTTC: 72 });
    expect(doc.sections[1].items[0].glassPriceTTC).toBeUndefined();
    const json = JSON.stringify(doc);
    expect(json).not.toContain('buyPrice');
    expect(json).not.toContain('"qty"');
    expect(json).not.toContain('wineId');
    expect(Object.keys(doc).sort()).toEqual(['language', 'name', 'orgId', 'orgName', 'publicId', 'sections', 'template', 'theme', 'updatedAt']);
  });

  it('le hash détecte un changement de prix au verre', () => {
    const a = toPublicDoc(list(), buildListSections(list(), wines, stock, org), org, 1);
    const w2 = wines.map((w) => (w.id === 'a' ? { ...w, byGlass: glass(10) } : w));
    const b = toPublicDoc(list(), buildListSections(list(), w2, stock, org), org, 1);
    expect(hashPublicDoc(a)).not.toBe(hashPublicDoc(b));
  });

  it('export CSV avec colonnes verre', () => {
    const rows = listToCsvRows(buildListSections(list(), wines, stock, org));
    expect(rows[0].slice(-2)).toEqual(['glass_cl', 'glass_price_ttc']);
    expect(rows[1].slice(-2)).toEqual([12.5, 9]);
  });
});

describe('titres standard traduits sans IA', () => {
  it('7 langues, tous les titres renseignés', () => {
    expect(CONTENT_LANGS).toEqual(['fr', 'en', 'it', 'de', 'es', 'zh', 'ja']);
    for (const l of CONTENT_LANGS) {
      const c = CONTENT[l];
      for (const k of [PINNED_KEY, GLASS_KEY, '__other', 'bulles', 'blanc', 'rose', 'orange', 'rouge', 'doux', 'spiritueux', 'autre']) expect(builtInTitle(k, l)?.trim()).toBeTruthy();
      for (const v of [c.glassUnit, c.bottle, c.footer]) expect(v.trim()).toBeTruthy();
    }
    expect(builtInTitle(GLASS_KEY, 'it')).toBe('Al calice');
    expect(builtInTitle('rouge', 'de')).toBe('Rotweine');
    expect(builtInTitle('Bourgogne', 'it')).toBeUndefined();
    expect(builtInTitle(undefined, 'it')).toBeUndefined();
  });

  it('localise les sections standard et garde l’original des textes non traduits', () => {
    const wines = [wine('a', { color: 'blanc', byGlass: glass(9) }), wine('b')];
    const sections = buildListSections(list({ pinnedWineIds: ['b'] }), wines, [stk('a', 3), stk('b', 3)], org);
    const doc = toPublicDoc(list({ pinnedWineIds: ['b'] }), sections, org, 1);
    expect(localizeDoc(doc, 'fr')).toBe(doc);
    const it = localizeDoc(doc, 'it');
    expect(it.sections.map((s) => s.title)).toEqual(['Al calice', 'I preferiti del sommelier', 'Vini bianchi']);
    expect(it.name).toBe('Carte');
    expect(it.sections[0].items[0].name).toBe('Cuvée a');
    expect(localizeDoc(doc, 'ja').sections[2].title).toBe('白ワイン');
  });

  it('langues proposées : fr, en puis langues valides dans l’ordre canonique', () => {
    expect(normalizeLanguages(['ja', 'xx', 'it', 'it', 'en'])).toEqual(['it', 'ja']);
    expect(offeredLanguages(['de'])).toEqual(['fr', 'en', 'de']);
    expect(translationTargets({ language: 'fr', languages: ['zh'] })).toEqual(['en', 'zh']);
    expect(EXTRA_LANGS).toEqual(['it', 'de', 'es', 'zh', 'ja']);
  });
});

describe('traductions des textes libres', () => {
  const wines = [wine('a', { region: 'Bourgogne', technicalSheet: { bouche: 'Ample et frais' } }), wine('b', { region: 'Loire' })];
  const stock = [stk('a', 3), stk('b', 3)];
  const base = list({ name: 'Carte du soir', groupBy: 'region', showDescription: true });

  it('collecte nom, titres libres et notes, sans les titres standard ni les noms de vins', () => {
    const doc = toPublicDoc(base, buildListSections(base, wines, stock, org), org, 1);
    const texts = translatableTexts(doc);
    expect(texts.map((x) => [x.kind, x.text])).toEqual([
      ['name', 'Carte du soir'],
      ['section', 'Loire'],
      ['section', 'Bourgogne'],
      ['note', 'Ample et frais'],
    ]);
    expect(texts.every((x) => x.key === textKey(x.text))).toBe(true);
    expect(textKey(' Loire ')).toBe(textKey('Loire'));
    expect(textKey('Loire')).not.toBe(textKey('Loir'));
  });

  it('publie uniquement les langues proposées et les textes présents, et les applique', () => {
    const tr = mergeTranslations(undefined, 'it', [
      { key: textKey('Carte du soir'), text: 'Carta della sera' },
      { key: textKey('Bourgogne'), text: 'Borgogna' },
      { key: textKey('Ancien titre'), text: 'Vecchio titolo' },
    ]);
    const withDe = mergeTranslations(tr, 'de', [{ key: textKey('Loire'), text: 'Loire' }]);
    const l = { ...base, languages: ['it'] as WineList['languages'], translations: { ...withDe, fr: { [textKey('Loire')]: 'Loire FR' } } };
    const doc = toPublicDoc(l, buildListSections(l, wines, stock, org), org, 1);
    expect(doc.languages).toEqual(['it']);
    expect(Object.keys(doc.translations ?? {})).toEqual(['it']);
    expect(doc.translations?.it).toEqual({ [textKey('Bourgogne')]: 'Borgogna', [textKey('Carte du soir')]: 'Carta della sera' });
    const it = localizeDoc(doc, 'it');
    expect(it.name).toBe('Carta della sera');
    expect(it.sections.map((s) => s.title)).toEqual(['Loire', 'Borgogna']);
    expect(it.sections[1].items[0].note).toBe('Ample et frais');
    expect(localizeDoc(doc, 'en').name).toBe('Carte du soir');
  });

  it('le hash couvre langues et traductions, indépendamment de l’ordre des clés', () => {
    const sections = buildListSections(base, wines, stock, org);
    const plain = toPublicDoc(base, sections, org, 1);
    const withLang = toPublicDoc({ ...base, languages: ['es'] }, sections, org, 1);
    const withTr = toPublicDoc({ ...base, languages: ['es'], translations: { es: { [textKey('Loire')]: 'Loira' } } }, sections, org, 1);
    expect(hashPublicDoc(plain)).not.toBe(hashPublicDoc(withLang));
    expect(hashPublicDoc(withLang)).not.toBe(hashPublicDoc(withTr));
    const reordered = JSON.parse(JSON.stringify({ sections: withTr.sections, translations: withTr.translations, theme: withTr.theme, name: withTr.name, orgName: withTr.orgName, orgId: withTr.orgId, template: withTr.template, language: withTr.language, languages: withTr.languages }));
    expect(hashPublicDoc(reordered)).toBe(hashPublicDoc(withTr));
  });

  it('mergeTranslations : un texte vide supprime l’entrée et la langue vide', () => {
    const a = mergeTranslations(undefined, 'zh', [{ key: 'k1', text: ' 你好 ' }]);
    expect(a).toEqual({ zh: { k1: '你好' } });
    expect(mergeTranslations(a, 'zh', [{ key: 'k1', text: '  ' }])).toEqual({});
  });

  it('pickTranslations ignore la langue de rédaction et les valeurs vides', () => {
    const keys = new Set(['k']);
    expect(pickTranslations({ fr: { k: 'x' }, en: { k: '' } }, 'fr', ['fr', 'en'], keys)).toBeUndefined();
    expect(pickTranslations({ en: { k: ' Hi ', z: 'no' } }, 'fr', ['fr', 'en'], keys)).toEqual({ en: { k: 'Hi' } });
  });
});

describe('suggestions de composition', () => {
  const year = new Date(NOW).getFullYear();
  const wines = [
    wine('low'),
    wine('past', { apogeeFrom: 2015, apogeeTo: year - 2 }),
    wine('dorm'),
    wine('peak', { apogeeFrom: year - 1, apogeeTo: year + 3 }),
    wine('rich', { buyPriceHT: 100 }),
    wine('cheap', { buyPriceHT: 10, menuPriceTTC: 14 }),
    wine('excl'),
    wine('young', { createdAt: NOW - 10 * 86_400_000 }),
  ];
  const stock = [stk('low', 2), stk('past', 6), stk('dorm', 8), stk('peak', 6), stk('rich', 6), stk('cheap', 6), stk('excl', 9), stk('young', 9)];
  const movements = ['low', 'past', 'peak', 'rich', 'cheap'].map((id) => mv(id, 'out', '2026-10-01'));
  const run = (l: WineList) => computeSuggestions({ list: l, wines, stock, movements, sections: buildListSections(l, wines, stock, org), vatRate: 20, now: NOW });

  it('détecte rupture proche, apogée dépassée, stock dormant, apogée et belle marge', () => {
    const s = run(list({ excludedWineIds: ['excl'] }));
    const byWine = new Map(s.map((x) => [x.wineId, x]));
    expect(byWine.get('low')).toMatchObject({ kind: 'lowStock', actions: ['remove'], qty: 2 });
    expect(byWine.get('past')).toMatchObject({ kind: 'pastWindow', actions: ['pin', 'remove'] });
    expect(byWine.get('dorm')).toMatchObject({ kind: 'dormant', actions: ['pin'] });
    expect(byWine.get('dorm')?.idleDays).toBeGreaterThanOrEqual(90);
    expect(byWine.get('excl')).toMatchObject({ kind: 'dormant', actions: ['include'], shown: false });
    expect(byWine.get('peak')).toMatchObject({ kind: 'window', actions: ['pin'] });
    expect(byWine.get('rich')).toMatchObject({ kind: 'margin', actions: ['pin'] });
    expect(byWine.get('rich')?.marginHT).toBe(200);
    expect(byWine.has('cheap')).toBe(false); // marge < 60 %
    expect(byWine.get('young')?.kind).toBe('margin'); // entré il y a 10 jours : pas dormant
    expect(new Set(s.map((x) => x.wineId)).size).toBe(s.length);
    expect(s.map((x) => x.kind)).toEqual(['lowStock', 'pastWindow', 'dormant', 'dormant', 'window', 'margin', 'margin']);
  });

  it('une sortie récente ou un vin épinglé écarte les suggestions d’épinglage', () => {
    const s = computeSuggestions({ list: list({ pinnedWineIds: ['peak', 'rich'] }), wines, stock, movements: [...movements, mv('dorm', 'out', '2026-09-30')], sections: buildListSections(list({ pinnedWineIds: ['peak', 'rich'] }), wines, stock, org), vatRate: 20, now: NOW });
    const ids = s.map((x) => x.wineId);
    expect(s.find((x) => x.wineId === 'dorm')?.kind).not.toBe('dormant');
    expect(ids).not.toContain('peak');
    expect(ids).not.toContain('rich');
  });

  it('ignorer masque la suggestion et laisse place à la suivante', () => {
    const l = list();
    const first = run(l).find((x) => x.wineId === 'past');
    expect(first).toBeDefined();
    const dismissed = { ...l, ...applySuggestion(l, first!, 'dismiss') };
    expect(dismissed.dismissedSuggestions).toEqual(['pastWindow:past']);
    const next = run(dismissed).find((x) => x.wineId === 'past');
    expect(next?.kind).not.toBe('pastWindow');
  });

  it('actions : épingler, retirer, remettre à la carte', () => {
    const l = list({ excludedWineIds: ['x'], pinnedWineIds: ['y'] });
    expect(applySuggestion(l, { id: 'dormant:x', wineId: 'x' }, 'pin')).toEqual({ pinnedWineIds: ['y', 'x'], excludedWineIds: [] });
    expect(applySuggestion(l, { id: 'lowStock:y', wineId: 'y' }, 'remove')).toEqual({ excludedWineIds: ['x', 'y'], pinnedWineIds: [] });
    expect(applySuggestion(l, { id: 'dormant:x', wineId: 'x' }, 'include')).toEqual({ excludedWineIds: [] });
  });
});

describe('route de traduction : validation', () => {
  const texts = [
    { key: 'tabc', text: 'Bourgogne' },
    { key: 'tdef', text: 'Ample et frais' },
  ];

  it('accepte une requête valide et normalise', () => {
    expect(parseTranslate({ target: 'it', source: 'fr', texts })).toEqual({ target: 'it', source: 'fr', texts });
    expect(parseTranslate({ target: 'ja', texts: [{ key: 'k', text: '  Rouge\u0000 ' }] })).toEqual({ target: 'ja', source: null, texts: [{ key: 'k', text: 'Rouge' }] });
  });

  it('rejette langue inconnue, liste vide, trop de textes, source = cible', () => {
    expect(() => parseTranslate({ target: 'xx', texts })).toThrow(InputError);
    expect(() => parseTranslate({ target: 'it', texts: [] })).toThrow(InputError);
    expect(() => parseTranslate({ target: 'it', source: 'it', texts })).toThrow(InputError);
    expect(() => parseTranslate(null)).toThrow(InputError);
    const many = Array.from({ length: MAX_TEXTS + 1 }, (_, i) => ({ key: `k${i}`, text: 'x' }));
    expect(() => parseTranslate({ target: 'de', texts: many })).toThrow(InputError);
    expect(parseTranslate({ target: 'de', texts: many.slice(0, MAX_TEXTS) }).texts).toHaveLength(MAX_TEXTS);
  });

  it('écarte clés invalides, doublons, textes vides ou trop longs', () => {
    const r = parseTranslate({
      target: 'es',
      texts: [{ key: 'ok', text: 'Blanc' }, { key: 'ok', text: 'dup' }, { key: 'bad key!', text: 'x' }, { key: 'e', text: '   ' }, { key: 'long', text: 'x'.repeat(1001) }, 'junk'],
    });
    expect(r.texts).toEqual([{ key: 'ok', text: 'Blanc' }]);
    expect(() => parseTranslate({ target: 'es', texts: [{ key: '__proto__ x', text: 'a' }] })).toThrow(InputError);
  });

  it('ne garde que les clés demandées, une fois, nettoyées et bornées', () => {
    const input = parseTranslate({ target: 'it', texts });
    const out = sanitizeTranslations(input, {
      translations: [
        { key: 'tabc', text: 'Borgogna' },
        { key: 'tabc', text: 'doublon' },
        { key: 'zzz', text: 'inventé' },
        { key: 'tdef', text: 'y'.repeat(5000) },
        { key: 'tdef', text: 'second' },
      ],
    });
    expect(out[0]).toEqual({ key: 'tabc', text: 'Borgogna' });
    expect(out[1].key).toBe('tdef');
    expect(out[1].text.length).toBeLessThanOrEqual('Ample et frais'.length * 3 + 60);
    expect(out).toHaveLength(2);
    expect(sanitizeTranslations(input, null)).toEqual([]);
    expect(sanitizeTranslations(input, { translations: 'x' })).toEqual([]);
  });

  it('le prompt protège les noms propres et traite les textes comme des données', () => {
    const sys = translateSystem({ target: 'zh', source: 'fr' });
    expect(sys).toContain('chinois');
    expect(sys).toMatch(/appellations/);
    expect(sys).toMatch(/DONNÉES/);
  });

  describe('sans clé Gemini', () => {
    let server: Server;
    let base = '';
    const saved = process.env.GEMINI_API_KEY;
    beforeAll(async () => {
      delete process.env.GEMINI_API_KEY;
      const app = express();
      app.use(express.json());
      app.use('/api/ai/translate', translateRouter);
      await new Promise<void>((resolve) => {
        server = app.listen(0, '127.0.0.1', () => resolve());
      });
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai/translate`;
    });
    afterAll(() => {
      if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
      server?.close();
    });
    const post = (body: unknown) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    it('400 sur requête invalide, 503 explicite si le service n’est pas configuré', async () => {
      const bad = await post({ target: 'xx', texts });
      expect(bad.status).toBe(400);
      expect((await bad.json()).error).toMatch(/invalide/);
      const r = await post({ target: 'it', source: 'fr', texts });
      expect(r.status).toBe(503);
      expect((await r.json()).error).toMatch(/GEMINI_API_KEY/);
    });
  });
});

describe('i18n carte intelligente', () => {
  it('clés dynamiques présentes en FR et EN', () => {
    const dyn = [
      ...['lowStock', 'pastWindow', 'dormant', 'window', 'margin'].map((k) => `carte.sug.kind.${k}`),
      ...['pin', 'remove', 'include'].flatMap((k) => [`carte.sug.${k}`, `carte.sug.done.${k}`]),
      ...['name', 'tagline', 'footer', 'section', 'note'].map((k) => `carte.lang.kind.${k}`),
    ];
    expect(dyn.filter((k) => !(k in carte.fr) || !(k in carte.en))).toEqual([]);
  });
});
