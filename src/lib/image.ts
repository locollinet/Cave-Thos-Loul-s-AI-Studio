import type { Op } from '@/data/store';

/** Photo de vin stockée à part du catalogue : orgs/{orgId}/wineImages/{wineId}. */
export interface WineImageDoc {
  wineId: string;
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  source: 'camera' | 'upload' | 'label';
  updatedAt: number;
  updatedBy?: string;
}

export const PHOTO_MAX_EDGE = 900;
/** Limite d'une photo stockée (data URL complète), sous le plafond des règles Firestore (350 000). */
export const PHOTO_MAX_CHARS = 300_000;
/** En mode démo (localStorage ≈ 5 Mo partagés), on vise plus léger. */
export const PHOTO_MAX_CHARS_LOCAL = 150_000;
/** Version envoyée à l'IA pour lire l'étiquette : plus grande, pour les petites mentions (degré, contenance). */
export const LABEL_MAX_EDGE = 1600;
export const LABEL_MAX_CHARS = 2_500_000;

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'image/avif'];

export class ImageError extends Error {
  constructor(public code: 'not-image' | 'decode' | 'too-large') {
    super(code);
  }
}

/** Accepte un fichier image (type MIME, ou extension quand le navigateur ne renseigne pas le type — HEIC sur certains systèmes). */
export function isImageType(type: string | undefined, name = ''): boolean {
  const t = (type ?? '').toLowerCase();
  if (t) return t.startsWith('image/') && t !== 'image/svg+xml';
  return /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i.test(name);
}

/** Dimensions ramenées dans un carré max × max, proportions conservées, sans agrandir. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const k = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** Sépare une data URL base64 en type MIME + contenu. */
export function splitDataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const m = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,(.*)$/i.exec(dataUrl);
  return m ? { mimeType: m[1].toLowerCase(), base64: m[2] } : null;
}

/** Poids décodé (octets) d'une chaîne base64. */
export function base64Bytes(base64: string): number {
  const pad = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - pad);
}

export const fitsLimit = (dataUrl: string, maxChars: number): boolean => dataUrl.length <= maxChars;

/** Qualités essayées successivement ; puis on réduit la taille d'un facteur 0,8 et on recommence. */
export const QUALITY_STEPS = [0.86, 0.78, 0.7, 0.62, 0.54, 0.46];
const MIN_EDGE = 240;

/**
 * Cherche le meilleur encodage sous la limite : qualité décroissante, puis échelle décroissante.
 * `encode(width, height, quality)` produit une data URL (canvas dans le navigateur, factice dans les tests).
 */
export function encodeUnderLimit(
  encode: (width: number, height: number, quality: number) => string,
  width: number,
  height: number,
  maxChars: number,
): { dataUrl: string; width: number; height: number; quality: number } {
  let w = width;
  let h = height;
  for (;;) {
    for (const q of QUALITY_STEPS) {
      const dataUrl = encode(w, h, q);
      if (fitsLimit(dataUrl, maxChars)) return { dataUrl, width: w, height: h, quality: q };
    }
    if (Math.max(w, h) * 0.8 < MIN_EDGE) throw new ImageError('too-large');
    w = Math.max(1, Math.round(w * 0.8));
    h = Math.max(1, Math.round(h * 0.8));
  }
}

/* ------------------------------------------------------------------ Navigateur */

type Source = { el: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: Blob): Promise<Source> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { el: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* repli <img> (ex. Safari ancien, HEIC décodable seulement par <img>) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    // Les navigateurs récents appliquent l'orientation EXIF aux <img> (image-orientation: from-image par défaut).
    return { el: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new ImageError('decode');
  }
}

let webpOk: boolean | null = null;
const supportsWebp = (): boolean => {
  if (webpOk === null) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    webpOk = c.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpOk;
};

export interface CompressedImage {
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
}

function encodeSource(src: Source, maxEdge: number, maxChars: number): CompressedImage {
  const mimeType = supportsWebp() ? 'image/webp' : 'image/jpeg';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('decode');
  const start = fitWithin(src.width, src.height, maxEdge);
  if (!start.width) throw new ImageError('decode');
  const out = encodeUnderLimit(
    (w, h, q) => {
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.fillStyle = '#ffffff'; // JPEG n'a pas de transparence
      ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src.el, 0, 0, w, h);
      return canvas.toDataURL(mimeType, q);
    },
    start.width,
    start.height,
    maxChars,
  );
  canvas.width = canvas.height = 0;
  return { dataUrl: out.dataUrl, mimeType, width: out.width, height: out.height };
}

/** Redimensionne et compresse une photo (WebP, sinon JPEG) sous `maxChars` caractères de data URL. */
export async function compressImage(file: File, opts: { maxEdge?: number; maxChars?: number } = {}): Promise<CompressedImage> {
  return (await compressImageVariants(file, [opts]))[0];
}

/** Décode une seule fois et produit plusieurs variantes (ex. photo stockée + version pour l'IA). */
export async function compressImageVariants(file: File, variants: { maxEdge?: number; maxChars?: number }[]): Promise<CompressedImage[]> {
  if (!isImageType(file.type, file.name)) throw new ImageError('not-image');
  const src = await decode(file);
  try {
    return variants.map((v) => encodeSource(src, v.maxEdge ?? PHOTO_MAX_EDGE, v.maxChars ?? PHOTO_MAX_CHARS));
  } finally {
    src.close();
  }
}

/* ------------------------------------------------------------------ Écritures */

/** Enregistre la photo et marque le vin `hasImage` dans un même commit. */
export function wineImageSetOps(path: (c: string, id?: string) => string, wineId: string, img: Omit<WineImageDoc, 'wineId' | 'updatedAt'>, now = Date.now()): Op[] {
  const doc: WineImageDoc = { ...img, wineId, updatedAt: now };
  return [
    { op: 'set', path: path('wineImages', wineId), data: JSON.parse(JSON.stringify(doc)) },
    { op: 'set', path: path('wines', wineId), data: { hasImage: true, updatedAt: now }, merge: true },
  ];
}

/** Supprime la photo et retire le marqueur `hasImage`. */
export function wineImageDeleteOps(path: (c: string, id?: string) => string, wineId: string, now = Date.now()): Op[] {
  return [
    { op: 'delete', path: path('wineImages', wineId) },
    { op: 'set', path: path('wines', wineId), data: { hasImage: false, updatedAt: now }, merge: true },
  ];
}
