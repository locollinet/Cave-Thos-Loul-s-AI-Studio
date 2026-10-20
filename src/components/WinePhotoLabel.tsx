import { useEffect, useState } from 'react';
import { Camera, Check, RotateCcw, ScanText, Sparkles, Upload, X } from 'lucide-react';
import type { Wine, WineColor } from '@/types';
import { useI18n } from '@/i18n';
import { apiPost } from '@/lib/api';
import { formatLabel } from '@/lib/wine';
import { Badge, Button, Checkbox, Spinner, cx } from '@/ui';
import { LABEL_MAX_CHARS, LABEL_MAX_EDGE, PHOTO_MAX_EDGE, compressImageVariants, splitDataUrl, type CompressedImage } from '@/lib/image';
import { PhotoInputs, imageErrorKey, usePhotoLimit, type PhotoSource } from './WinePhoto';

/** Champs proposés par la lecture d'étiquette, dans l'ordre d'affichage (miroir de server/labelInput.ts). */
export const LABEL_FORM_FIELDS = ['producer', 'name', 'appellation', 'vintage', 'color', 'region', 'subRegion', 'country', 'grapes', 'abv', 'formatCl'] as const;
export type LabelFormField = (typeof LABEL_FORM_FIELDS)[number];

export interface LabelProposal {
  isWineLabel: boolean;
  fields: Partial<Record<LabelFormField | 'cuvee', string | number | null>>;
  uncertain: string[];
}

export interface PendingPhoto extends CompressedImage {
  source: 'camera' | 'upload' | 'label';
  keep: boolean;
}

/** Classe une erreur d'appel IA en message utilisateur (clé i18n). */
export function aiErrorKey(message: string): string {
  if (/GEMINI_API_KEY|\b(404|501|503)\b|non configur/i.test(message)) return 'photos.ai.noKey';
  if (/\b429\b|quota|limite|trop de requ/i.test(message)) return 'photos.ai.quota';
  return 'photos.ai.failed';
}

let health: Promise<boolean> | null = null;
/** Le serveur indique s'il dispose d'une clé IA (/api/health) : évite un appel voué à l'échec. */
const aiConfigured = (): Promise<boolean> =>
  (health ??= fetch('/api/health')
    .then((r) => (r.ok ? r.json() : {}))
    .then((j: { ai?: unknown }) => j.ai !== false)
    .catch(() => true));

const same = (a: unknown, b: unknown) =>
  typeof a === 'string' && typeof b === 'string' ? a.trim().toLowerCase() === b.trim().toLowerCase() : a === b;

type Phase = 'idle' | 'preparing' | 'reading' | 'done' | 'error';

/**
 * « Remplir depuis une photo d'étiquette » : prise de vue → compression → lecture IA → proposition champ par champ.
 * La photo reste jointe (à enregistrer comme photo du vin) même si l'IA est indisponible.
 */
