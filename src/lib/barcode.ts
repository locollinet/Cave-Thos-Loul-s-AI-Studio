// Codes-barres produits (GTIN) : EAN-13, EAN-8, UPC-A — validation de la clé de contrôle et rapprochement avec les vins.
import type { Wine } from '@/types';

export type BarcodeKind = 'ean13' | 'ean8' | 'upca';

/** Ne garde que les chiffres (espaces, tirets et points tolérés à la saisie). */
export const barcodeDigits = (raw: string): string => (/^[\d\s.-]+$/.test(raw.trim()) ? raw.replace(/\D/g, '') : '');

/** Clé de contrôle GS1 (modulo 10, pondération 3/1 depuis la droite) pour le corps du code. */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = body.charCodeAt(body.length - 1 - i) - 48;
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

const checksumOk = (digits: string): boolean => gtinCheckDigit(digits.slice(0, -1)) === Number(digits[digits.length - 1]);

/** Type de code reconnu (longueur + clé valides), sinon `null`. Un GTIN-14 préfixé de 0 est traité comme un EAN-13. */
export function barcodeKind(raw: string): BarcodeKind | null {
  let d = barcodeDigits(raw);
  if (d.length === 14 && d[0] === '0') d = d.slice(1);
  if (![8, 12, 13].includes(d.length) || !checksumOk(d)) return null;
  return d.length === 8 ? 'ean8' : d.length === 12 ? 'upca' : 'ean13';
}

export const isValidBarcode = (raw: string): boolean => barcodeKind(raw) !== null;

/**
 * Forme canonique enregistrée sur le vin : EAN-13 (un UPC-A reçoit le 0 de tête), EAN-8 inchangé.
 * Renvoie `null` si le code n'est pas un GTIN valide.
 */
export function normalizeBarcode(raw: string): string | null {
  const kind = barcodeKind(raw);
  if (!kind) return null;
  const d = barcodeDigits(raw).replace(/^0(?=\d{13}$)/, '');
  return kind === 'upca' ? `0${d}` : d;
}

/** Clé de comparaison : GTIN valide complété à 14 chiffres (UPC-A ≡ EAN-13 avec 0 de tête), sinon le code brut. */
export function barcodeKey(raw: string | undefined | null): string {
  if (!raw) return '';
  const n = normalizeBarcode(raw);
  return n ? n.padStart(14, '0') : raw.trim().replace(/\s+/g, '').toUpperCase();
}

export const sameBarcode = (a: string | undefined | null, b: string | undefined | null): boolean => {
  const ka = barcodeKey(a);
  return !!ka && ka === barcodeKey(b);
};

/** Vin correspondant au code scanné (les vins actifs sont prioritaires sur les archivés). */
export function findWineByBarcode<W extends Pick<Wine, 'ean' | 'isArchived'>>(wines: readonly W[], raw: string): W | undefined {
  const key = barcodeKey(raw);
  if (!key) return undefined;
  let archived: W | undefined;
  for (const w of wines) {
    if (!w.ean || barcodeKey(w.ean) !== key) continue;
    if (!w.isArchived) return w;
    archived ??= w;
  }
  return archived;
}
