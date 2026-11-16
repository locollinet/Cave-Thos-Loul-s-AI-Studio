import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { GoogleGenAI } from '@google/genai';
import type { ModuleId, Movement, Org, Role, Site, StockLevel, Wine } from '@/types';
import { emptyLegal } from '@/app/org';
import { NAV, PROFILE_MODULES, isNavVisible } from '@/registry';
import type { DataStore, Op } from '@/data/store';
import { canonicalKey } from '@/lib/wine';
import { today } from '@/lib/utils';
import { ASSISTANT_TOOL_NAMES, isAssistantToolName } from '@/modules/assistant/types';
import {
  TOOLS,
  availableTools,
  getToolByName,
  sanitizeForRole,
  type AssistantToolContext,
} from '@/modules/assistant/tools';
import { getContextualSuggestions } from '@/modules/assistant/helpContent';
import { assistantRouter } from '../server/aiAssistant';
import { QUOTAS, resetQuotas, setFirebaseConfig } from '../server/auth';
import { setAiClientFactory } from '../server/gemini';
import goldenQuestions from './assistant/golden.json';

const makeOrg = (modules: ModuleId[] = ['stock', 'carte', 'achats', 'negoce', 'compta', 'pilotage']): Org => ({
  id: 'org-ast-1',
  ownerUid: 'u-1',
  name: 'Le Grand Véfour Démo',
  profile: 'restaurant',
  modules,
  locale: 'fr',
  currency: 'EUR',
  legal: emptyLegal(),
  invoicePrefix: 'FAC',
  quotePrefix: 'DEV',
  defaultVatRate: 20,
  defaultCoefficient: 2.5,
  createdAt: Date.now(),
});

const SITES: Site[] = [
  { id: 'site-cave', name: 'Cave de garde', kind: 'cave', createdAt: 1 },
  { id: 'site-jour', name: 'Cave de jour', kind: 'restaurant', createdAt: 2 },
];

const WINES: Wine[] = [
  {
    id: 'w-meursault',
    producer: 'Domaine Roulot',
    name: 'Meursault Les Luchets',
    vintage: '2022',
    color: 'blanc',
    region: 'Bourgogne',
    subRegion: 'Côte de Beaune',
    country: 'France',
    grapes: 'Chardonnay',
    formatCl: 75,
    buyPriceHT: 55,
    sellPriceHT: 140,
    menuPriceTTC: 190,
    coefficient: 2.5,
    alertThreshold: 6,
    apogeeFrom: 2025,
    apogeeTo: 2032,
    canonicalKey: canonicalKey({ producer: 'Domaine Roulot', name: 'Meursault Les Luchets', vintage: '2022', color: 'blanc', formatCl: 75 }),
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'w-gevrey',
    producer: 'Domaine Armand Rousseau',
    name: 'Gevrey-Chambertin 1er Cru',
    vintage: '2017',
    color: 'rouge',
    region: 'Bourgogne',
    subRegion: 'Côte de Nuits',
    country: 'France',
    grapes: 'Pinot Noir',
    formatCl: 75,
    buyPriceHT: 120,
    sellPriceHT: 150, // marge faible volontaire
    menuPriceTTC: 180,
    coefficient: 2.5,
    alertThreshold: 3,
    apogeeFrom: 2021,
    apogeeTo: 2025, // apogée dépassée en 2026
    canonicalKey: canonicalKey({ producer: 'Domaine Armand Rousseau', name: 'Gevrey-Chambertin 1er Cru', vintage: '2017', color: 'rouge', formatCl: 75 }),
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'w-gevrey-dup',
    producer: 'Armand Rousseau',
    name: 'Gevrey Chambertin 1er Cru',
    vintage: '2017',
    color: 'rouge',
    region: 'Bourgogne',
    formatCl: 75,
    alertThreshold: 2,
    canonicalKey: canonicalKey({ producer: 'Domaine Armand Rousseau', name: 'Gevrey-Chambertin 1er Cru', vintage: '2017', color: 'rouge', formatCl: 75 }),
    createdAt: 2,
    updatedAt: 2,
  },
];

const STOCK: StockLevel[] = [
  { id: 'w-meursault__site-cave', wineId: 'w-meursault', siteId: 'site-cave', qty: 4, bin: 'A1', updatedAt: 1 },
  { id: 'w-meursault__site-jour', wineId: 'w-meursault', siteId: 'site-jour', qty: 1, updatedAt: 1 }, // sans casier, total 5 <= seuil 6
  { id: 'w-gevrey__site-cave', wineId: 'w-gevrey', siteId: 'site-cave', qty: 12, bin: 'B4', updatedAt: 1 },
];