export function LabelScan({
  form,
  isEmpty,
  onApply,
  photo,
  onPhoto,
  canKeepPhoto,
  hasExistingImage,
  onPreparing,
}: {
  form: Wine;
  isEmpty: (k: LabelFormField) => boolean;
  onApply: (patch: Partial<Wine>) => void;
  photo: PendingPhoto | null;
  onPhoto: (p: PendingPhoto | null) => void;
  canKeepPhoto: boolean;
  hasExistingImage: boolean;
  /** Vrai pendant la compression : la photo n'est pas encore jointe, l'enregistrement doit attendre. */
  onPreparing?: (preparing: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const limit = usePhotoLimit();
  const [phase, setPhase] = useState<Phase>('idle');
  const [aiImage, setAiImage] = useState<CompressedImage | null>(null);
  const [proposal, setProposal] = useState<LabelProposal | null>(null);
  const [error, setError] = useState('');
  const [retryable, setRetryable] = useState(false);
  const [applied, setApplied] = useState<Set<LabelFormField>>(new Set());
  const [overwrite, setOverwrite] = useState(false);

  const read = async (img: CompressedImage) => {
    setPhase('reading');
    setProposal(null);
    setApplied(new Set());
    setError('');
    const parts = splitDataUrl(img.dataUrl);
    try {
      if (!(await aiConfigured())) throw new Error('GEMINI_API_KEY');
      const res = await apiPost<LabelProposal>('/api/ai/label', { imageBase64: parts?.base64 ?? '', mimeType: parts?.mimeType ?? img.mimeType, language: locale });
      setProposal(res);
      setPhase('done');
    } catch (e) {
      const key = aiErrorKey((e as Error)?.message ?? '');
      setError(t(key));
      setRetryable(key !== 'photos.ai.noKey');
      setPhase('error');
    }
  };

  const onFile = async (file: File, source: PhotoSource) => {
    setPhase('preparing');
    setError('');
    setProposal(null);
    try {
      const [stored, forAi] = await compressImageVariants(file, [
        { maxEdge: PHOTO_MAX_EDGE, maxChars: limit },
        { maxEdge: LABEL_MAX_EDGE, maxChars: LABEL_MAX_CHARS },
      ]);
      onPhoto({ ...stored, source: source === 'camera' ? 'camera' : 'label', keep: canKeepPhoto });
      setAiImage(forAi);
      await read(forAi);
    } catch (e) {
      setError(t(imageErrorKey(e)));
      setRetryable(false);
      setPhase('error');
      setAiImage(null);
    }
  };

  const valueOf = (k: LabelFormField) => proposal?.fields[k] ?? null;
  const rows = LABEL_FORM_FIELDS.filter((k) => valueOf(k) !== null && valueOf(k) !== '');
  const isUncertain = (k: LabelFormField) => !!proposal?.uncertain.includes(k);
  const isSame = (k: LabelFormField) => same(form[k], valueOf(k));

  const apply = (keys: LabelFormField[]) => {
    if (!keys.length) return;
    const patch: Partial<Record<LabelFormField, unknown>> = {};
    for (const k of keys) patch[k] = valueOf(k);
    onApply(patch as Partial<Wine>);
    setApplied((s) => new Set([...s, ...keys]));
  };
  const applyAllKeys = rows.filter((k) => !isUncertain(k) && !isSame(k) && !applied.has(k) && (overwrite || isEmpty(k)));

  const display = (k: LabelFormField, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '';
    if (k === 'color') return t(`color.${v as WineColor}`);
    if (k === 'formatCl') return formatLabel(Number(v));
    if (k === 'abv') return t('photos.abvValue', { n: Number(v).toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR') });
    return String(v);
  };
  const label = (k: LabelFormField): string =>
    ({
      producer: t('wines.producer'),
      name: t('wines.cuvee'),
      appellation: 'Appellation',
      vintage: t('wines.vintage'),
      color: t('wines.color'),
      region: t('wines.region'),
      subRegion: t('discover.subRegion'),
      country: t('wines.country'),
      grapes: t('wines.grapes'),
      abv: t('photos.abv'),
      formatCl: t('wines.format'),
    })[k];

  const busy = phase === 'preparing' || phase === 'reading';
  useEffect(() => onPreparing?.(phase === 'preparing'), [phase, onPreparing]);

  return (
    <section className="rounded-xl border border-accent/40 bg-surface-2/40 p-3 sm:p-4" aria-labelledby="label-scan-title" aria-busy={busy}>
      <PhotoInputs onFile={onFile} disabled={busy}>
        {({ take, upload }) => (
          <div className="flex flex-wrap items-start gap-3">
            {photo ? (
              <img src={photo.dataUrl} alt="" className="h-20 w-16 shrink-0 rounded-md border border-border object-cover" />
            ) : (
              <span className="inline-flex h-20 w-16 shrink-0 items-center justify-center rounded-md border border-dashed border-accent/60 text-accent" aria-hidden>
                <ScanText className="size-6" />
              </span>
            )}
            <div className="min-w-0 flex-1 basis-48">
              <h3 id="label-scan-title" className="font-display text-lg leading-tight">
                {t('photos.label.title')}
              </h3>
              <p className="mt-0.5 text-xs leading-snug text-muted">{t('photos.label.hint')}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button size="sm" icon={<Camera className="size-4" />} onClick={take} disabled={busy}>
                  {photo ? t('photos.label.again') : t('photos.take')}
                </Button>
                <Button size="sm" variant="ghost" icon={<Upload className="size-4" />} onClick={upload} disabled={busy}>
                  {t('photos.upload')}
                </Button>
                {phase === 'error' && aiImage && retryable && (
                  <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => read(aiImage)}>
                    {t('photos.label.retry')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </PhotoInputs>

      {busy && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted" role="status">
          <Spinner /> {phase === 'preparing' ? t('photos.processing') : t('photos.label.reading')}
        </p>
      )}

      {phase === 'error' && (
        <div className="mt-3 rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn" role="alert">
          <p className="font-medium">{error}</p>
          {photo && <p className="mt-0.5 text-xs">{t('photos.ai.keepPhoto')}</p>}
        </div>
      )}

      {phase === 'done' && proposal && (
        <div className="mt-3">
          {rows.length === 0 || !proposal.isWineLabel ? (
            <p className="rounded-lg bg-surface p-3 text-sm text-muted" role="status">
              {!proposal.isWineLabel ? t('photos.label.notLabel') : t('photos.label.nothing')}
            </p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted">
                  <Sparkles className="size-3.5 text-accent" aria-hidden /> {t('photos.label.proposal')}
                </p>
                <Button size="sm" variant="primary" icon={<Check className="size-4" />} onClick={() => apply(applyAllKeys)} disabled={!applyAllKeys.length}>
                  {t('photos.label.applyAll')}
                </Button>
              </div>
              <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-surface">
                {rows.map((k) => {
                  const cur = display(k, form[k]);
                  const next = display(k, valueOf(k));
                  const done = applied.has(k) && isSame(k);
                  return (
                    <li key={k} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                      <span className="w-full text-[11px] uppercase tracking-[0.12em] text-muted sm:w-32 sm:shrink-0">{label(k)}</span>
                      <span className="min-w-0 flex-1">
                        {!isSame(k) && (
                          <span className={cx('mr-2 text-muted', cur && 'line-through decoration-muted/60')}>{cur || <em className="not-italic opacity-70">{t('photos.label.empty')}</em>}</span>
                        )}
                        {!isSame(k) && <span className="mr-2 text-muted" aria-hidden>→</span>}
                        <span className="font-medium">{next}</span>
                        {isUncertain(k) && (
                          <Badge tone="warn" className="ml-2 align-middle">
                            {t('photos.label.uncertain')}
                          </Badge>
                        )}
                      </span>
                      {isSame(k) ? (
                        <span className="inline-flex items-center gap-1 text-xs text-ok">
                          <Check className="size-3.5" aria-hidden /> {done ? t('photos.label.applied') : t('photos.label.same')}
                        </span>
                      ) : (
                        <Button size="sm" onClick={() => apply([k])} aria-label={`${t('photos.label.apply')} — ${label(k)}`}>
                          {t('photos.label.apply')}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>{t('photos.label.applyAllHint')}</span>
                <Checkbox checked={overwrite} onChange={setOverwrite} label={<span className="text-xs">{t('photos.label.overwrite')}</span>} />
              </div>
              <p className="mt-2 text-xs text-warn">{t('photos.label.disclaimer')}</p>
            </>
          )}
        </div>
      )}

      {photo && canKeepPhoto && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <Checkbox
            checked={photo.keep}
            onChange={(keep) => onPhoto({ ...photo, keep })}
            label={
              <span className="text-sm">
                {t('photos.keep')}
                {hasExistingImage && photo.keep && <span className="ml-1 text-xs text-muted">{t('photos.keepReplace')}</span>}
              </span>
            }
          />
          <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => { onPhoto(null); setAiImage(null); setProposal(null); setPhase('idle'); }} disabled={busy}>
            {t('photos.remove')}
          </Button>
        </div>
      )}
    </section>
  );
}
