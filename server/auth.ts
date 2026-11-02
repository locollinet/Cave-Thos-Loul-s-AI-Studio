import type { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

interface FirebaseCfg {
  apiKey?: string;
  projectId?: string;
  authDomain?: string;
  firestoreDatabaseId?: string;
}

function readConfig(): FirebaseCfg {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
  } catch {
    return {};
  }
}

let cfg: FirebaseCfg = readConfig();
const isSet = (v?: string) => !!v && !v.includes('PLACEHOLDER');
const firebaseConfigured = () => isSet(cfg.apiKey) && isSet(cfg.projectId);

export const firebaseCfg = (): FirebaseCfg => cfg;

/** Remplace la configuration lue dans firebase-applet-config.json (tests). */
export function setFirebaseConfig(next: FirebaseCfg): void {
  cfg = next;
  listCache.clear();
}

/* ------------------------------------------------------------------ quotas */

const HOUR = 3_600_000;
export const QUOTAS = {
  user: 300, // par compte authentifié
  org: 500, // par organisation déclarée (en plus du quota du compte)
  publicList: 40, // par carte publique
  publicIp: 20, // par IP sur le sommelier public
  demoIp: 30, // par IP sans compte (mode démo)
  anonymous: 600, // plafond global sans compte, toutes IP confondues (AI_ANON_PER_HOUR)
};

const anonymousCap = () => Number(process.env.AI_ANON_PER_HOUR) || QUOTAS.anonymous;

const hits = new Map<string, number[]>();

/** Fenêtre glissante d'une heure : enregistre l'appel sur toutes les clés si aucune n'a atteint son plafond. */
export function take(rules: [key: string, max: number][], now = Date.now()): boolean {
  if (hits.size > 20_000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] >= HOUR) hits.delete(k);
  const windows = rules.map(([k]) => (hits.get(k) ?? []).filter((t) => now - t < HOUR));
  const ok = rules.every(([, max], i) => windows[i].length < max);
  rules.forEach(([k], i) => {
    if (ok) windows[i].push(now);
    hits.set(k, windows[i]);
  });
  return ok;
}

export const resetQuotas = () => hits.clear();

/* ------------------------------------------------------------------ jetons Firebase (vérification locale de la signature) */

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
type Jwks = { keys: (crypto.JsonWebKey & { kid?: string })[]; maxAgeMs: number };

