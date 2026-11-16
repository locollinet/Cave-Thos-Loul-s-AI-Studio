/**
 * Script d'évaluation manuel du jeu de questions de référence (`tests/assistant/golden.json`).
 * Exécution hors CI (appelle réellement Gemini) :
 *   GEMINI_API_KEY=... npx tsx tests/assistant/eval.ts
 */
import express from 'express';
import type { AddressInfo } from 'net';
import type { ModuleId, Org, Role } from '../../src/types';
import { PROFILE_MODULES } from '../../src/registry';
import { emptyLegal } from '../../src/app/org';
import { localStore, resetLocalData } from '../../src/data/store';
import { buildFullDemoOps } from '../../src/data/demoSetup';
import { availableTools, getToolByName, type AssistantToolContext } from '../../src/modules/assistant/tools';
import type { AssistantServerResponse, AssistantToolName } from '../../src/modules/assistant/types';
import { assistantRouter } from '../../server/aiAssistant';
import golden from './golden.json';

interface GoldenEntry {
  id: number;
  role: Role;
  profile: Org['profile'];
  page: string;
  question: string;
  expectedTools: string[];
  expectRefusal: boolean;
  criteria: string;
}

async function runEval() {
  if (!process.env.GEMINI_API_KEY && process.env.AI_BACKEND !== 'vertex') {
    console.error('GEMINI_API_KEY requise (ou AI_BACKEND=vertex) pour exécuter l’évaluation.');
    process.exit(1);
  }

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/ai/assistant', assistantRouter);
  const server = await new Promise<ReturnType<express.Express['listen']>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    let passed = 0;
    const total = golden.length;

    for (const item of golden as GoldenEntry[]) {
      if (typeof localStorage === 'undefined') {
        const mem = new Map<string, string>();
        (globalThis as unknown as Record<string, unknown>).localStorage = {
          getItem: (k: string) => mem.get(k) ?? null,
          setItem: (k: string, v: string) => mem.set(k, v),
          removeItem: (k: string) => mem.delete(k),
          clear: () => mem.clear(),
          key: (i: number) => [...mem.keys()][i] ?? null,
          get length() {
            return mem.size;
          },
        };
      }
      resetLocalData();
      const orgId = `eval-${item.id}`;
      const siteId = 'site-eval-1';
      const modules: ModuleId[] = PROFILE_MODULES[item.profile];
      const org: Org = {
        id: orgId,
        ownerUid: 'u-eval',
        name: 'Domaine Démo Eval',
        profile: item.profile,
        modules,
        locale: 'fr',
        currency: 'EUR',
        legal: emptyLegal(),
        invoicePrefix: 'FAC',
        quotePrefix: 'DEV',
        defaultVatRate: 20,
        defaultCoefficient: 2.5,
        createdAt: Date.now(),
      };
      await localStore.commit(
        buildFullDemoOps(orgId, siteId, item.profile, {
          orgName: org.name,
          modules,
          locale: 'fr',
          defaultVatRate: 20,
          legal: org.legal,
          actor: { userId: 'u-eval', userName: 'Eval' },
          sampleMembers: true,
        }),
        { allowChunking: true },
      );

      const readAll = async <T>(c: string) =>
        new Promise<T[]>((res) => {
          const u = localStore.subscribeCollection<T>(`orgs/${orgId}/${c}`, (rows) => {
            queueMicrotask(() => u());
            res(rows);
          });
        });

      const [sites, wines, producers, partners, stock] = await Promise.all([
        readAll('sites'),
        readAll('wines'),
        readAll('producers'),
        readAll('partners'),
        readAll('stock'),
      ]);

      const ctx: AssistantToolContext = {
        store: localStore,
        orgId,
        org,
        role: item.role,
        sites: sites as AssistantToolContext['sites'],
        wines: wines as AssistantToolContext['wines'],
        producers: producers as AssistantToolContext['producers'],
        partners: partners as AssistantToolContext['partners'],
        stock: stock as AssistantToolContext['stock'],
        activeSiteId: 'all',
        canSeeCosts: item.role !== 'staff',
        hasModule: (m) => modules.includes(m),
        locale: 'fr',
      };

      const allowedTools = availableTools(ctx).map((t) => t.name);
      const history: Record<string, unknown>[] = [{ role: 'user', parts: [{ text: item.question }] }];
      const usedTools: AssistantToolName[] = [];
      let lockedModel: string | undefined;
      let answerText = '';
      const t0 = Date.now();

      for (let round = 0; round <= 4; round++) {
        const r = await fetch(`${baseUrl}/api/ai/assistant`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Question-Id': `eval-q-${item.id}` },
          body: JSON.stringify({
            questionId: `eval-q-${item.id}`,
            locale: 'fr',
            allowedTools,
            lockedModel,
            toolRound: round,
            usedTools,
            scope: {
              role: item.role,
              profile: item.profile,
              modules,
              siteName: 'Tous les lieux',
              canSeeCosts: ctx.canSeeCosts,
              currentPath: item.page,
            },
            history,
          }),
        });
        const j = (await r.json()) as AssistantServerResponse;
        lockedModel = j.model;
        if (j.kind === 'answer') {
          answerText = j.answer.text;
          break;
        }
        history.push(j.modelContent);
        const parts: Record<string, unknown>[] = [];
        for (const c of j.calls) {
          const tool = getToolByName(c.name);
          if (!tool) continue;
          if (!usedTools.includes(c.name)) usedTools.push(c.name);
          const output = await tool.run(ctx, c.args);
          parts.push({ functionResponse: { id: c.id, name: c.name, response: output } });
        }
        history.push({ role: 'user', parts });
      }

      const elapsedMs = Date.now() - t0;
      const toolOk =
        item.expectedTools.length === 0
          ? usedTools.length === 0 || item.expectRefusal
          : item.expectedTools.every((et) => usedTools.includes(et as AssistantToolName));
      if (toolOk && answerText) passed += 1;
      console.log(
        `[${toolOk ? 'OK' : 'KO'}] #${item.id} (${item.role}/${item.profile}) ${elapsedMs}ms tools=[${usedTools.join(',')}] → ${answerText.slice(0, 90)}`,
      );
    }

    console.log(`\nScore évaluation : ${passed}/${total} (${Math.round((passed / total) * 100)}%)`);
  } finally {
    server.close();
  }
}

runEval().catch((e) => {
  console.error(e);
  process.exit(1);
});
