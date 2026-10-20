import { ArrowDown, ArrowUp } from 'lucide-react';
import type { Site } from '@/types';
import { useT } from '@/i18n';
import { Checkbox, Field, Input, NumberInput, Segmented, Select } from '@/ui';
import { GROUPINGS, LIST_KINDS, ROUNDINGS, type ListSection, type PublicListDoc, type Rounding, type WineList } from './types';
import { GLASS_KEY, PINNED_KEY, moveSection } from './build';
import { LanguagesPanel } from './LanguagesPanel';

interface Props {
  list: WineList;
  sites: Site[];
  sections: ListSection[];
  doc: Pick<PublicListDoc, 'name' | 'sections' | 'theme'>;
  onChange: (patch: Partial<WineList>) => void;
}

export function SettingsPanel({ list, sites, sections, doc, onChange }: Props) {
  const t = useT();
  const orderable = sections.map((s) => s.key).filter((k) => k !== PINNED_KEY && k !== GLASS_KEY);
  const titles = new Map(sections.map((s) => [s.key, s.title]));
  const toggleSite = (id: string, on: boolean) => onChange({ siteIds: on ? [...list.siteIds, id] : list.siteIds.filter((s) => s !== id) });

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('carte.set.name')} className="sm:col-span-2">
          <Input value={list.name} onChange={(e) => onChange({ name: e.target.value })} />
        </Field>
        <Field label={t('carte.set.kind')}>
          <Select value={list.kind} onChange={(e) => onChange({ kind: e.target.value as WineList['kind'] })}>
            {LIST_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`carte.kind.${k}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('carte.set.language')}>
          <Segmented
            value={list.language}
            onChange={(language) => onChange({ language })}
            options={[
              { value: 'fr', label: 'Français' },
              { value: 'en', label: 'English' },
            ]}
          />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-medium text-muted">{t('carte.set.sites')}</legend>
        <p className="text-xs text-muted">{list.siteIds.length ? t('carte.set.sitesSome') : t('carte.set.sitesAll')}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {sites.map((s) => (
            <Checkbox key={s.id} checked={list.siteIds.includes(s.id)} onChange={(v) => toggleSite(s.id, v)} label={s.name} />
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('carte.set.groupBy')}>
          <Select value={list.groupBy} onChange={(e) => onChange({ groupBy: e.target.value as WineList['groupBy'], sectionOrder: [] })}>
            {GROUPINGS.map((g) => (
              <option key={g} value={g}>
                {t(`carte.group.${g}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('carte.set.minStock')} hint={t('carte.set.minStockHint')}>
          <NumberInput min={1} value={list.minStock} onChange={(v) => onChange({ minStock: Math.max(1, v ?? 1) })} disabled={!list.hideOutOfStock} />
        </Field>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Checkbox checked={list.hideOutOfStock} onChange={(v) => onChange({ hideOutOfStock: v })} label={t('carte.set.hideOut')} />
        <Checkbox checked={list.showVintage} onChange={(v) => onChange({ showVintage: v })} label={t('carte.set.showVintage')} />
        <Checkbox checked={list.showFormat} onChange={(v) => onChange({ showFormat: v })} label={t('carte.set.showFormat')} />
        <Checkbox checked={list.showDescription} onChange={(v) => onChange({ showDescription: v })} label={t('carte.set.showDescription')} />
        <div className="sm:col-span-2">
          <Checkbox checked={list.showByGlass !== false} onChange={(v) => onChange({ showByGlass: v })} label={t('carte.set.showByGlass')} />
        </div>
      </div>

      <fieldset className="space-y-3 rounded-xl border border-border p-4">
        <legend className="px-1 text-xs font-medium text-muted">{t('carte.price.title')}</legend>
        <Segmented
          value={list.priceRule.mode}
          onChange={(mode) => onChange({ priceRule: { ...list.priceRule, mode } })}
          options={[
            { value: 'multiplier', label: t('carte.price.multiplier') },
            { value: 'fixed', label: t('carte.price.fixed') },
          ]}
        />
        <p className="text-xs text-muted">{t(list.priceRule.mode === 'multiplier' ? 'carte.price.multiplierHint' : 'carte.price.fixedHint')}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('carte.price.coef')}>
            <NumberInput
              step={0.1}
              min={0}
              value={list.priceRule.multiplier}
              disabled={list.priceRule.mode !== 'multiplier'}
              onChange={(v) => onChange({ priceRule: { ...list.priceRule, multiplier: v ?? 0 } })}
            />
          </Field>
          <Field label={t('carte.price.rounding')}>
            <Select value={list.priceRule.rounding} onChange={(e) => onChange({ priceRule: { ...list.priceRule, rounding: Number(e.target.value) as Rounding } })}>
              {ROUNDINGS.map((r) => (
                <option key={r} value={r}>
                  {t('carte.price.roundTo', { n: String(r).replace('.', ',') })}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-muted">{t('carte.set.order')}</legend>
        {orderable.length === 0 ? (
          <p className="text-sm text-muted">{t('carte.set.orderEmpty')}</p>
        ) : (
          <ol className="divide-y divide-border rounded-xl border border-border">
            {orderable.map((key, i) => (
              <li key={key} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                <span className="truncate">{titles.get(key)}</span>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={i === 0}
                    aria-label={t('carte.set.moveUp')}
                    onClick={() => onChange({ sectionOrder: moveSection(orderable, key, -1) })}
                    className="rounded-md p-1.5 text-muted hover:bg-surface-2 disabled:opacity-30"
                  >
                    <ArrowUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    disabled={i === orderable.length - 1}
                    aria-label={t('carte.set.moveDown')}
                    onClick={() => onChange({ sectionOrder: moveSection(orderable, key, 1) })}
                    className="rounded-md p-1.5 text-muted hover:bg-surface-2 disabled:opacity-30"
                  >
                    <ArrowDown className="size-4" />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </fieldset>

      <LanguagesPanel list={list} doc={doc} onChange={onChange} />
    </div>
  );
}
