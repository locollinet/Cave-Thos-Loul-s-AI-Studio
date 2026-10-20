import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { QUALITY_STEPS, base64Bytes, encodeUnderLimit, fitWithin, fitsLimit, isImageType, splitDataUrl, wineImageDeleteOps, wineImageSetOps, ImageError } from '@/lib/image';
import { MAX_LABEL_BASE64, normAbv, normColor, normFormatCl, normVintage, normalizeLabel, parseLabelInput, cleanText } from '../server/labelInput';
import { InputError } from '../server/aiInput';
import { labelRouter } from '../server/aiLabel';

const path = (c: string, id?: string) => `orgs/o1/${c}${id ? `/${id}` : ''}`;
const B64 = 'A'.repeat(400);

describe('image helpers (client)', () => {
  it('ramène les dimensions sous le bord max sans agrandir', () => {
    expect(fitWithin(4032, 3024, 900)).toEqual({ width: 900, height: 675 });
    expect(fitWithin(3024, 4032, 900)).toEqual({ width: 675, height: 900 });
    expect(fitWithin(600, 400, 900)).toEqual({ width: 600, height: 400 });
    expect(fitWithin(10000, 10, 900)).toEqual({ width: 900, height: 1 });
    expect(fitWithin(0, 100, 900)).toEqual({ width: 0, height: 0 });
  });

  it('reconnaît les images (type ou extension)', () => {
    expect(isImageType('image/jpeg')).toBe(true);
    expect(isImageType('image/heic')).toBe(true);
    expect(isImageType('image/svg+xml')).toBe(false);
    expect(isImageType('application/pdf', 'x.jpg')).toBe(false);
    expect(isImageType('', 'IMG_0001.HEIC')).toBe(true);
    expect(isImageType('', 'notes.txt')).toBe(false);
  });

  it('découpe et mesure les data URL', () => {
    expect(splitDataUrl('data:image/webp;base64,QUJD')).toEqual({ mimeType: 'image/webp', base64: 'QUJD' });
    expect(splitDataUrl('nope')).toBeNull();
    expect(base64Bytes('QUJD')).toBe(3);
    expect(base64Bytes('QUI=')).toBe(2);
    expect(base64Bytes('QQ==')).toBe(1);
    expect(fitsLimit('x'.repeat(300_000), 300_000)).toBe(true);
    expect(fitsLimit('x'.repeat(300_001), 300_000)).toBe(false);
  });

  it('baisse la qualité puis la taille jusqu’à passer sous la limite', () => {
    const calls: [number, number, number][] = [];
    // Encodeur factice : taille ∝ pixels × qualité.
    const enc = (w: number, h: number, q: number) => {
      calls.push([w, h, q]);
      return 'x'.repeat(Math.round(w * h * q));
    };
    const r = encodeUnderLimit(enc, 900, 600, 300_000);
    expect(r.dataUrl.length).toBeLessThanOrEqual(300_000);
    expect(r.width).toBe(900);
    expect(r.quality).toBe(0.54);
    const small = encodeUnderLimit(enc, 900, 600, 150_000);
    expect(small.width).toBeLessThan(900);
    expect(small.dataUrl.length).toBeLessThanOrEqual(150_000);
    expect(calls[0][2]).toBe(QUALITY_STEPS[0]);
    expect(() => encodeUnderLimit(() => 'x'.repeat(10), 900, 900, 5)).toThrow(ImageError);
  });

  it('écrit photo + hasImage dans un seul commit, et les retire ensemble', () => {
    const set = wineImageSetOps(path, 'w1', { dataUrl: 'data:image/webp;base64,QUJD', mimeType: 'image/webp', width: 10, height: 20, source: 'upload' }, 42);
    expect(set).toEqual([
      { op: 'set', path: 'orgs/o1/wineImages/w1', data: { dataUrl: 'data:image/webp;base64,QUJD', mimeType: 'image/webp', width: 10, height: 20, source: 'upload', wineId: 'w1', updatedAt: 42 } },
      { op: 'set', path: 'orgs/o1/wines/w1', data: { hasImage: true, updatedAt: 42 }, merge: true },
    ]);
    expect(wineImageDeleteOps(path, 'w1', 43)).toEqual([
      { op: 'delete', path: 'orgs/o1/wineImages/w1' },
      { op: 'set', path: 'orgs/o1/wines/w1', data: { hasImage: false, updatedAt: 43 }, merge: true },
    ]);
  });
});

