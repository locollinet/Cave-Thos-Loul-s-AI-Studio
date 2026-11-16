import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  WifiOff,
} from 'lucide-react';
import type { Locale, Role } from '@/types';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Badge, Button, Modal, Spinner, cx } from '@/ui';
import { uid } from '@/lib/utils';
import { getContextualSuggestions } from './helpContent';
import type { AssistantToolName, ChatMessage, ResultCard } from './types';
import { askAssistant, sendAssistantFeedback } from './client';

const ROLE_LABELS: Record<Locale, Record<Role, string>> = {
  fr: {
    owner: 'Propriétaire',
    manager: 'Responsable',
    sommelier: 'Sommelier',
    accountant: 'Comptable',
    staff: 'Équipe de salle',
  },
  en: {
    owner: 'Owner',
    manager: 'Manager',
    sommelier: 'Sommelier',
    accountant: 'Accountant',
    staff: 'Service staff',
  },
};

export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const orgCtx = useOrg();
  const location = useLocation();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [rawHistory, setRawHistory] = useState<Record<string, unknown>[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [stepKey, setStepKey] = useState<string>('assistant.step.thinking');
  const [online, setOnline] = useState<boolean>(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, busy, stepKey]);

  const scopeLabel = useMemo(() => {
    const rLabel = ROLE_LABELS[locale]?.[orgCtx.role] ?? orgCtx.role;
    const sLabel =
      orgCtx.activeSiteId === 'all'
        ? t('common.allSites')
        : orgCtx.sites.find((s) => s.id === orgCtx.activeSiteId)?.name ?? orgCtx.activeSiteId;
    return `${rLabel} · ${sLabel}`;
  }, [locale, orgCtx.role, orgCtx.activeSiteId, orgCtx.sites, t]);

  const suggestions = useMemo(
    () =>
      getContextualSuggestions(
        location.pathname,
        orgCtx.role,
        orgCtx.canSeeCosts,
        orgCtx.hasModule('pilotage'),
        locale,
      ),
    [location.pathname, orgCtx.role, orgCtx.canSeeCosts, orgCtx.hasModule, locale],
  );

  const sendQuestion = async (qText: string) => {
    const trimmed = qText.trim();
    if (!trimmed || busy || !online) return;
    setInput('');
    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      text: trimmed,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);
    setStepKey('assistant.step.thinking');

    try {
      const res = await askAssistant({
        ctx: { ...orgCtx, locale },
        question: trimmed,
        currentPath: `${location.pathname}${location.search}`,
        history: rawHistory,
        onStep: (toolName: AssistantToolName) => setStepKey(`assistant.step.${toolName}`),
      });

      setRawHistory(res.history);
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          text: res.answer.text,
          cards: res.cards,
          followUps: res.answer.followUps,
          usedTools: res.answer.usedTools,
          questionId: res.questionId,
          createdAt: Date.now(),
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          text: e instanceof Error ? e.message : t('common.error'),
          error: true,
          createdAt: Date.now(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const handleFeedback = (msgId: string, vote: 'up' | 'down') => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        if (m.questionId) {
          sendAssistantFeedback(orgCtx.orgId, m.questionId, vote, m.usedTools);
        }
        return { ...m, feedback: vote };
      }),
    );
  };

  const resetSession = () => {
    setMessages([]);
    setRawHistory([]);
    setInput('');
  };

  const openCardLink = (link: NonNullable<ResultCard['link']>) => {
    onClose();
    if (link.state) {
      navigate(link.to, { state: link.state });
    } else {
      navigate(link.to);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      side
      size="lg"
      title={
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-brand/15 text-brand">
            <Sparkles className="size-4.5" />
          </span>
          <div>
            <div className="text-base font-semibold text-ink">{t('assistant.title')}</div>
            <div className="flex items-center gap-1.5 text-[11px] font-normal text-muted">
              <ShieldCheck className="size-3.5 text-ok" />
              <span>{scopeLabel}</span>
            </div>
          </div>
        </div>
      }
      footer={
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendQuestion(input);
          }}
          className="flex w-full items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            disabled={busy || !online}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('assistant.placeholder')}
            aria-label={t('assistant.placeholder')}
            className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-bg px-3.5 text-sm text-ink outline-none focus:border-brand disabled:opacity-50"
          />
          {messages.length > 0 && (
            <button
              type="button"
              onClick={resetSession}
              title={t('assistant.clear')}
              aria-label={t('assistant.clear')}
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-surface text-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
            >
              <RotateCcw className="size-4" />
            </button>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={!input.trim() || busy || !online}
            icon={<Send className="size-4" />}
            className="h-11 px-4"
          >
            <span className="hidden sm:inline">{t('assistant.send')}</span>
          </Button>
        </form>
      }
    >
      <div className="flex min-h-[60dvh] flex-col gap-4" aria-live="polite">
        {!online && (
          <div className="flex items-center gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-xs font-medium text-warn">
            <WifiOff className="size-4 shrink-0" />
            <span>{t('assistant.offline')}</span>
          </div>
        )}

        {messages.length === 0 && (
          <div className="space-y-4 rounded-2xl border border-border bg-surface-2/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">{t('assistant.suggestions')}</p>
            <div className="grid gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy || !online}
                  onClick={() => sendQuestion(s)}
                  className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-left text-sm font-medium text-ink transition hover:border-brand/50 hover:bg-brand-soft/20 cursor-pointer disabled:opacity-50"
                >
                  <span>{s}</span>
                  <ArrowUpRight className="size-4 shrink-0 text-brand" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={cx('flex flex-col gap-2', m.role === 'user' ? 'items-end' : 'items-start')}>
              <div
                className={cx(
                  'max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  m.role === 'user'
                    ? 'bg-brand text-brand-fg'
                    : m.error
                      ? 'border border-bad/30 bg-bad/10 text-bad'
                      : 'border border-border bg-surface text-ink shadow-xs',
                )}
              >
                <p className="whitespace-pre-line">{m.text}</p>
              </div>

              {m.cards && m.cards.length > 0 && (
                <div className="w-full space-y-2.5">
                  {m.cards.map((card) => (
                    <div key={card.id} className="rounded-2xl border border-border bg-surface p-3.5 shadow-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wider text-brand">{card.title}</div>
                          {card.subtitle && <div className="mt-0.5 text-xs text-muted">{card.subtitle}</div>}
                        </div>
                      </div>

                      {card.metrics && card.metrics.length > 0 && (
                        <div className="mt-2.5 grid grid-cols-3 gap-2">
                          {card.metrics.map((met) => (
                            <div key={met.label} className="rounded-xl bg-surface-2/70 px-2.5 py-2">
                              <div className="text-[10px] uppercase tracking-wide text-muted">{met.label}</div>
                              <div
                                className={cx(
                                  'mt-0.5 text-sm font-semibold tabular',
                                  met.tone === 'bad'
                                    ? 'text-bad'
                                    : met.tone === 'warn'
                                      ? 'text-warn'
                                      : met.tone === 'ok'
                                        ? 'text-ok'
                                        : met.tone === 'brand'
                                          ? 'text-brand'
                                          : 'text-ink',
                                )}
                              >
                                {met.value}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {card.items && card.items.length > 0 && (
                        <ul className="mt-2.5 divide-y divide-border/60 rounded-xl border border-border/70">
                          {card.items.map((item) => (
                            <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                              <div className="min-w-0 flex-1">
                                {item.href ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onClose();
                                      navigate(item.href!);
                                    }}
                                    className="block max-w-full truncate text-left font-medium text-ink hover:text-brand hover:underline cursor-pointer"
                                  >
                                    {item.title}
                                  </button>
                                ) : (
                                  <div className="truncate font-medium text-ink">{item.title}</div>
                                )}
                                {item.subtitle && <div className="truncate text-[11px] text-muted">{item.subtitle}</div>}
                              </div>
                              {item.badge && (
                                <Badge tone={item.badgeTone ?? 'neutral'} className="shrink-0">
                                  {item.badge}
                                </Badge>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      {card.link && (
                        <button
                          type="button"
                          onClick={() => openCardLink(card.link!)}
                          className="mt-3 flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-brand/10 px-3 py-2 text-xs font-semibold text-brand transition hover:bg-brand/20 cursor-pointer"
                        >
                          <span>{card.link.label}</span>
                          <ArrowUpRight className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {m.role === 'assistant' && !m.error && (
                <div className="flex w-full flex-wrap items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleFeedback(m.id, 'up')}
                      aria-label={t('assistant.feedback.up')}
                      title={t('assistant.feedback.up')}
                      className={cx(
                        'grid size-8 place-items-center rounded-lg border transition cursor-pointer',
                        m.feedback === 'up'
                          ? 'border-ok/40 bg-ok/15 text-ok'
                          : 'border-transparent text-muted hover:bg-surface-2 hover:text-ink',
                      )}
                    >
                      <ThumbsUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFeedback(m.id, 'down')}
                      aria-label={t('assistant.feedback.down')}
                      title={t('assistant.feedback.down')}
                      className={cx(
                        'grid size-8 place-items-center rounded-lg border transition cursor-pointer',
                        m.feedback === 'down'
                          ? 'border-warn/40 bg-warn/15 text-warn'
                          : 'border-transparent text-muted hover:bg-surface-2 hover:text-ink',
                      )}
                    >
                      <ThumbsDown className="size-3.5" />
                    </button>
                    {m.feedback && <span className="text-[11px] text-muted">{t('assistant.feedback.thanks')}</span>}
                  </div>
                  {m.usedTools && m.usedTools.length > 0 && (
                    <span className="text-[10px] text-muted">
                      Outils : {m.usedTools.join(', ')}
                    </span>
                  )}
                </div>
              )}

              {m.followUps && m.followUps.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {m.followUps.map((fUp) => (
                    <button
                      key={fUp}
                      type="button"
                      disabled={busy || !online}
                      onClick={() => sendQuestion(fUp)}
                      className="rounded-full border border-border bg-surface-2/60 px-3 py-1.5 text-left text-xs text-ink transition hover:border-brand/50 hover:bg-brand-soft/30 cursor-pointer disabled:opacity-50"
                    >
                      {fUp}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3 text-xs font-medium text-muted">
              <Spinner className="size-4 text-brand" />
              <span>{t(stepKey)}</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </Modal>
  );
}
