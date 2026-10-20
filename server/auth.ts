import type { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

interface FirebaseCfg {
  apiKey?: string;
  projectId?: string;
}

function readConfig(): FirebaseCfg {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
  } catch {
    return {};
  }
}

const cfg = readConfig();
const firebaseConfigured = !!cfg.apiKey && !cfg.apiKey.includes('PLACEHOLDER');

const hits = new Map<string, number[]>();

/** Limiteur par clé (org, carte, uid ou IP) : `max` appels par fenêtre glissante d'1 heure. */
function limited(key: string, max: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < 3_600_000);
  if (arr.length >= max) {
    hits.set(key, arr);
    return true;
  }
  arr.push(now);
  hits.set(key, arr);
  return false;
}

async function verifyIdToken(token: string): Promise<string | null> {
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${cfg.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { users?: { localId: string }[] };
    return j.users?.[0]?.localId ?? null;
  } catch {
    return null;
  }
}

/**
 * Protège les routes IA et applique les quotas :
 * - Organisation cliente (avec jeton Firebase et orgId) : 500 requêtes / heure.
 * - Carte publique (sommelier anonyme avec en-tête ou query x-public-list-id) : 30 requêtes / heure par carte.
 * - Mode démo (sans jeton) : 30 requêtes / heure par organisation ou IP.
 */
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip ?? 'ip';
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const orgId = (req.headers['x-org-id'] as string) || (req.body && (req.body as { orgId?: string }).orgId) || '';
  const publicListId = (req.headers['x-public-list-id'] as string) || (req.body && (req.body as { publicListId?: string }).publicListId) || '';

  // Cas 1 : consultation publique de carte (ex. sommelier client sur table via QR)
  if (publicListId) {
    if (limited(`pubcard:${publicListId}`, 40)) {
      return res.status(429).json({ error: 'La limite de questions pour cette carte des vins a été atteinte pour cette heure (40/h). Veuillez réessayer un peu plus tard.' });
    }
    return next();
  }

  // Cas 2 : utilisateur authentifié avec Firebase
  if (token && firebaseConfigured) {
    const uid = await verifyIdToken(token);
    if (!uid) return res.status(401).json({ error: 'Jeton d’authentification invalide ou expiré.' });
    (req as Request & { uid?: string }).uid = uid;

    // Quota par organisation si précisé, sinon par utilisateur
    if (orgId) {
      if (limited(`org:${orgId}`, 500)) {
        return res.status(429).json({ error: `Le quota IA mensuel/horaire de votre organisation est atteint. Contactez votre gestionnaire.` });
      }
    } else {
      if (limited(`u:${uid}`, 200)) {
        return res.status(429).json({ error: 'Limite d’appels IA atteinte pour votre compte utilisateur (200/h).' });
      }
    }
    return next();
  }

  // Cas 3 : Mode démo sans Firebase configuré
  const demoKey = orgId ? `demo-org:${orgId}` : `demo-ip:${ip}`;
  if (limited(demoKey, 30)) {
    return res.status(429).json({ error: 'Limite du mode démo atteinte (30 requêtes / heure). Connectez-vous avec un compte pour poursuivre.' });
  }
  next();
}
