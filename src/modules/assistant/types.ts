import type { MovementReason, MovementType, WineColor } from '@/types';

export const ASSISTANT_TOOL_NAMES = [
  'find_wines',
  'stock_alerts',
  'rotation',
  'margins',
  'data_quality',
  'help',
  'navigate',
] as const;

export type AssistantToolName = (typeof ASSISTANT_TOOL_NAMES)[number];

export const isAssistantToolName = (name: string): name is AssistantToolName =>
  (ASSISTANT_TOOL_NAMES as readonly string[]).includes(name);

export interface WinePrefillPayload {
  producer?: string;
  name?: string;
  appellation?: string;
  cuvee?: string;
  vintage?: string;
  color?: WineColor;
  formatCl?: number;
  region?: string;
  subRegion?: string;
  country?: string;
  grapes?: string;
  buyPriceHT?: number;
  sellPriceHT?: number;
  menuPriceTTC?: number;
  initialQty?: number;
  initialSiteId?: string;
}

export interface MovementPrefillPayload {
  wineId?: string;
  wineLabel?: string;
  type?: MovementType;
  qty?: number;
  reason?: MovementReason;
  unitCostHT?: number;
  siteId?: string;
  bin?: string;
  note?: string;
}

export interface ResultCardMetric {
  label: string;
  value: string;
  tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'brand';
}

export interface ResultCardItem {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeTone?: 'neutral' | 'ok' | 'warn' | 'bad';
  href?: string;
}

export interface ResultCard {
  id: string;
  kind: 'wines' | 'alerts' | 'rotation' | 'margins' | 'quality' | 'help' | 'action';
  title: string;
  subtitle?: string;
  metrics?: ResultCardMetric[];
  items?: ResultCardItem[];
  link?: {
    label: string;
    to: string;
    state?: {
      winePrefill?: WinePrefillPayload;
      movementPrefill?: MovementPrefillPayload;
    };
  };
}

export interface AssistantAnswer {
  text: string;
  citedIds?: { wineIds?: string[]; siteIds?: string[] };
  followUps?: string[];
  usedTools: AssistantToolName[];
}

export interface AssistantTurnCall {
  id?: string;
  name: AssistantToolName;
  args: Record<string, unknown>;
}

export type AssistantServerResponse =
  | {
      kind: 'tool_calls';
      questionId: string;
      model: string;
      modelContent: Record<string, unknown>;
      calls: AssistantTurnCall[];
    }
  | {
      kind: 'answer';
      questionId: string;
      model: string;
      answer: AssistantAnswer;
    };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  cards?: ResultCard[];
  followUps?: string[];
  usedTools?: AssistantToolName[];
  questionId?: string;
  feedback?: 'up' | 'down';
  error?: boolean;
  createdAt: number;
}
