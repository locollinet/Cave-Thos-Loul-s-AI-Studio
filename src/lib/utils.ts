export const uid = (): string =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 20)
    : Math.random().toString(36).slice(2, 12) + Date.now().toString(36));

export const today = (): string => new Date().toISOString().slice(0, 10);

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const eur = (n: number | undefined | null, currency = 'EUR', locale = 'fr-FR'): string =>
  new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n ?? 0);

export const num = (n: number | undefined | null, locale = 'fr-FR'): string =>
  new Intl.NumberFormat(locale).format(n ?? 0);

export const pct = (n: number | undefined | null, digits = 1): string =>
  `${(n ?? 0).toFixed(digits).replace('.', ',')} %`;

export const dateFr = (iso: string | number | undefined, locale = 'fr-FR'): string => {
  if (!iso) return '';
  const d = typeof iso === 'number' ? new Date(iso) : new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
};

export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/** TTC -> HT */
export const htFromTtc = (ttc: number, vatPct: number): number => ttc / (1 + vatPct / 100);
/** HT -> TTC */
export const ttcFromHt = (ht: number, vatPct: number): number => ht * (1 + vatPct / 100);

/** Prix de vente HT : surcharge de la fiche > coefficient producteur > coefficient d'organisation. */
export const sellPriceFromCost = (cost: number, coefficient: number): number => round2(cost * coefficient);

export function downloadBlob(filename: string, content: BlobPart, type = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows: (string | number | undefined | null)[][], sep = ';'): string {
  const esc = (v: string | number | undefined | null) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + rows.map((r) => r.map(esc).join(sep)).join('\r\n');
}

/** Parse un CSV simple (guillemets, séparateur ; , ou tab détecté). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const first = clean.split(/\r?\n/)[0] ?? '';
  const sep = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (q) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      cur.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      cur.push(cell);
      cell = '';
      if (cur.some((x) => x.trim() !== '')) rows.push(cur);
      cur = [];
    } else cell += c;
  }
  cur.push(cell);
  if (cur.some((x) => x.trim() !== '')) rows.push(cur);
  return rows;
}

export const toNumber = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(String(v).replace(/\s/g, '').replace('€', '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};