const memCols = new Map<string, Map<string, Record<string, unknown>>>();

const memoryStore: DataStore = {
  mode: 'local',
  subscribeCollection<T>(path: string, cb: (rows: T[]) => void, opts?: { orderBy?: [string, 'asc' | 'desc']; limit?: number }) {
    let rows = [...(memCols.get(path)?.values() ?? [])];
    if (opts?.orderBy) {
      const [f, dir] = opts.orderBy;
      rows.sort((a, b) => ((a[f] as number | string) > (b[f] as number | string) ? 1 : -1) * (dir === 'desc' ? -1 : 1));
    }
    if (opts?.limit) rows = rows.slice(0, opts.limit);
    queueMicrotask(() => cb(rows as T[]));
    return () => {};
  },
  subscribeDoc<T>(path: string, cb: (row: T | null) => void) {
    const i = path.lastIndexOf('/');
    const row = memCols.get(path.slice(0, i))?.get(path.slice(i + 1)) ?? null;
    queueMicrotask(() => cb(row as T | null));
    return () => {};
  },
  async getDoc<T>(path: string) {
    const i = path.lastIndexOf('/');
    return (memCols.get(path.slice(0, i))?.get(path.slice(i + 1)) as T) ?? null;
  },
  async commit(ops: Op[]) {
    for (const o of ops) {
      const i = o.path.lastIndexOf('/');
      const coll = o.path.slice(0, i);
      const id = o.path.slice(i + 1);
      if (!memCols.has(coll)) memCols.set(coll, new Map());
      const c = memCols.get(coll)!;
      if (o.op === 'delete') c.delete(id);
      else if (o.op === 'set') c.set(id, o.merge ? { ...(c.get(id) ?? {}), ...o.data } : { ...o.data });
      else {
        const cur = c.get(id) ?? {};
        c.set(id, { ...cur, ...(o.data ?? {}), [o.field]: ((cur[o.field] as number) ?? 0) + o.by });
      }
    }
  },
  async getNextSequence() {
    return 1;
  },
  async commitWithSequence(_orgId, _key, build) {
    await memoryStore.commit(build(1));
    return 1;
  },
};

function makeCtx(role: Role = 'owner', modules: ModuleId[] = ['stock', 'carte', 'achats', 'negoce', 'compta', 'pilotage']): AssistantToolContext {
  const org = makeOrg(modules);
  return {
    store: memoryStore,
    orgId: org.id,
    org,
    role,
    sites: SITES,
    wines: WINES,
    producers: [],
    partners: [],
    stock: STOCK,
    activeSiteId: 'all',
    canSeeCosts: role !== 'staff',
    hasModule: (m) => modules.includes(m),
    locale: 'fr',
  };
}

describe('Jeu de référence (golden.json)', () => {
  it('contient 30 questions de référence valides couvrant tous les rôles et outils', () => {
    expect(goldenQuestions).toHaveLength(30);
    for (const q of goldenQuestions) {
      expect(['owner', 'manager', 'sommelier', 'accountant', 'staff']).toContain(q.role);
      for (const t of q.expectedTools) {
        expect(isAssistantToolName(t)).toBe(true);
      }
    }
  });
});

describe('Droits des outils & cohérence avec registry.ts (isNavVisible)', () => {
  const ALL_ROLES: Role[] = ['owner', 'manager', 'sommelier', 'accountant', 'staff'];

  it('aligne strictement availableTools sur NAV et isNavVisible pour chaque rôle et chaque profil', () => {
    for (const profile of ['negoce', 'independant', 'restaurant', 'chaine'] as const) {
      const modules = PROFILE_MODULES[profile];
      for (const role of ALL_ROLES) {
        const ctx = makeCtx(role, modules);
        const unlocked = availableTools(ctx);

        for (const tool of TOOLS) {
          const isUnlocked = unlocked.some((u) => u.name === tool.name);
          if (tool.module) {
            const navMatches = NAV.filter((n) => n.module === tool.module);
            const anyVisibleInNav = navMatches.some((n) => isNavVisible(n, modules, role));
            if (!anyVisibleInNav) {
              expect(isUnlocked).toBe(false);
            }
          }
          if (tool.needsCosts && !ctx.canSeeCosts) {
            expect(isUnlocked).toBe(false);
          }
        }
      }
    }
  });

  it('interdit margins et data_quality au rôle staff et ne propose aucune suggestion de marge au staff', () => {
    const staffCtx = makeCtx('staff');
    const names = availableTools(staffCtx).map((t) => t.name);
    expect(names).toContain('find_wines');
    expect(names).toContain('stock_alerts');
    expect(names).toContain('rotation');
    expect(names).toContain('help');
    expect(names).toContain('navigate');
    expect(names).not.toContain('margins');
    expect(names).not.toContain('data_quality');

    const suggestions = getContextualSuggestions('/pilotage', 'staff', false, true, 'fr');
    expect(suggestions.join(' ').toLowerCase()).not.toContain('marge');
  });
});

