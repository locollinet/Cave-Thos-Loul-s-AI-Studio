// Serveur Express : sert l'app (Vite en dev, dist en prod) et expose les routes IA (Gemini côté serveur).
process.env.DISABLE_HMR ??= 'true';

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { aiRouter } from './server/ai';
import { labelRouter } from './server/aiLabel';
import { translateRouter } from './server/aiTranslate';
import { posRouter } from './server/pos';
import { firebaseCfg, requireUser } from './server/auth';
import { securityHeaders } from './server/security';

dotenv.config();

// Seuls l'import de facture et la lecture d'étiquette transportent des fichiers.
const LARGE_BODY_ROUTES = new Set(['/api/ai/parse-invoice', '/api/ai/label']);

async function start() {
  const app = express();
  const PORT = Number(process.env.PORT ?? 3000);
  const production = process.env.NODE_ENV === 'production';

  app.disable('x-powered-by');
  // Derrière le proxy de Cloud Run : l'IP cliente est celle ajoutée par le proxy, pas celle fournie par le client.
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  app.use(securityHeaders(production, firebaseCfg().authDomain));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', ai: !!process.env.GEMINI_API_KEY }));
  // Authentification et quotas IA avant toute lecture du corps de la requête.
  app.use('/api/ai', requireUser);
  const smallJson = express.json({ limit: '1mb' });
  const largeJson = express.json({ limit: '30mb' });
  app.use('/api', (req, res, next) => (LARGE_BODY_ROUTES.has(req.originalUrl.split('?')[0]) ? largeJson : smallJson)(req, res, next));
  app.use('/api/pos', posRouter);
  app.use('/api/ai/label', labelRouter);
  app.use('/api/ai/translate', translateRouter);
  app.use('/api/ai', aiRouter);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(process.cwd(), 'dist');
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => console.log(`Loul's & Thos → http://localhost:${PORT}`));
}

start();
