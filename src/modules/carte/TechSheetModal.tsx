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
          <div className="space-y-1.5 rounded-xl border border-border/70 bg-surface-2/60 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={sheet.confidence === 'high' ? 'ok' : sheet.confidence === 'medium' ? 'brand' : 'warn'}>
                {sheet.confidence === 'high'
                  ? 'Fiabilité Haute · Données AOP vérifiées'
                  : sheet.confidence === 'medium'
                    ? 'Fiabilité Moyenne · Repères d’appellation'
                    : 'Données partielles · Repères généraux'}
              </Badge>
              <span className="text-muted">Modèle léger & rapide · Garde-fous actifs</span>
            </div>
            {sheet.sources && (
              <p className="text-ink/80">
                <span className="font-medium text-muted">Sources : </span>
                {sheet.sources}
              </p>
            )}
            {sheet.missingInfo && sheet.missingInfo !== 'Aucune information manquante majeure' && (
              <p className="text-warn">
                <span className="font-medium">Éléments non inventés (non documentés) : </span>
                {sheet.missingInfo}
              </p>
            )}
            <p className="text-[11px] text-muted">
              {t('ai.disclaimer')} Les informations incertaines ont été laissées vierges ou indiquées « Non documenté » pour éviter toute invention.
            </p>
          </div>
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
