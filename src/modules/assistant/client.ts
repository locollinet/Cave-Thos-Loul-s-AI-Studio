import { getFirebaseAuth, isFirebaseConfigured } from '@/data/firebase';
import { uid } from '@/lib/utils';
import { availableTools, getToolByName, type AssistantToolContext } from './tools';
import type { AssistantAnswer, AssistantServerResponse, AssistantToolName, ResultCard } from './types';

const MAX_TOOL_ROUNDS = 4;
const MAX_HISTORY_TURNS = 16;

async function postAssistant<T>(path: string, body: unknown, orgId: string, questionId: string): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Org-Id': orgId,
    'X-Question-Id': questionId,
  };
  if (isFirebaseConfigured()) {
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const r = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error((j as { error?: string }).error ?? `Erreur ${r.status}`);
  }
  return j as T;
}

export interface RunAssistantArgs {
  ctx: AssistantToolContext;
  question: string;
  currentPath: string;
  history: Record<string, unknown>[];
  onStep?: (toolName: AssistantToolName) => void;
}

export interface RunAssistantResult {
  questionId: string;
  answer: AssistantAnswer;
  cards: ResultCard[];
  history: Record<string, unknown>[];
}

/**
 * Exécute une question auprès de l'assistant IA avec boucle d'appels d'outils côté client.
 * Conserve intact le `modelContent` renvoyé par le serveur (dont les signatures de raisonnement Gemini 3).
 */
export async function askAssistant({
  ctx,
  question,
  currentPath,
  history: prevHistory,
  onStep,
}: RunAssistantArgs): Promise<RunAssistantResult> {
  const questionId = `ast-${uid()}`;
  const locale = ctx.locale ?? ctx.org.locale ?? 'fr';
  const tools = availableTools(ctx);
  const allowedTools = tools.map((t) => t.name);
  const siteName =
    ctx.activeSiteId === 'all'
      ? locale === 'en'
        ? 'All sites'
        : 'Tous les lieux'
      : ctx.sites.find((s) => s.id === ctx.activeSiteId)?.name ?? ctx.activeSiteId;

  const trimmedPrev = prevHistory.slice(-MAX_HISTORY_TURNS);
  const history: Record<string, unknown>[] = [
    ...trimmedPrev,
    { role: 'user', parts: [{ text: question.trim().slice(0, 1000) }] },
  ];

  const cards: ResultCard[] = [];
  const usedTools: AssistantToolName[] = [];
  let lockedModel: string | undefined;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await postAssistant<AssistantServerResponse>(
      '/api/ai/assistant',
      {
        questionId,
        locale,
        allowedTools,
        lockedModel,
        toolRound: round,
        usedTools,
        scope: {
          role: ctx.role,
          profile: ctx.org.profile,
          modules: ctx.org.modules,
          siteName,
          canSeeCosts: ctx.canSeeCosts,
          currentPath,
        },
        history,
      },
      ctx.orgId,
      questionId,
    );

    lockedModel = res.model;

    if (res.kind === 'answer') {
      history.push({ role: 'model', parts: [{ text: res.answer.text }] });
      return {
        questionId,
        answer: {
          ...res.answer,
          usedTools,
        },
        cards,
        history: history.slice(-MAX_HISTORY_TURNS),
      };
    }

    // Conservation intacte du contenu du modèle (avec ses signatures éventuelles)
    history.push(res.modelContent);

    const responseParts: Record<string, unknown>[] = [];
    for (const call of res.calls) {
      const tool = getToolByName(call.name);
      if (!tool || !allowedTools.includes(call.name)) {
        responseParts.push({
          functionResponse: {
            id: call.id,
            name: call.name,
            response: { error: 'Outil non autorisé pour ce rôle ou ce module.' },
          },
        });
        continue;
      }
      onStep?.(call.name);
      if (!usedTools.includes(call.name)) usedTools.push(call.name);
      try {
        const output = await tool.run(ctx, call.args);
        const toolCards = tool.toCards(output, ctx);
        cards.push(...toolCards);
        responseParts.push({
          functionResponse: {
            id: call.id,
            name: call.name,
            response: output as Record<string, unknown>,
          },
        });
      } catch (e) {
        responseParts.push({
          functionResponse: {
            id: call.id,
            name: call.name,
            response: { error: e instanceof Error ? e.message : 'Erreur lors de la lecture des données.' },
          },
        });
      }
    }

    history.push({
      role: 'user',
      parts: responseParts,
    });
  }

  return {
    questionId,
    answer: {
      text:
        locale === 'en'
          ? 'Here are the results gathered from your cellar data.'
          : 'Voici les éléments recueillis dans les données de votre cave.',
      usedTools,
    },
    cards,
    history: history.slice(-MAX_HISTORY_TURNS),
  };
}

export async function sendAssistantFeedback(
  orgId: string,
  questionId: string,
  vote: 'up' | 'down',
  usedTools: AssistantToolName[] = [],
): Promise<void> {
  await postAssistant('/api/ai/assistant/feedback', { questionId, vote, usedTools }, orgId, questionId).catch(() => {});
}
