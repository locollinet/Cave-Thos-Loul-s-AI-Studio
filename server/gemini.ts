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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiError(503, 'GEMINI_API_KEY manquante côté serveur');
  const ai = new GoogleGenAI({ apiKey });
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
          temperature,
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
