import { Clock, EyeOff, Hourglass, Lightbulb, PackageMinus, Star, TrendingUp, Undo2, Wine as WineIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n';
import { Badge, Button, EmptyState, useToast } from '@/ui';
import { applySuggestion, type Suggestion, type SuggestionAction, type SuggestionKind } from './suggestions';
import type { WineList } from './types';

const KIND: Record<SuggestionKind, { tone: 'bad' | 'warn' | 'ok' | 'brand' | 'info'; icon: ReactNode }> = {
  lowStock: { tone: 'bad', icon: <PackageMinus className="size-3.5" /> },
  pastWindow: { tone: 'warn', icon: <Hourglass className="size-3.5" /> },
  dormant: { tone: 'info', icon: <Clock className="size-3.5" /> },
  window: { tone: 'ok', icon: <WineIcon className="size-3.5" /> },
  margin: { tone: 'brand', icon: <TrendingUp className="size-3.5" /> },
};

const ACTION_ICON: Record<SuggestionAction, ReactNode> = {
  pin: <Star className="size-4" />,
  remove: <EyeOff className="size-4" />,
  include: <Undo2 className="size-4" />,
};

interface Props {
  list: WineList;
  suggestions: Suggestion[];
  onChange: (patch: Partial<WineList>) => void;
}

export function SuggestionsPanel({ list, suggestions, onChange }: Props) {
  const { t, intl } = useI18n();
  const { toast } = useToast();
  const money = (n: number) => new Intl.NumberFormat(intl, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

  const reason = (s: Suggestion): string => {
    switch (s.kind) {
      case 'lowStock':
        return t('carte.sug.why.lowStock', { n: s.qty });
      case 'pastWindow':
        return t('carte.sug.why.pastWindow', { year: s.apogeeTo ?? '' });
      case 'dormant':
        return t(s.shown ? 'carte.sug.why.dormant' : 'carte.sug.why.dormantOff', { n: s.qty, days: s.idleDays ?? 0 });
      case 'window':
        return t('carte.sug.why.window', { from: s.apogeeFrom ?? '', to: s.apogeeTo ?? '' });
      default:
        return t('carte.sug.why.margin', { amount: money(s.marginHT ?? 0), rate: Math.round((s.marginRate ?? 0) * 100) });
    }
  };

  const act = (s: Suggestion, action: SuggestionAction) => {
    onChange(applySuggestion(list, s, action));
    toast(t(`carte.sug.done.${action}`));
  };

  const dismissed = list.dismissedSuggestions?.length ?? 0;

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 text-sm text-muted">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand" />
        <span>{t('carte.sug.intro')}</span>
      </p>
      {suggestions.length === 0 ? (
        <EmptyState title={t('carte.sug.empty')} hint={t('carte.sug.emptyHint')} />
      ) : (
        <ul className="space-y-2" aria-live="polite">
          {suggestions.map((s) => (
            <li key={s.id} className="rounded-xl border border-border bg-surface p-3.5">
              <div className="min-w-0">
                <Badge tone={KIND[s.kind].tone}>
                  <span className="inline-flex items-center gap-1">
                    {KIND[s.kind].icon}
                    {t(`carte.sug.kind.${s.kind}`)}
                  </span>
                </Badge>
                <div className="mt-2 truncate text-xs text-muted">{s.producer}</div>
                <div className="truncate text-sm font-medium">
                  {s.name} {s.vintage}
                </div>
              </div>
              <p className="mt-1.5 text-sm leading-snug">{reason(s)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {s.actions.map((a, i) => (
                  <Button key={a} size="sm" variant={i === 0 ? 'primary' : 'secondary'} icon={ACTION_ICON[a]} onClick={() => act(s, a)}>
                    {t(`carte.sug.${a}`)}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" onClick={() => onChange(applySuggestion(list, s, 'dismiss'))}>
                  {t('carte.sug.dismiss')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {dismissed > 0 && (
        <button type="button" onClick={() => onChange({ dismissedSuggestions: [] })} className="text-xs font-medium text-brand hover:underline">
          {t('carte.sug.restore', { n: dismissed })}
        </button>
      )}
    </div>
  );
}