describe('lecture d’étiquette — entrée', () => {
  it('accepte png / jpeg / webp, avec ou sans préfixe data:', () => {
    expect(parseLabelInput({ imageBase64: B64, mimeType: 'image/png' })).toEqual({ base64: B64, mimeType: 'image/png', language: 'fr' });
    expect(parseLabelInput({ imageBase64: `data:image/webp;base64,${B64}`, language: 'en' })).toEqual({ base64: B64, mimeType: 'image/webp', language: 'en' });
    expect(parseLabelInput({ imageBase64: B64, mimeType: 'image/jpg' }).mimeType).toBe('image/jpeg');
  });

  it('refuse les autres types, les contenus invalides ou trop lourds', () => {
    expect(() => parseLabelInput({ imageBase64: B64, mimeType: 'application/pdf' })).toThrow(InputError);
    expect(() => parseLabelInput({ imageBase64: B64, mimeType: 'image/heic' })).toThrow(InputError);
    expect(() => parseLabelInput({ mimeType: 'image/png' })).toThrow(InputError);
    expect(() => parseLabelInput({ imageBase64: 'abc', mimeType: 'image/png' })).toThrow(InputError);
    expect(() => parseLabelInput({ imageBase64: `${B64}<script>`, mimeType: 'image/png' })).toThrow(InputError);
    expect(() => parseLabelInput({ imageBase64: 'A'.repeat(MAX_LABEL_BASE64 + 4), mimeType: 'image/png' })).toThrow(/volumineuse/);
    expect(() => parseLabelInput(null)).toThrow(InputError);
  });
});