describe('Exécution des outils côté client & absence totale de fuite de coûts pour staff', () => {
  beforeEach(async () => {
    memCols.clear();
    const mv: Movement = {
      id: 'mv-1',
      date: today(),
      wineId: 'w-meursault',
      wineLabel: 'Domaine Roulot · Meursault Les Luchets · 2022',
      siteId: 'site-jour',
      type: 'out',
      qty: 2,
      reason: 'casse',
      unitCostHT: 55,
      userId: 'u-1',
      userName: 'Chef',
      createdAt: Date.now(),
    };
    await memoryStore.commit([
      { op: 'set', path: 'orgs/org-ast-1/movements/mv-1', data: mv as unknown as Record<string, unknown> },
      {
        op: 'set',
        path: 'orgs/org-ast-1/openBottles/ob-1',
        data: {
          id: 'ob-1',
          wineId: 'w-meursault',
          wineLabel: 'Domaine Roulot · Meursault',
          siteId: 'site-jour',
          openedAt: Date.now() - 5 * 86_400_000, // ouverte il y a 5 jours
          openedBy: 'Sommelier',
          glassCl: 12.5,
          glassesTotal: 6,
          glassesServed: 2,
          status: 'open',
        },
      },
    ]);
  });

  it('ne renvoie AUCUN champ de coût ni dans la sortie JSON ni dans les cartes pour le rôle staff', async () => {
    const staffCtx = makeCtx('staff');
    expect(sanitizeForRole({ name: 'Test', buyPriceHT: 50, nested: { margin: 12 } }, false)).toEqual({ name: 'Test', nested: {} });
    const forbiddenKeys = [
      'buyPriceHT',
      'coefficient',
      'unitCostHT',
      'costHT',
      'costValue',
      'costValueHT',
      'totalCostHT',
      'stockCost',
      'grossMargin',
      'margin',
      'marginRate',
    ];

    for (const toolName of ['find_wines', 'stock_alerts', 'rotation'] as const) {
      const tool = getToolByName(toolName)!;
      const out = await tool.run(staffCtx, { metric: 'shrinkage' });
      const cards = tool.toCards(out, staffCtx);
      const serialized = JSON.stringify({ out, cards });
      for (const k of forbiddenKeys) {
        expect(serialized).not.toContain(`"${k}"`);
      }
      expect(serialized.toLowerCase()).not.toContain('achat ht');
    }
  });

  it('exécute find_wines, stock_alerts, rotation, margins, data_quality, help et navigate avec exactitude pour owner/sommelier', async () => {
    const ownerCtx = makeCtx('owner');

    // 1. find_wines (y compris résolution partielle du producteur "Roulot" -> "Domaine Roulot")
    const fw = getToolByName('find_wines')!;
    const fwOut = await fw.run(ownerCtx, { region: 'Bourgogne', color: 'blanc', producer: 'Roulot' });
    expect(fwOut.totalMatchingRefs).toBe(1);
    expect(fwOut.totalBottles).toBe(5);
    expect(fwOut.totalCostHT).toBe(275); // 5 * 55 €
    expect(fwOut.filterUrl).toContain('color=blanc');

    // 2. stock_alerts (inclut maturityRisk et openBottles > 3j)
    const sa = getToolByName('stock_alerts')!;
    const saOut = await sa.run(ownerCtx, { openDaysThreshold: 3 });
    expect(saOut.counts.low).toBeGreaterThanOrEqual(1); // Meursault 5 <= 6
    expect(saOut.counts.maturityRisk).toBeGreaterThanOrEqual(1); // Gevrey 2017 apogée 2025
    expect(saOut.counts.openBottlesExpired).toBe(1); // ob-1 ouverte depuis 5j

    // 3. rotation (dormant & shrinkage)
    const rot = getToolByName('rotation')!;
    const rotDormant = await rot.run(ownerCtx, { metric: 'dormant', days: 90 });
    expect(rotDormant.items.some((i: { wineId?: string }) => i.wineId === 'w-gevrey')).toBe(true);
    const rotShrink = await rot.run(ownerCtx, { metric: 'shrinkage', days: 90 });
    expect(rotShrink.items[0].qty).toBe(2);

    // 4. margins
    const marg = getToolByName('margins')!;
    const margOut = await marg.run(ownerCtx, { focus: 'underpriced' });
    expect(margOut.items.some((i: { wineId: string }) => i.wineId === 'w-gevrey')).toBe(true);

    // 5. data_quality (détecte doublons, sans prix, sans casier)
    const dq = getToolByName('data_quality')!;
    const dqOut = await dq.run(ownerCtx, {});
    expect(dqOut.counts.duplicateGroups).toBe(1);
    expect(dqOut.counts.missingPrice).toBe(1); // w-gevrey-dup
    expect(dqOut.counts.missingBin).toBe(1); // w-meursault sur site-jour

    // 6. help
    const hlp = getToolByName('help')!;
    const hlpOut = await hlp.run(ownerCtx, { query: 'comment sortir une bouteille' });
    expect(hlpOut.matches.length).toBeGreaterThan(0);
    expect(hlpOut.matches[0].route).toBe('/stock');

    // 7. navigate (Étape 2 : pré-remplissage + détection de doublon)
    const nav = getToolByName('navigate')!;
    const navDup = await nav.run(ownerCtx, {
      route: '/vins',
      actionKind: 'prefill_new_wine',
      winePrefill: {
        producer: 'Domaine Roulot',
        name: 'Meursault Les Luchets',
        vintage: '2022',
        color: 'blanc',
        formatCl: 75,
        buyPriceHT: 58,
        initialQty: 6,
      },
    });
    expect(navDup.allowed).toBe(true);
    expect(navDup.duplicateWarning?.wineId).toBe('w-meursault');
    const navCards = nav.toCards(navDup, ownerCtx);
    expect(navCards).toHaveLength(2); // 1 carte d'alerte doublon (+stock) + 1 carte création

    // Refus de navigation vers un module désactivé (ex: /negoce sur profil restaurant)
    const restCtx = makeCtx('manager', ['stock', 'carte', 'achats', 'pilotage']);
    const navRefused = await nav.run(restCtx, { route: '/negoce', actionKind: 'open_page' });
    expect(navRefused.allowed).toBe(false);
    expect(navRefused.reason).toContain('negoce');
  });
});

