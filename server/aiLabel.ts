import { Router, type Request, type Response } from 'express';
import { requireUser } from './auth';
import { AiError, generateJson } from './gemini';
import { InputError } from './aiInput';
import { labelSchema, labelSystem, normalizeLabel, parseLabelInput } from './labelInput';

/** Lecture d'étiquette (photo) → champs de la fiche vin. */
export const labelRouter = Router();
labelRouter.use(requireUser);

const fail = (res: Response, e: unknown) => {
  if (e instanceof InputError) return res.status(400).json({ error: `Requête invalide : ${e.message}` });
  if (e instanceof AiError) return res.status(e.status).json({ error: e.message });
  console.warn('[ai] lecture étiquette : erreur inattendue', (e as Error)?.name);
  return res.status(500).json({ error: 'Erreur interne du service IA' });
};

labelRouter.post('/', async (req: Request, res: Response) => {
  try {
    const input = parseLabelInput(req.body);
    const raw = await generateJson<unknown>({
      system: labelSystem(input.language),
      parts: [{ inlineData: { data: input.base64, mimeType: input.mimeType } }, { text: "Lis cette étiquette et renvoie uniquement ce qui y figure." }],
      schema: labelSchema,
      temperature: 0,
    });
    res.json(normalizeLabel(raw));
  } catch (e) {
    fail(res, e);
  }
});
