import type { Locale, TechnicalSheet, Wine } from '@/types';
import { apiPost } from '@/lib/api';
import { getFirebaseAuth, isFirebaseConfigured } from '@/data/firebase';
import type { PublicItem, SommelierAnswer } from './types';
import type { ContentLang } from './content';

export class AiQuotaError extends Error {}
/** Service d'IA non configuré ou injoignable (clé absente, route indisponible). */
export class AiUnavailableError extends Error {}

const MAX_ITEMS = 150;

type SommelierContext = 'guest' | 'pro';

/** Conseil du sommelier ; côté public, appel sans jeton rattaché à la carte publiée (quota par carte). */
export async function askSommelier(items: PublicItem[], question: string, language: Locale, context: SommelierContext, publicId?: string): Promise<SommelierAnswer> {
  const body = { items: items.slice(0, MAX_ITEMS), question, language, context };
  if (context === 'pro') return apiPost<SommelierAnswer>('/api/ai/sommelier', body);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (publicId) headers['X-Public-List-Id'] = publicId;
  const r = await fetch('/api/ai/sommelier', { method: 'POST', headers, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as Partial<SommelierAnswer> & { error?: string };
  if (r.status === 429) throw new AiQuotaError(j.error);
  if (!r.ok) throw new Error(j.error ?? `Erreur ${r.status}`);
  return { picks: j.picks ?? [], text: j.text ?? '' };
}

export async function generateTechSheet(wine: Wine, language: Locale): Promise<TechnicalSheet> {
  const r = await apiPost<Record<string, string>>('/api/ai/tech-sheet', {
    producer: wine.producer,
    name: wine.name,
    appellation: wine.appellation,
    cuvee: wine.cuvee,
    vintage: wine.vintage,
    color: wine.color,
    region: wine.region,
    country: wine.country,
    grapes: wine.grapes,
    formatCl: wine.formatCl,
    language,
  });
  const sheet: TechnicalSheet = {
    generatedByAI: true,
    sources: r.sources,
    confidence: (r.confidence as TechnicalSheet['confidence']) || 'medium',
    missingInfo: r.missingInfo,
  };
  for (const [k, v] of Object.entries(r)) {
    if (k !== 'sources' && k !== 'confidence' && k !== 'missingInfo' && typeof v === 'string' && v.trim()) {
      (sheet as Record<string, unknown>)[k] = v.trim();
    }
  }
  return sheet;
}

export interface BatchItemProgress {
  wine: Wine;
  status: 'pending' | 'processing' | 'done' | 'error';
  sheet?: TechnicalSheet;
  error?: string;
}

/** Génération par lot avec concurrence contrôlée (2 simultanés max) et rappel d'avancement */
export async function generateBatchTechSheets(
  wines: Wine[],
  language: Locale,
  onProgress?: (progress: Map<string, BatchItemProgress>) => void,
  concurrency = 2,
): Promise<Map<string, TechnicalSheet>> {
  const state = new Map<string, BatchItemProgress>();
  for (const w of wines) {
    state.set(w.id, { wine: w, status: 'pending' });
  }
  onProgress?.(new Map(state));

  const results = new Map<string, TechnicalSheet>();
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < wines.length) {
      const idx = cursor++;
      const wine = wines[idx];
      state.set(wine.id, { wine, status: 'processing' });
      onProgress?.(new Map(state));

      try {
        const sheet = await generateTechSheet(wine, language);
        results.set(wine.id, sheet);
        state.set(wine.id, { wine, status: 'done', sheet });
      } catch (e) {
        state.set(wine.id, { wine, status: 'error', error: e instanceof Error ? e.message : 'Erreur' });
      }
      onProgress?.(new Map(state));
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, wines.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

const TRANSLATE_BATCH = 200;

async function postTranslate(body: unknown): Promise<{ key?: unknown; text?: unknown }[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isFirebaseConfigured()) {
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let r: Response;
  try {
    r = await fetch('/api/ai/translate', { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (e) {
    throw new AiUnavailableError(e instanceof Error ? e.message : '');
  }
  const j = (await r.json().catch(() => ({}))) as { translations?: { key?: unknown; text?: unknown }[]; error?: string };
  if (r.status === 429) throw new AiQuotaError(j.error);
  if (r.status === 404 || r.status === 502 || r.status === 503) throw new AiUnavailableError(j.error);
  if (!r.ok) throw new Error(j.error ?? `Erreur ${r.status}`);
  return j.translations ?? [];
}

/** Traduit des textes libres par lots de 200 ; renvoie les paires clé → traduction reçues. */
export async function translateTexts(target: ContentLang, source: Locale, texts: { key: string; text: string }[]): Promise<{ key: string; text: string }[]> {
  const out: { key: string; text: string }[] = [];
  for (let i = 0; i < texts.length; i += TRANSLATE_BATCH) {
    const rows = await postTranslate({ target, source, texts: texts.slice(i, i + TRANSLATE_BATCH) });
    for (const t of rows) if (typeof t.key === 'string' && typeof t.text === 'string') out.push({ key: t.key, text: t.text });
  }
  return out;
}
