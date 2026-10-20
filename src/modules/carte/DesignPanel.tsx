import { useEffect, type ReactNode } from 'react';
import { Crown, PenLine } from 'lucide-react';
import type { BrandTheme } from '@/types';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Button, cx, useToast } from '@/ui';
import { FONTS, PRESETS, PRESET_IDS, ensureFonts } from '@/lib/brand';
import { BrandControls } from '@/components/BrandControls';
import { resolveListTheme } from './build';
import { LIST_TEMPLATES, type ListTemplate, type WineList } from './types';

function Swatch({ theme, label, hint, active, onClick, icon }: { theme: BrandTheme; label: string; hint: string; active: boolean; onClick: () => void; icon?: ReactNode }) {
  const { t } = useI18n();
  const { org } = useOrg();
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx('overflow-hidden rounded-xl border text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand', active ? 'border-brand ring-2 ring-brand/30' : 'border-border hover:border-muted')}
    >
      <div className="px-3 pb-3 pt-4" style={{ background: theme.background, color: theme.text, textAlign: theme.align }}>
        <div className="truncate text-[8px] uppercase tracking-[0.3em]" style={{ color: theme.accent, fontFamily: FONTS[theme.bodyFont].stack }}>
          {org.name}
        </div>
        <div className="mt-1 truncate text-lg leading-tight" style={{ fontFamily: FONTS[theme.headingFont].stack }}>
          {t('brand.sample.title')}
        </div>
        <div className={cx('mt-2 h-px w-10', theme.align === 'center' && 'mx-auto')} style={{ background: theme.accent }} />
      </div>
      <div className="flex items-center gap-1.5 bg-surface px-3 py-2">
        {icon}
        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold">{label}</span>
          <span className="block truncate text-[10px] text-muted">{hint}</span>
        </span>
      </div>
    </button>
  );
}

export function DesignPanel({ list, onChange }: { list: WineList; onChange: (patch: Partial<WineList>) => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { org, updateOrg, can } = useOrg();
  const theme = resolveListTheme(list, org);
  const mode: 'charter' | 'custom' | 'preset' = list.useBrand && org.brand ? 'charter' : list.theme ? 'custom' : 'preset';
  useEffect(() => ensureFonts(PRESET_IDS.flatMap((p) => [PRESETS[p].headingFont, PRESETS[p].bodyFont])), []);

  const saveCharter = async () => {
    await updateOrg({ brand: theme });
    onChange({ useBrand: true, theme: null });
    toast(t('brand.charterSaved'));
  };

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{t('brand.source')}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {org.brand && (
            <Swatch
              theme={org.brand}
              label={t('brand.charter')}
              hint={t('brand.charterHint')}
              active={mode === 'charter'}
              icon={<Crown className="size-3.5 shrink-0 text-brand" />}
              onClick={() => onChange({ useBrand: true, theme: null })}
            />
          )}
          {LIST_TEMPLATES.map((tp: ListTemplate) => (
            <Swatch
              key={tp}
              theme={PRESETS[tp]}
              label={t(`carte.tpl.${tp}`)}
              hint={t(`carte.tpl.${tp}.desc`)}
              active={mode === 'preset' && list.template === tp}
              onClick={() => onChange({ template: tp, theme: null, useBrand: false })}
            />
          ))}
          {mode === 'custom' && (
            <Swatch theme={theme} label={t('brand.custom')} hint={t('brand.customHint')} active icon={<PenLine className="size-3.5 shrink-0 text-brand" />} onClick={() => undefined} />
          )}
        </div>
        {!org.brand && <p className="mt-2 text-xs text-muted">{t('brand.noCharter')}</p>}
      </fieldset>

      <BrandControls value={theme} onChange={(next) => onChange({ theme: next, useBrand: false })} />

      {can('manager') && mode !== 'charter' && (
        <div className="border-t border-border pt-5">
          <Button variant="primary" icon={<Crown className="size-4" />} onClick={saveCharter}>
            {t('brand.saveCharter')}
          </Button>
        </div>
      )}
    </div>
  );
}