let fetchJwks = async (): Promise<Jwks> => {
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new Error(`JWKS ${r.status}`);
  const maxAge = Number(/max-age=(\d+)/.exec(r.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  return { keys: ((await r.json()) as Jwks).keys, maxAgeMs: maxAge * 1000 };
};

let keyCache: { at: number; ttl: number; byKid: Map<string, crypto.KeyObject> } | null = null;
let lastRefresh = 0;

/** Remplace la source des clés publiques (tests). */
export function setJwksSource(f: () => Promise<Jwks>): void {
  fetchJwks = f;
  keyCache = null;
  lastRefresh = 0;
}

async function publicKey(kid: string, now: number): Promise<crypto.KeyObject | undefined> {
  const stale = !keyCache || now - keyCache.at > keyCache.ttl;
  // Clé inconnue : rotation possible, mais au plus un rafraîchissement par minute.
  if (stale || (!keyCache!.byKid.has(kid) && now - lastRefresh > 60_000)) {
    lastRefresh = now;
    const jwks = await fetchJwks();
    const byKid = new Map<string, crypto.KeyObject>();
    for (const k of jwks.keys) if (k.kid) byKid.set(k.kid, crypto.createPublicKey({ key: k, format: 'jwk' }));
    keyCache = { at: now, ttl: jwks.maxAgeMs, byKid };
  }
  return keyCache?.byKid.get(kid);
}

export interface VerifiedUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
}

/** Vérifie un jeton d'identité Firebase (RS256, émetteur, audience, dates) sans appel réseau par requête. */
export async function verifyIdToken(token: string, projectId = cfg.projectId ?? '', now = Date.now()): Promise<VerifiedUser | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || !isSet(projectId)) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
    const key = await publicKey(header.kid, now);
    if (!key) return null;
    if (!crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'))) return null;
    const sec = now / 1000;
    if (p.aud !== projectId || p.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (typeof p.sub !== 'string' || !p.sub || p.sub.length > 128) return null;
    if (typeof p.exp !== 'number' || p.exp <= sec) return null;
    if (typeof p.iat !== 'number' || p.iat > sec + 300) return null;
    return { uid: p.sub, email: typeof p.email === 'string' ? p.email : undefined, emailVerified: p.email_verified === true };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ cartes publiques */

const PUBLIC_ID = /^[A-Za-z0-9_-]{16,64}$/;
const listCache = new Map<string, { ok: boolean; at: number }>();

// Lecture REST autorisée par les règles (get public sur public_lists) : aucun secret serveur requis.
let fetchPublicList = async (id: string): Promise<boolean> => {
  const db = encodeURIComponent(cfg.firestoreDatabaseId || '(default)');
  const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${db}/documents/public_lists/${id}?mask.fieldPaths=publicId&key=${cfg.apiKey}`;
  const r = await fetch(url);
  return r.ok;
};

export function setPublicListSource(f: (id: string) => Promise<boolean>): void {
  fetchPublicList = f;
  listCache.clear();
}

export async function publicListExists(id: string, now = Date.now()): Promise<boolean> {
  if (!PUBLIC_ID.test(id)) return false;
  const c = listCache.get(id);
  if (c && now - c.at < (c.ok ? 10 * 60_000 : 60_000)) return c.ok;
  let ok = false;
  try {
    ok = await fetchPublicList(id);
  } catch {
    ok = false;
  }
  if (listCache.size > 5_000) listCache.clear();
  listCache.set(id, { ok, at: now });
  return ok;
}

/* ------------------------------------------------------------------ middleware */

const headerStr = (req: Request, name: string, max: number): string => {
  const v = req.headers[name];
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' ? s.trim().slice(0, max) : '';
};

const PUBLIC_ROUTES = new Set(['/api/ai/sommelier']);

/**
 * Protège les routes IA (à monter avant le parseur JSON : seuls les en-têtes sont lus).
 * - Compte Firebase (jeton vérifié) : quota par compte et par organisation déclarée.
 * - Carte publique (en-tête X-Public-List-Id) : sommelier uniquement, carte existante, quotas par carte et par IP.
 * - Sans compte (mode démo) : quota par IP et plafond global ; désactivable en production avec DEMO_AI=off.
 */
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  if (res.locals.aiAccess) return next();
  const ip = req.ip ?? 'unknown';
  const auth = headerStr(req, 'authorization', 4096);
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const orgId = headerStr(req, 'x-org-id', 160);
  const publicListId = headerStr(req, 'x-public-list-id', 64);
  const route = `${req.baseUrl}${req.path}`.replace(/\/+$/, '');

  if (token && firebaseConfigured()) {
    const user = await verifyIdToken(token);
    if (!user) return res.status(401).json({ error: 'Session expirée ou invalide : reconnectez-vous.' });
    const rules: [string, number][] = [[`u:${user.uid}`, QUOTAS.user]];
    if (orgId) rules.push([`org:${orgId}`, QUOTAS.org]);
    if (!take(rules)) return res.status(429).json({ error: 'Quota IA horaire atteint pour votre compte ou votre organisation. Réessayez un peu plus tard.' });
    res.locals.aiAccess = { kind: 'user', uid: user.uid };
    return next();
  }

  if (publicListId) {
    if (!PUBLIC_ROUTES.has(route)) return res.status(403).json({ error: 'Accès public limité au sommelier de la carte des vins.' });
    if (!take([[`pub-ip:${ip}`, QUOTAS.publicIp]])) return res.status(429).json({ error: 'Trop de questions depuis cet appareil. Réessayez un peu plus tard.' });
    if (firebaseConfigured() && !(await publicListExists(publicListId))) return res.status(404).json({ error: 'Carte des vins introuvable.' });
    if (!take([[`pub:${publicListId}`, QUOTAS.publicList], ['anonymous', anonymousCap()]])) {
      return res.status(429).json({ error: 'La limite de questions pour cette carte des vins est atteinte pour cette heure. Réessayez un peu plus tard.' });
    }
    res.locals.aiAccess = { kind: 'public', listId: publicListId };
    return next();
  }

  if (firebaseConfigured() && process.env.DEMO_AI === 'off') return res.status(401).json({ error: 'Connexion requise pour utiliser l’assistant IA.' });
  if (!take([[`demo-ip:${ip}`, QUOTAS.demoIp], ['anonymous', anonymousCap()]])) {
    return res.status(429).json({ error: `Limite du mode démo atteinte (${QUOTAS.demoIp} requêtes par heure). Créez un compte pour continuer.` });
  }
  res.locals.aiAccess = { kind: 'demo' };
  next();
}
