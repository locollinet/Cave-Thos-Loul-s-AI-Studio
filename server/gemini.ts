import { GoogleGenAI, type Part, type Schema } from '@google/genai';

export class AiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 55_000;

export const modelList = (): string[] =>
  [process.env.GEMINI_MODEL, 'gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'].filter((m): m is string => !!m && m.trim() !== '');

export const assistantModelList = (): string[] =>
  [process.env.GEMINI_ASSISTANT_MODEL, process.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-3.1-flash-lite'].filter(
    (m): m is string => !!m && m.trim() !== '',
  );

let customClientFactory: (() => GoogleGenAI) | null = null;

/** Permet aux tests d'injecter un client Gemini simulé sans appel réseau. */
export function setAiClientFactory(factory: (() => GoogleGenAI) | null): void {
  customClientFactory = factory;
}

/**
 * Retourne le client `@google/genai` configuré selon `AI_BACKEND` :
 * - `gemini` (défaut) : utilise `GEMINI_API_KEY` (Google AI Studio / Gemini Developer API)
 * - `vertex` : utilise Vertex AI Europe (`GOOGLE_CLOUD_PROJECT` / `VERTEX_PROJECT`, `GOOGLE_CLOUD_LOCATION` défaut `europe-west1`)
 */
export function getAiClient(): GoogleGenAI {
  if (customClientFactory) return customClientFactory();
  const backend = (process.env.AI_BACKEND ?? 'gemini').toLowerCase();
  if (backend === 'vertex') {
    const project = process.env.VERTEX_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.VERTEX_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'europe-west1';
    if (!project) throw new AiError(503, 'VERTEX_PROJECT ou GOOGLE_CLOUD_PROJECT manquant pour AI_BACKEND=vertex');
    return new GoogleGenAI({ vertexai: true, project, location });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiError(503, 'GEMINI_API_KEY manquante côté serveur');
  return new GoogleGenAI({ apiKey });
}

export const isGemini3Model = (model: string): boolean => model.startsWith('gemini-3') || model === 'gemini-flash-latest';

export function isAiConfigured(): boolean {
  const backend = (process.env.AI_BACKEND ?? 'gemini').toLowerCase();
  if (backend === 'vertex') return !!(process.env.VERTEX_PROJECT || process.env.GOOGLE_CLOUD_PROJECT);
  return !!process.env.GEMINI_API_KEY;
}

const errStatus = (e: unknown): number => {
  const s = (e as { status?: unknown; code?: unknown })?.status ?? (e as { code?: unknown })?.code;
  return typeof s === 'number' ? s : 0;
};

interface GenerateArgs {
  system: string;
  parts: Part[];
  schema: Schema;
  temperature?: number;
}

/** Appelle Gemini avec repli sur la liste de modèles ; renvoie le JSON structuré. Ne journalise jamais de contenu. */
export async function generateJson<T>({ system, parts, schema, temperature = 0.2 }: GenerateArgs): Promise<T> {
  const ai = getAiClient();
  let lastStatus = 0;
  const startTotal = Date.now();
  for (const model of modelList()) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const startCall = Date.now();
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: system,
          responseMimeType: 'application/json',
          responseSchema: schema,
          // Les paramètres d'échantillonnage (temperature) ne sont plus recommandés sur Gemini 3.x
          ...(isGemini3Model(model) ? {} : { temperature }),
          abortSignal: ctrl.signal,
        },
      });
      const text = res.text;
      if (!text) throw new Error('empty');
      const durationMs = Date.now() - startCall;
      console.log(`[ai:usage] modèle=${model} durée=${durationMs}ms succès=true`);
      return JSON.parse(text) as T;
    } catch (e) {
      lastStatus = errStatus(e) || lastStatus;
      const durationMs = Date.now() - startCall;
      console.warn(`[ai:usage] modèle=${model} échec durée=${durationMs}ms code=${errStatus(e) || (e as Error).name}`);
    } finally {
      clearTimeout(timer);
    }
  }
  const totalDuration = Date.now() - startTotal;
  console.warn(`[ai:usage] tous les modèles ont échoué, durée totale=${totalDuration}ms`);
  if (lastStatus === 429) throw new AiError(429, 'Quota IA momentanément dépassé, réessayez dans quelques instants.');
  throw new AiError(502, "Le service d'IA n'a pas pu répondre. Réessayez dans un instant.");
}
