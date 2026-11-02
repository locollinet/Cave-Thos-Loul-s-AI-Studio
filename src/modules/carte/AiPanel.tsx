import { useEffect, useState } from 'react';
import { ArrowUpRight, Sparkles, Utensils } from 'lucide-react';
import { useI18n, type TFn } from '@/i18n';
import { Button, Field, Input, Textarea } from '@/ui';
import { AiQuotaError, askSommelier } from './aiClient';
import type { PublicItem, SommelierAnswer } from './types';

const PROMPT_KEYS = ['carte.ai.p1', 'carte.ai.p2', 'carte.ai.p3'];

export function AiPanel({ sections, language, context = 'pro', onAnswer, embedded = false, t: tOverride, publicId }: { sections: { items: PublicItem[] }[]; language: 'fr' | 'en'; context?: 'guest' | 'pro'; onAnswer?: (answer: SommelierAnswer | null) => void; embedded?: boolean; t?: TFn; publicId?: string }) {
  const { t: uiT } = useI18n();
  const t = tOverride ?? uiT;
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState<SommelierAnswer | null>(null);
  const [dish, setDish] = useState('');
  const [budget, setBudget] = useState('');
  const [occasion, setOccasion] = useState('');
  const [health, setHealth] = useState<'loading' | 'ready' | 'unavailable' | 'unknown'>('loading');
  const flat = sections.flatMap((s) => s.items).slice(0, 150);
  const request = [
    dish.trim() && `${t('discover.dish')}: ${dish.trim()}`,
    budget && `${t('discover.budget')}: ${budget}`,
    occasion.trim() && `${t('discover.occasion')}: ${occasion.trim()}`,
    question.trim(),
  ].filter(Boolean).join('\n');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal }).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (typeof data.ai !== 'boolean') throw new Error('Invalid health response');
      setHealth(data.ai ? 'ready' : 'unavailable');
    }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setHealth('unknown');
    });
    return () => controller.abort();
  }, []);

  const ask = async (q: string) => {
    if (!q.trim() || !flat.length || busy) return;
    setBusy(true);
    setError('');
    setAnswer(null);
    onAnswer?.(null);
    try {
      const items = flat.map((i) => ({
        producer: i.producer,
        name: i.name,
        vintage: i.vintage,
        formatCl: i.formatCl,
        color: i.color,
        region: i.region,
        grapes: i.grapes,
        priceTTC: i.glassPriceTTC ?? i.priceTTC,
        note: i.glassPriceTTC !== undefined ? [`${language === 'en' ? 'by the glass' : 'au verre'}${i.glassCl ? ` ${i.glassCl} cl` : ''}`, i.note].filter(Boolean).join(' — ') : i.note,
      }));
      const result = await askSommelier(items, q.trim(), language, context, publicId);
      setAnswer(result);
      onAnswer?.(result);
    } catch (e) {
      setAnswer(null);
      setError(e instanceof AiQuotaError ? t('carte.public.quota') : e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={embedded ? 'text-ink' : 'overflow-hidden rounded-2xl border border-border bg-surface text-ink'}>
      {!embedded && <div className="relative overflow-hidden border-b border-border bg-surface-2/60 px-6 py-8">
        <Utensils aria-hidden className="absolute -right-4 top-3 size-40 -rotate-12 text-brand opacity-[0.05]" strokeWidth={0.7} />
        <p className="relative text-[10px] uppercase tracking-[0.3em] text-brand">{t('discover.aiEyebrow')}</p>
        <h2 className="relative mt-4 max-w-md font-display text-3xl leading-tight">{t('discover.aiTitle')}</h2>
        <p className="relative mt-3 max-w-lg text-sm leading-relaxed text-muted">{t('discover.aiHint')}</p>
        <p className="relative mt-5 text-xs text-muted">{t('discover.context', { n: flat.length })}</p>
      </div>}
      <div className="space-y-5 p-5 sm:p-6">
      {health === 'unavailable' && <p role="status" className="rounded-xl bg-warn/10 p-3 text-xs text-warn">{t('discover.aiUnavailable')}</p>}
      {health === 'unknown' && <p role="status" className="text-xs text-warn">{t('discover.aiUnknown')}</p>}
      <div className="flex flex-wrap gap-2">
        {PROMPT_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setQuestion(t(k));
              setDish('');
              setBudget('');
              setOccasion('');
            }}
            className="rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-2"
          >
            {t(k)}
          </button>
        ))}
      </div>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void ask(request); }}>
        <Field label={t('discover.dish')}><Input value={dish} maxLength={80} onChange={(e) => setDish(e.target.value)} placeholder={t('discover.dishHint')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('discover.budget')}><Input type="number" min={0} max={100000} step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} /></Field>
          <Field label={t('discover.occasion')}><Input value={occasion} maxLength={60} onChange={(e) => setOccasion(e.target.value)} placeholder={t('discover.occasionHint')} /></Field>
        </div>
        <Field label={t('discover.question')} error={request.length > 500 ? t('discover.requestTooLong') : undefined}><Textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t('carte.ai.placeholder')} maxLength={500} /></Field>
        <Button type="submit" variant="primary" icon={<Sparkles className="size-4" />} loading={busy} disabled={!request.trim() || request.length > 500 || !flat.length || health === 'unavailable'}>
          {t('carte.ai.ask')}<ArrowUpRight className="size-4" />
        </Button>
      </form>
      {!flat.length && <p className="text-sm text-muted">{t('carte.ai.noWines')}</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      {answer && (
        <div className="space-y-4 border-t border-border pt-5" aria-live="polite">
          <h3 className="font-display text-2xl">{t('discover.recommendations')}</h3>
          {answer.text && <p className="text-sm leading-relaxed text-muted">{answer.text}</p>}
          <ul className="space-y-2">
            {answer.picks.map((p, i) => {
              const w = p.index !== undefined ? flat[p.index] : undefined;
              return (
                <li key={i} className="rounded-xl border border-border bg-surface-2/40 p-5">
                  <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-brand">0{i + 1} {w && `· ${w.region ?? ''}`}</p>
                  <div className="font-display text-xl">{w ? `${w.producer} — ${w.name} ${w.vintage}` : p.name}</div>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{p.reason}</p>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted">{t(context === 'guest' ? 'ai.disclaimerGuest' : 'ai.disclaimer')}</p>
        </div>
      )}
      </div>
    </div>
  );
}
