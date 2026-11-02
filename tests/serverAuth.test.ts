import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'crypto';
import express from 'express';
import type { AddressInfo } from 'net';
import { QUOTAS, requireUser, resetQuotas, setFirebaseConfig, setJwksSource, setPublicListSource, take, verifyIdToken } from '../server/auth';
import { contentSecurityPolicy, securityHeaders } from '../server/security';

const PROJECT = 'cave-test';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: 'jwk' }) as crypto.JsonWebKey), kid: 'k1', alg: 'RS256', use: 'sig' };

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function sign(payload: Record<string, unknown>, opts: { kid?: string; alg?: string; key?: crypto.KeyObject } = {}): string {
  const head = b64({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'k1', typ: 'JWT' });
  const body = b64(payload);
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), opts.key ?? privateKey).toString('base64url');
  return `${head}.${body}.${sig}`;
}
const now = Math.floor(Date.now() / 1000);
const claims = (over: Record<string, unknown> = {}) => ({
  iss: `https://securetoken.google.com/${PROJECT}`,
  aud: PROJECT,
  sub: 'user-1',
  iat: now - 10,
  exp: now + 3600,
  auth_time: now - 10,
  email: 'chef@palace.example',
  email_verified: true,
  ...over,
});

setJwksSource(async () => ({ keys: [jwk], maxAgeMs: 3_600_000 }));

describe('vérification des jetons Firebase', () => {
  it('accepte un jeton signé, émis pour le projet et non expiré', async () => {
    expect(await verifyIdToken(sign(claims()), PROJECT)).toEqual({ uid: 'user-1', email: 'chef@palace.example', emailVerified: true });
  });

  it.each([
    ['audience étrangère', sign(claims({ aud: 'autre-projet' }))],
    ['émetteur étranger', sign(claims({ iss: 'https://securetoken.google.com/autre' }))],
    ['jeton expiré', sign(claims({ exp: now - 1 }))],
    ['émis dans le futur', sign(claims({ iat: now + 3600 }))],
    ['sans sujet', sign(claims({ sub: '' }))],
    ['signé par une autre clé', sign(claims(), { key: other.privateKey })],
    ['clé inconnue', sign(claims(), { kid: 'inconnue' })],
    ['algorithme non RS256', sign(claims(), { alg: 'HS256' })],
    ['jeton mal formé', 'abc.def'],
  ])('refuse : %s', async (_label, token) => {
    expect(await verifyIdToken(token, PROJECT)).toBeNull();
  });

  it('refuse tout jeton tant que le projet Firebase est un placeholder', async () => {
    expect(await verifyIdToken(sign(claims({ aud: 'PLACEHOLDER', iss: 'https://securetoken.google.com/PLACEHOLDER' })), 'PLACEHOLDER')).toBeNull();
  });
});

describe('quotas', () => {
  beforeEach(() => resetQuotas());

  it("n'enregistre l'appel sur aucune clé si l'une d'elles est saturée", () => {
    expect(take([['a', 1]])).toBe(true);
    expect(take([['b', 5], ['a', 1]])).toBe(false);
    expect(take([['b', 1]])).toBe(true);
  });
});

/* ------------------------------------------------------------------ middleware */

function makeApp() {
  const app = express();
  app.use('/api/ai', requireUser);
  app.use(express.json());
  app.post('/api/ai/sommelier', (_req, res) => res.json({ ok: true, access: res.locals.aiAccess }));
  app.post('/api/ai/parse-invoice', (_req, res) => res.json({ ok: true, access: res.locals.aiAccess }));
  return app;
}

const servers: { close: () => void }[] = [];
async function client(app: express.Express) {
  const server = await new Promise<ReturnType<express.Express['listen']>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return (path: string, headers: Record<string, string> = {}) =>
    fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: '{}' });
}
afterAll(() => servers.forEach((s) => s.close()));

