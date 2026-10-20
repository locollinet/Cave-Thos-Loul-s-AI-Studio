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

/** Conseil du sommelier ; côté public, appel sans jeton (la route applique son propre quota). */
export async function askSommelier(items: PublicItem[], question: string, language: Locale, context: SommelierContext): Promise<SommelierAnswer> {
  const body = { items: items.slice(0, MAX_ITEMS), question, language, context };
  if (context === 'pro') return apiPost<SommelierAnswer>('/api/ai/sommelier', body);
  const r = await fetch('/api/ai/sommelier', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
  const sheet: TechnicalSheet = { generatedByAI: true };
  for (const [k, v] of Object.entries(r)) if (typeof v === 'string' && v.trim()) (sheet as Record<string, unknown>)[k] = v.trim();
  return sheet;
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
