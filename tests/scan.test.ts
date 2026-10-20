import { describe, expect, it } from 'vitest';
import { barcodeKey, barcodeKind, findWineByBarcode, gtinCheckDigit, isValidBarcode, normalizeBarcode, sameBarcode } from '@/lib/barcode';
import { SAME_CODE_DEBOUNCE_MS } from '@/components/Scanner';

describe('GTIN check digit', () => {
  it('computes the GS1 mod-10 key', () => {
    expect(gtinCheckDigit('400638133393')).toBe(1); // EAN-13 4006381333931
    expect(gtinCheckDigit('9638507')).toBe(4); // EAN-8 96385074
    expect(gtinCheckDigit('03600029145')).toBe(2); // UPC-A 036000291452
    expect(gtinCheckDigit('300000000000')).toBe(7);
  });

  it('recognises EAN-13, EAN-8 and UPC-A only when the key matches', () => {
    expect(barcodeKind('4006381333931')).toBe('ean13');
    expect(barcodeKind('96385074')).toBe('ean8');
    expect(barcodeKind('036000291452')).toBe('upca');
    expect(barcodeKind('4006381333932')).toBeNull();
    expect(barcodeKind('96385075')).toBeNull();
    expect(barcodeKind('12345')).toBeNull();
    expect(barcodeKind('')).toBeNull();
    expect(barcodeKind('ABC4006381333931')).toBeNull();
    expect(isValidBarcode(`376000000000${gtinCheckDigit('376000000000')}`)).toBe(true);
  });
});

describe('normalizeBarcode', () => {
  it('keeps EAN-13 and EAN-8, pads UPC-A to EAN-13', () => {
    expect(normalizeBarcode('4006381333931')).toBe('4006381333931');
    expect(normalizeBarcode('96385074')).toBe('96385074');
    expect(normalizeBarcode('036000291452')).toBe('0036000291452');
  });

  it('tolerates spaces, dashes and a GTIN-14 leading zero', () => {
    expect(normalizeBarcode(' 4 006381 333931 ')).toBe('4006381333931');
    expect(normalizeBarcode('4006-3813-33931')).toBe('4006381333931');
    expect(normalizeBarcode('04006381333931')).toBe('4006381333931');
  });

  it('rejects invalid codes', () => {
    expect(normalizeBarcode('4006381333932')).toBeNull();
    expect(normalizeBarcode('40063813339a1')).toBeNull();
    expect(normalizeBarcode('14006381333931')).toBeNull();
  });
});

describe('matching a scan to a wine', () => {
  const wines = [
    { id: 'upc', ean: '036000291452' },
    { id: 'ean', ean: '0036000291469' },
    { id: 'ean8', ean: '96385074' },
    { id: 'old', ean: '4006381333931', isArchived: true },
    { id: 'new', ean: '4006381333931' },
    { id: 'internal', ean: 'cave-12' },
    { id: 'none' },
  ];

  it('treats UPC-A and its EAN-13 form as the same code', () => {
    expect(sameBarcode('036000291452', '0036000291452')).toBe(true);
    expect(sameBarcode('036000291452', '036000291469')).toBe(false);
    expect(barcodeKey('036000291452')).toBe('00036000291452');
    expect(findWineByBarcode(wines, '0036000291452')?.id).toBe('upc');
    expect(findWineByBarcode(wines, '036000291469')?.id).toBe('ean');
    expect(findWineByBarcode(wines, '96385074')?.id).toBe('ean8');
  });

  it('prefers active wines over archived duplicates', () => {
    expect(findWineByBarcode(wines, '4006381333931')?.id).toBe('new');
    expect(findWineByBarcode(wines.filter((w) => w.id !== 'new'), '4006381333931')?.id).toBe('old');
  });

  it('falls back to an exact (case-insensitive) match for internal codes', () => {
    expect(findWineByBarcode(wines, 'CAVE-12')?.id).toBe('internal');
    expect(findWineByBarcode(wines, '1234567890128')).toBeUndefined();
    expect(findWineByBarcode(wines, '')).toBeUndefined();
    expect(sameBarcode('', '')).toBe(false);
  });

  it('debounces identical camera reads for 1.5 s in continuous mode', () => {
    expect(SAME_CODE_DEBOUNCE_MS).toBe(1500);
  });
});