describe('accès aux routes IA (Firebase configuré)', () => {
  beforeEach(() => {
    resetQuotas();
    setFirebaseConfig({ apiKey: 'test-key', projectId: PROJECT });
    setPublicListSource(async (id) => id === 'carteexistante0123456789');
    delete process.env.DEMO_AI;
  });

  it('accepte un utilisateur authentifié', async () => {
    const post = await client(makeApp());
    const r = await post('/api/ai/parse-invoice', { Authorization: `Bearer ${sign(claims())}` });
    expect(r.status).toBe(200);
    expect((await r.json()).access).toEqual({ kind: 'user', uid: 'user-1' });
  });

  it('refuse un jeton invalide au lieu de basculer en mode démo', async () => {
    const post = await client(makeApp());
    const r = await post('/api/ai/parse-invoice', { Authorization: `Bearer ${sign(claims(), { key: other.privateKey })}` });
    expect(r.status).toBe(401);
  });

  it("limite l'accès public au sommelier d'une carte existante", async () => {
    const post = await client(makeApp());
    expect((await post('/api/ai/parse-invoice', { 'X-Public-List-Id': 'carteexistante0123456789' })).status).toBe(403);
    expect((await post('/api/ai/sommelier', { 'X-Public-List-Id': 'carteinventee0123456789' })).status).toBe(404);
    const ok = await post('/api/ai/sommelier', { 'X-Public-List-Id': 'carteexistante0123456789' });
    expect(ok.status).toBe(200);
    expect((await ok.json()).access.kind).toBe('public');
  });

  it("plafonne les essais d'identifiants de carte par IP", async () => {
    const post = await client(makeApp());
    for (let i = 0; i < QUOTAS.publicIp; i++) await post('/api/ai/sommelier', { 'X-Public-List-Id': `carteinventee${String(i).padStart(11, '0')}` });
    expect((await post('/api/ai/sommelier', { 'X-Public-List-Id': 'carteexistante0123456789' })).status).toBe(429);
  });

  it("ne laisse pas contourner le quota démo en changeant d'organisation déclarée", async () => {
    const post = await client(makeApp());
    for (let i = 0; i < QUOTAS.demoIp; i++) expect((await post('/api/ai/parse-invoice', { 'X-Org-Id': `org-${i}` })).status).toBe(200);
    expect((await post('/api/ai/parse-invoice', { 'X-Org-Id': 'org-nouvelle' })).status).toBe(429);
  });

  it("refuse l'IA sans compte quand DEMO_AI=off", async () => {
    process.env.DEMO_AI = 'off';
    const post = await client(makeApp());
    expect((await post('/api/ai/parse-invoice')).status).toBe(401);
    delete process.env.DEMO_AI;
  });

  it("n'applique le contrôle qu'une fois quand le middleware est monté deux fois", async () => {
    const app = express();
    app.use('/api/ai', requireUser, requireUser);
    app.post('/api/ai/parse-invoice', (_req, res) => res.json({ ok: true }));
    const post = await client(app);
    await post('/api/ai/parse-invoice');
    for (let i = 1; i < QUOTAS.demoIp; i++) expect((await post('/api/ai/parse-invoice')).status).toBe(200);
  });
});

describe('en-têtes de sécurité', () => {
  it('pose une CSP stricte en production seulement', async () => {
    const app = express();
    app.use(securityHeaders(true, 'cave-test.firebaseapp.com'));
    app.get('/', (_req, res) => res.send('ok'));
    const server = await new Promise<ReturnType<express.Express['listen']>>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    servers.push(server);
    const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
    const csp = r.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain('https://cave-test.firebaseapp.com');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it("n'autorise aucun script inline", () => {
    const scripts = contentSecurityPolicy().split('; ').find((d) => d.startsWith('script-src')) ?? '';
    expect(scripts).not.toContain('unsafe-inline');
    expect(scripts).not.toContain('unsafe-eval');
  });
});
