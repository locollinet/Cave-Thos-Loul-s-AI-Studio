import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { TechnicalSheet, Wine } from '@/types';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Badge, Button, Field, Input, Modal, Textarea, useToast } from '@/ui';
import { wineLabel } from '@/lib/wine';
import { generateTechSheet } from './aiClient';

type SheetKey = Exclude<keyof TechnicalSheet, 'generatedByAI'>;
const FIELDS: { key: SheetKey; long?: boolean }[] = [
  { key: 'aop' },
  { key: 'lieuDit' },
  { key: 'sol' },
  { key: 'cepage' },
  { key: 'ageVignes' },
  { key: 'vinification', long: true },
  { key: 'elevage', long: true },
  { key: 'oeil' },
  { key: 'nez', long: true },
  { key: 'bouche', long: true },
  { key: 'temperatureService' },
  { key: 'garde' },
  { key: 'accords', long: true },
];

export function TechSheetModal({ wine, onClose }: { wine: Wine; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { commit, path } = useOrg();
  const { toast } = useToast();
  const [sheet, setSheet] = useState<TechnicalSheet>(wine.technicalSheet ?? {});
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      setSheet(await generateTechSheet(wine, locale));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const clean = Object.fromEntries(Object.entries(sheet).filter(([, v]) => v !== undefined && v !== ''));
      await commit([{ op: 'set', path: path('wines', wine.id), data: { technicalSheet: clean, updatedAt: Date.now() }, merge: true }]);
      toast(t('common.saved'));
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={t('carte.tech.title')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{wineLabel(wine)}</p>
          <Button variant="accent" size="sm" icon={<Sparkles className="size-4" />} loading={busy} onClick={generate}>
            {t('carte.tech.generate')}
          </Button>
        </div>
        {sheet.generatedByAI && (
          <p className="flex items-center gap-2 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
            <Badge tone="warn">{t('ai.badge')}</Badge>
            {t('ai.disclaimer')}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map(({ key, long }) => (
            <Field key={key} label={t(`carte.tech.${key}`)} className={long ? 'sm:col-span-2' : ''}>
              {long ? (
                <Textarea rows={2} value={sheet[key] ?? ''} onChange={(e) => setSheet({ ...sheet, [key]: e.target.value })} />
              ) : (
                <Input value={sheet[key] ?? ''} onChange={(e) => setSheet({ ...sheet, [key]: e.target.value })} />
              )}
            </Field>
          ))}
        </div>
      </div>
    </Modal>
  );
}