describe('lecture d’étiquette — normalisation', () => {
  const now = new Date('2026-10-19');

  it('millésime', () => {
    expect(normVintage('2019', now)).toBe('2019');
    expect(normVintage(2015, now)).toBe('2015');
    expect(normVintage('Millésime 2018', now)).toBe('2018');
    expect(normVintage('NV', now)).toBe('NM');
    expect(normVintage('Non millésimé', now)).toBe('NM');
    expect(normVintage('nm', now)).toBe('NM');
    expect(normVintage('2031', now)).toBeNull();
    expect(normVintage('1999 / 2005', now)).toBeNull();
    expect(normVintage(null, now)).toBeNull();
    expect(normVintage('inconnu', now)).toBeNull();
  });

  it('couleur', () => {
    expect(normColor('rouge')).toBe('rouge');
    expect(normColor('Red')).toBe('rouge');
    expect(normColor('Rosé')).toBe('rose');
    expect(normColor('Champagne brut')).toBe('bulles');
    expect(normColor('Crémant')).toBe('bulles');
    expect(normColor('Liquoreux')).toBe('doux');
    expect(normColor('Cognac')).toBe('spiritueux');
    expect(normColor('white')).toBe('blanc');
    expect(normColor('violet')).toBeNull();
    expect(normColor(null)).toBeNull();
  });

  it('format en cl', () => {
    expect(normFormatCl(75)).toBe(75);
    expect(normFormatCl(750)).toBe(75);
    expect(normFormatCl(375)).toBe(37.5);
    expect(normFormatCl(150)).toBe(150);
    expect(normFormatCl(1.5)).toBe(150);
    expect(normFormatCl('750 ml')).toBe(75);
    expect(normFormatCl('75cl')).toBe(75);
    expect(normFormatCl('1,5 L')).toBe(150);
    expect(normFormatCl('Magnum')).toBe(150);
    expect(normFormatCl('Jéroboam')).toBe(300);
    expect(normFormatCl('37,5 cl')).toBe(37.5);
    expect(normFormatCl(0)).toBeNull();
    expect(normFormatCl(99999)).toBeNull();
    expect(normFormatCl('bouteille')).toBeNull();
  });

  it('degré', () => {
    expect(normAbv(13.5)).toBe(13.5);
    expect(normAbv('13,5 % vol.')).toBe(13.5);
    expect(normAbv(0.125)).toBe(12.5);
    expect(normAbv(140)).toBeNull();
    expect(normAbv('')).toBeNull();
  });

  it('textes vides ou « inconnu » → null', () => {
    expect(cleanText('  Domaine  Leflaive ')).toBe('Domaine Leflaive');
    expect(cleanText('N/A')).toBeNull();
    expect(cleanText('Inconnu')).toBeNull();
    expect(cleanText(['Pinot Noir', 'Gamay'])).toBe('Pinot Noir, Gamay');
    expect(cleanText(42)).toBeNull();
  });

  it('proposition complète : types sûrs, incertitudes filtrées', () => {
    const out = normalizeLabel(
      {
        isWineLabel: true,
        producer: 'Domaine Leflaive',
        name: null,
        cuvee: 'Les Pucelles',
        appellation: 'Puligny-Montrachet 1er Cru',
        vintage: '2019',
        color: 'White',
        region: 'Bourgogne',
        subRegion: 'Côte de Beaune',
        country: 'France',
        grapes: 'Chardonnay',
        abv: '13,5 %',
        formatCl: 750,
        uncertain: ['vintage', 'abv', 'abv', 'country', 'hack', 'ean'],
        extra: 'ignored',
      },
      now,
    );
    expect(out.isWineLabel).toBe(true);
    expect(out.fields).toEqual({
      producer: 'Domaine Leflaive',
      name: 'Puligny-Montrachet 1er Cru Les Pucelles',
      cuvee: 'Les Pucelles',
      appellation: 'Puligny-Montrachet 1er Cru',
      vintage: '2019',
      color: 'blanc',
      region: 'Bourgogne',
      subRegion: 'Côte de Beaune',
      country: 'France',
      grapes: 'Chardonnay',
      abv: 13.5,
      formatCl: 75,
    });
    expect(out.uncertain).toEqual(['vintage', 'abv', 'country']);
    expect(out).not.toHaveProperty('fields.extra');
  });

  it('sortie vide ou non-étiquette', () => {
    const empty = normalizeLabel({}, now);
    expect(empty.isWineLabel).toBe(false);
    expect(Object.values(empty.fields).every((v) => v === null)).toBe(true);
    expect(normalizeLabel({ isWineLabel: false, producer: 'X' }, now).isWineLabel).toBe(false);
    expect(normalizeLabel('garbage', now).fields.producer).toBeNull();
    // Une incertitude sur un champ vide n'a pas de sens.
    expect(normalizeLabel({ producer: 'X', uncertain: ['vintage'] }, now).uncertain).toEqual([]);
  });
});

describe('route /api/ai/label (sans clé Gemini)', () => {
  let server: Server;
  let base = '';
  const key = process.env.GEMINI_API_KEY;
  beforeAll(async () => {
    delete process.env.GEMINI_API_KEY;
    const app = express();
    app.use(express.json({ limit: '30mb' }));
    app.use('/api/ai/label', labelRouter);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai/label`;
  });
  afterAll(async () => {
    if (key !== undefined) process.env.GEMINI_API_KEY = key;
    await new Promise((r) => server.close(r));
  });
  const post = (body: unknown) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('400 + { error } sur entrée invalide', async () => {
    const r = await post({ imageBase64: B64, mimeType: 'application/pdf' });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/Requête invalide/);
  });

  it('503 + message clair sans clé', async () => {
    const r = await post({ imageBase64: B64, mimeType: 'image/png', language: 'fr' });
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/GEMINI_API_KEY/);
  });
});
