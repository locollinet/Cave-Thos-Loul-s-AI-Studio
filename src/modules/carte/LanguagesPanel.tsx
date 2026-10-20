import { useEffect, useMemo, useState } from 'react';
import { Languages, Sparkles } from 'lucide-react';
import { useT } from '@/i18n';
import { Button, Checkbox, Input, Segmented, Textarea } from '@/ui';
import { AiQuotaError, AiUnavailableError, translateTexts } from './aiClient';
import { EXTRA_LANGS, LANG_NAMES, normalizeLanguages, type ContentLang } from './content';
import { mergeTranslations, translatableTexts, translationTargets } from './translate';
import type { PublicListDoc, WineList } from './types';

type Health = 'loading' | 'ready' | 'unavailable' | 'unknown';
type Notice = { tone: 'ok' | 'warn' | 'bad'; text: string } | null;

/** Langues proposées, traduction IA et saisie manuelle des textes libres de la carte. */
export function LanguagesPanel({ list, doc, onChange }: { list: WineList; doc: Pick<PublicListDoc, 'name' | 'sections' | 'theme'>; onChange: (patch: Partial<WineList>) => void }) {
  const t = useT();
  const targets = translationTargets(list);
  const [picked, setPicked] = useState<ContentLang>(targets[0]);
  const target = targets.includes(picked) ? picked : targets[0];
  const texts = useMemo(() => translatableTexts(doc), [doc]);
  const [health, setHealth] = useState<Health>('loading');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const languages = normalizeLanguages(list.languages);
  const dict = list.translations?.[target] ?? {};
  const done = texts.filter((x) => dict[x.key]?.trim()).length;

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/health', { signal: ctrl.signal })
      .then(async (r) => {
        const j = (await r.json()) as { ai?: unknown };
        setHealth(j.ai === true ? 'ready' : j.ai === false ? 'unavailable' : 'unknown');
      })
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setHealth('unknown');
      });
    return () => ctrl.abort();
  }, []);

  const toggle = (l: (typeof EXTRA_LANGS)[number], on: boolean) => onChange({ languages: normalizeLanguages(on ? [...languages, l] : languages.filter((x) => x !== l)) });

  const setText = (key: string, value: string) => {
    const cur = { ...dict };
    if (value.trim()) cur[key] = value;
    else delete cur[key];
    const next = { ...(list.translations ?? {}) };
    if (Object.keys(cur).length) next[target] = cur;
    else delete next[target];
    onChange({ translations: next });
  };

  const translate = async () => {
    const missing = texts.filter((x) => !dict[x.key]?.trim());
    const batch = (missing.length ? missing : texts).map(({ key, text }) => ({ key, text }));
    if (!batch.length) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await translateTexts(target, list.language, batch);
      if (!res.length) setNotice({ tone: 'warn', text: t('carte.lang.aiNone') });
      else {
        onChange({ translations: mergeTranslations(list.translations, target, res) });
        setNotice({ tone: 'ok', text: t('carte.lang.aiDone', { n: res.length }) });
      }
    } catch (e) {
      if (e instanceof AiUnavailableError) {
        setHealth('unavailable');
        setNotice(null);
      } else setNotice({ tone: 'bad', text: e instanceof AiQuotaError ? t('carte.lang.aiQuota') : e instanceof Error && e.message ? e.message : t('common.error') });
    } finally {
      setBusy(false);
    }
  };

  const tone = (n: NonNullable<Notice>['tone']) => (n === 'ok' ? 'bg-ok/10 text-ok' : n === 'warn' ? 'bg-warn/10 text-warn' : 'bg-bad/10 text-bad');

  return (
    <fieldset className="space-y-4 rounded-xl border border-border p-4">
      <legend className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted">
        <Languages className="size-3.5" />
        {t('carte.lang.title')}
      </legend>
      <p className="text-xs text-muted">{t('carte.lang.hint')}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {EXTRA_LANGS.map((l) => (
          <Checkbox key={l} checked={languages.includes(l)} onChange={(v) => toggle(l, v)} label={<span lang={l}>{LANG_NAMES[l]}</span>} />
        ))}
      </div>
      <p className="text-xs text-muted">{t('carte.lang.builtin')}</p>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="text-xs font-medium text-muted">{t('carte.lang.target')}</div>
        <Segmented value={target} onChange={setPicked} options={targets.map((l) => ({ value: l, label: LANG_NAMES[l] }))} />
        {texts.length === 0 ? (
          <p className="text-sm text-muted">{t('carte.lang.noTexts')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted" aria-live="polite">
                {t('carte.lang.progress', { done, total: texts.length })}
              </span>
              <Button size="sm" variant="primary" icon={<Sparkles className="size-4" />} loading={busy} disabled={health === 'unavailable' || health === 'loading'} onClick={translate}>
                {t('carte.lang.ai')}
              </Button>
            </div>
            {health === 'unavailable' && (
              <p role="status" className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
                {t('carte.lang.aiUnavailable')}
              </p>
            )}
            {notice && (
              <p role={notice.tone === 'bad' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-xs ${tone(notice.tone)}`}>
                {notice.text}
              </p>
            )}
            <ul className="space-y-3">
              {texts.map((x) => {
                const long = x.kind === 'note' || x.kind === 'footer' || x.text.length > 80;
                const label = `${t(`carte.lang.kind.${x.kind}`)} — ${LANG_NAMES[target]}`;
                return (
                  <li key={x.key} className="space-y-1">
                    <div className="text-[11px] uppercase tracking-wider text-muted">{t(`carte.lang.kind.${x.kind}`)}</div>
                    <p className="text-sm text-ink/80">{x.text}</p>
                    {long ? (
                      <Textarea rows={2} lang={target} aria-label={label} placeholder={t('carte.lang.placeholder')} value={dict[x.key] ?? ''} onChange={(e) => setText(x.key, e.target.value)} />
                    ) : (
                      <Input lang={target} aria-label={label} placeholder={t('carte.lang.placeholder')} value={dict[x.key] ?? ''} onChange={(e) => setText(x.key, e.target.value)} />
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </fieldset>
  );
}