describe('Route serveur /api/ai/assistant (boucle d’outils, signatures Gemini 3 et quotas par question)', () => {
  const servers: { close: () => void }[] = [];

  async function listen(app: express.Express): Promise<string> {
    return new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => {
        servers.push(s);
        resolve(`http://127.0.0.1:${(s.address() as AddressInfo).port}`);
      });
    });
  }

  beforeEach(() => {
    resetQuotas();
    setFirebaseConfig({});
  });

  afterAll(() => {
    setAiClientFactory(null);
    servers.forEach((s) => s.close());
  });

  it('préserve intact le modelContent (thoughtSignature) et compte 1 seul quota par questionId sur plusieurs tours', async () => {
    let callIndex = 0;
    setAiClientFactory(
      () =>
        ({
          models: {
            generateContent: async () => {
              callIndex += 1;
              if (callIndex === 1) {
                return {
                  candidates: [
                    {
                      content: {
                        role: 'model',
                        parts: [
                          { thought: true, text: 'raisonnement interne', thoughtSignature: 'sig-encrypted-xyz-999' },
                          { functionCall: { id: 'fc-1', name: 'find_wines', args: { region: 'Bourgogne' } } },
                        ],
                      },
                    },
                  ],
                };
              }
              return {
                text: JSON.stringify({
                  text: 'Vous avez 17 bouteilles de Bourgogne en cave.',
                  citedWineIds: ['w-meursault'],
                  followUps: ['Voir le détail par lieu ?'],
                }),
                usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 120 },
              };
            },
          },
        }) as unknown as GoogleGenAI,
    );

    const app = express();
    app.use(express.json());
    app.use('/api/ai/assistant', assistantRouter);
    const base = await listen(app);

    // Tour 1 : renvoie tool_calls avec thoughtSignature intacte
    const r1 = await fetch(`${base}/api/ai/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Question-Id': 'q-test-123' },
      body: JSON.stringify({
        questionId: 'q-test-123',
        locale: 'fr',
        allowedTools: [...ASSISTANT_TOOL_NAMES],
        toolRound: 0,
        usedTools: [],
        scope: { role: 'sommelier', profile: 'restaurant', modules: ['stock', 'carte'], siteName: 'Cave', canSeeCosts: true, currentPath: '/vins' },
        history: [{ role: 'user', parts: [{ text: 'Combien de Bourgogne ?' }] }],
      }),
    });
    expect(r1.status).toBe(200);
    const j1 = await r1.json();
    expect(j1.kind).toBe('tool_calls');
    expect(j1.modelContent.parts[0].thoughtSignature).toBe('sig-encrypted-xyz-999');
    expect(j1.calls[0].name).toBe('find_wines');

    // Tour 2 avec le MÊME X-Question-Id : renvoie la réponse finale
    const r2 = await fetch(`${base}/api/ai/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Question-Id': 'q-test-123' },
      body: JSON.stringify({
        questionId: 'q-test-123',
        locale: 'fr',
        allowedTools: [...ASSISTANT_TOOL_NAMES],
        lockedModel: j1.model,
        toolRound: 1,
        usedTools: ['find_wines'],
        scope: { role: 'sommelier', profile: 'restaurant', modules: ['stock', 'carte'], siteName: 'Cave', canSeeCosts: true, currentPath: '/vins' },
        history: [
          { role: 'user', parts: [{ text: 'Combien de Bourgogne ?' }] },
          j1.modelContent,
          { role: 'user', parts: [{ functionResponse: { id: 'fc-1', name: 'find_wines', response: { totalBottles: 17 } } }] },
        ],
      }),
    });
    expect(r2.status).toBe(200);
    const j2 = await r2.json();
    expect(j2.kind).toBe('answer');
    expect(j2.answer.text).toContain('17 bouteilles');
  });

  it('refuse un nom d’outil inconnu (400) et bloque au-delà de 5 appels sur le même questionId (429)', async () => {
    setAiClientFactory(
      () =>
        ({
          models: {
            generateContent: async () => ({
              text: JSON.stringify({ text: 'OK', followUps: [] }),
            }),
          },
        }) as unknown as GoogleGenAI,
    );

    const app = express();
    app.use(express.json());
    app.use('/api/ai/assistant', assistantRouter);
    const base = await listen(app);

    const bad = await fetch(`${base}/api/ai/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Question-Id': 'q-bad' },
      body: JSON.stringify({
        questionId: 'q-bad',
        locale: 'fr',
        allowedTools: ['outil_pirate'],
        toolRound: 0,
        history: [{ role: 'user', parts: [{ text: 'Test' }] }],
      }),
    });
    expect(bad.status).toBe(400);

    // 5 appels avec le même questionId passent, le 6e est bloqué (429)
    for (let i = 0; i < 5; i++) {
      const ok = await fetch(`${base}/api/ai/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Question-Id': 'q-loop' },
        body: JSON.stringify({
          questionId: 'q-loop',
          locale: 'fr',
          allowedTools: ['help'],
          toolRound: 0,
          history: [{ role: 'user', parts: [{ text: 'Test' }] }],
        }),
      });
      expect(ok.status).toBe(200);
    }
    const sixth = await fetch(`${base}/api/ai/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Question-Id': 'q-loop' },
      body: JSON.stringify({
        questionId: 'q-loop',
        locale: 'fr',
        allowedTools: ['help'],
        toolRound: 0,
        history: [{ role: 'user', parts: [{ text: 'Test' }] }],
      }),
    });
    expect(sixth.status).toBe(429);

    // Le feedback sur un questionId ayant déjà atteint 5 tours reste autorisé
    const fb = await fetch(`${base}/api/ai/assistant/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Question-Id': 'q-loop' },
      body: JSON.stringify({ questionId: 'q-loop', vote: 'up', usedTools: ['help'] }),
    });
    expect(fb.status).toBe(200);
    expect(QUOTAS.assistantDemoIp).toBe(15);
  });
});
