// Serveur Express : sert l'app (Vite en dev, dist en prod) et expose les routes IA (Gemini côté serveur).
process.env.DISABLE_HMR ??= 'true';

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { aiRouter } from './server/ai';
import { labelRouter } from './server/aiLabel';
import { translateRouter } from './server/aiTranslate';

dotenv.config();

async function start() {
  const app = express();
  const PORT = Number(process.env.PORT ?? 3000);

  app.use(express.json({ limit: '30mb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', ai: !!process.env.GEMINI_API_KEY }));
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
