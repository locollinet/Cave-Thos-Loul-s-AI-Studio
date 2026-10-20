import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, ImagePlus, Trash2, Upload, Wine as WineIcon } from 'lucide-react';
import type { Wine } from '@/types';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Button, Modal, Spinner, cx, useToast } from '@/ui';
import {
  ImageError,
  PHOTO_MAX_CHARS,
  PHOTO_MAX_CHARS_LOCAL,
  PHOTO_MAX_EDGE,
  compressImage,
  wineImageDeleteOps,
  wineImageSetOps,
  type WineImageDoc,
} from '@/lib/image';

export type PhotoSource = 'camera' | 'upload';

/** Message traduit pour une erreur de préparation d'image. */
export const imageErrorKey = (e: unknown): string => `photos.err.${e instanceof ImageError ? e.code : 'decode'}`;

/** Limite de la photo stockée selon le magasin (plus léger en démo, localStorage). */
export function usePhotoLimit(): number {
  const { store } = useOrg();
  return store.mode === 'local' ? PHOTO_MAX_CHARS_LOCAL : PHOTO_MAX_CHARS;
}

/** Abonnement à la photo d'un vin, uniquement quand `enabled` (tiroir ouvert, vin marqué `hasImage`). */
export function useWineImage(wineId: string, enabled: boolean): { image: WineImageDoc | null; loading: boolean } {
  const { store, path } = useOrg();
  const p = path('wineImages', wineId);
  const [state, setState] = useState<{ key: string; image: WineImageDoc | null } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    return store.subscribeDoc<WineImageDoc>(
      p,
      (image) => setState({ key: p, image }),
      () => setState({ key: p, image: null }),
    );
  }, [store, p, enabled]);
  if (!enabled) return { image: null, loading: false };
  return state?.key === p ? { image: state.image, loading: false } : { image: null, loading: true };
}

/** Deux entrées fichier masquées : appareil photo (capture arrière) et import. */
export function PhotoInputs({
  onFile,
  disabled,
  children,
}: {
  onFile: (file: File, source: PhotoSource) => void;
  disabled?: boolean;
  children: (open: { take: () => void; upload: () => void }) => ReactNode;
}) {
  const cam = useRef<HTMLInputElement>(null);
  const up = useRef<HTMLInputElement>(null);
  const pick = (source: PhotoSource) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) onFile(file, source);
  };
  return (
    <>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={pick('camera')} disabled={disabled} />
      <input ref={up} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={pick('upload')} disabled={disabled} />
      {children({ take: () => cam.current?.click(), upload: () => up.current?.click() })}
    </>
  );
}

const iconBtn =
  'inline-flex size-9 items-center justify-center rounded-full bg-surface/90 text-ink shadow-sm ring-1 ring-border backdrop-blur transition hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50';

/** Photo du vin dans le tiroir : affichage, prise de vue, import, remplacement, suppression. */
export function WinePhoto({ wine, className }: { wine: Wine; className?: string }) {
  const { t } = useI18n();
  const { toast, confirm } = useToast();
  const { commit, path, can, member } = useOrg();
  const limit = usePhotoLimit();
  const canEdit = can('sommelier');
  const { image, loading } = useWineImage(wine.id, !!wine.hasImage);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);
  const alt = t('photos.alt', { name: `${wine.producer} ${wine.name} ${wine.vintage}`.trim() });

  const onFile = async (file: File, source: PhotoSource) => {
    setBusy(true);
    try {
      const img = await compressImage(file, { maxEdge: PHOTO_MAX_EDGE, maxChars: limit });
      try {
        await commit(wineImageSetOps(path, wine.id, { ...img, source, updatedBy: member?.uid }));
        toast(t('photos.saved'));
      } catch {
        toast(t('photos.saveError'), 'bad');
      }
    } catch (e) {
      toast(t(imageErrorKey(e)), 'bad');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({ title: t('photos.deleteTitle'), message: t('photos.deleteMsg'), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      await commit(wineImageDeleteOps(path, wine.id));
      toast(t('photos.deleted'));
    } catch {
      toast(t('photos.saveError'), 'bad');
    } finally {
      setBusy(false);
    }
  };

  const src = image?.dataUrl;
  if (!src && !loading && !canEdit) return null;

  return (
    <PhotoInputs onFile={onFile} disabled={busy}>
      {({ take, upload }) => (
        <figure className={cx('relative m-0 overflow-hidden rounded-lg border border-accent/40 bg-surface', className)} aria-busy={busy || loading}>
          {loading ? (
            <div className="size-full min-h-56 animate-pulse bg-surface-2" aria-label={t('common.loading')} />
          ) : src ? (
            <button type="button" onClick={() => setZoom(true)} className="block size-full focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand" aria-label={t('photos.view')}>
              <img src={src} alt={alt} className="size-full max-h-72 min-h-56 object-cover sm:max-h-none" />
            </button>
          ) : (
            <div className="flex size-full min-h-56 flex-col items-center justify-center gap-3 bg-[repeating-linear-gradient(135deg,transparent_0_10px,color-mix(in_oklab,var(--color-accent)_7%,transparent)_10px_11px)] px-4 py-6 text-center">
              <span className="inline-flex size-12 items-center justify-center rounded-full border border-accent/50 text-accent">
                <WineIcon className="size-5" aria-hidden />
              </span>
              <div>
                <p className="font-display text-lg italic leading-tight">{t('photos.add')}</p>
                <p className="mx-auto mt-1 max-w-[14rem] text-xs leading-snug text-muted">{t('photos.addHint')}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                <Button size="sm" icon={<Camera className="size-4" />} onClick={take} disabled={busy}>
                  {t('photos.take')}
                </Button>
                <Button size="sm" variant="ghost" icon={<Upload className="size-4" />} onClick={upload} disabled={busy}>
                  {t('photos.upload')}
                </Button>
              </div>
            </div>
          )}
          {src && canEdit && (
            <figcaption className="absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-gradient-to-t from-black/35 to-transparent p-2 pt-8">
              <button type="button" className={iconBtn} onClick={take} disabled={busy} aria-label={t('photos.retake')} title={t('photos.retake')}>
                <Camera className="size-4" />
              </button>
              <button type="button" className={iconBtn} onClick={upload} disabled={busy} aria-label={t('photos.replace')} title={t('photos.replace')}>
                <ImagePlus className="size-4" />
              </button>
              <button type="button" className={cx(iconBtn, 'text-bad')} onClick={remove} disabled={busy} aria-label={t('photos.delete')} title={t('photos.delete')}>
                <Trash2 className="size-4" />
              </button>
            </figcaption>
          )}
          {busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface/75 text-xs text-muted backdrop-blur-[1px]" role="status">
              <Spinner />
              {t('photos.processing')}
            </div>
          )}
          {zoom && src && (
            <Modal open size="xl" onClose={() => setZoom(false)} title={`${wine.producer} · ${wine.name} ${wine.vintage}`}>
              <img src={src} alt={alt} className="mx-auto max-h-[75dvh] w-auto rounded-lg object-contain" />
            </Modal>
          )}
        </figure>
      )}
    </PhotoInputs>
  );
}

/* ------------------------------------------------------------------ Vignette */

const thumbCache = new Map<string, Promise<string | null>>();
const THUMB_CACHE_MAX = 200;

/** Petite vignette pour les listes : ne charge la photo que lorsqu'elle devient visible ; rien si le vin n'a pas de photo. */
export function WineThumb({ wine, className }: { wine: Pick<Wine, 'id' | 'hasImage' | 'producer' | 'name' | 'vintage' | 'updatedAt'>; className?: string }) {
  const { t } = useI18n();
  const { store, path } = useOrg();
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const key = `${path('wineImages', wine.id)}@${wine.updatedAt}`;

  useEffect(() => {
    if (!wine.hasImage || visible) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return setVisible(true);
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [wine.hasImage, visible]);

  useEffect(() => {
    if (!visible || !wine.hasImage) return;
    let alive = true;
    let p = thumbCache.get(key);
    if (!p) {
      p = store
        .getDoc<WineImageDoc>(path('wineImages', wine.id))
        .then((d) => d?.dataUrl ?? null)
        .catch(() => null);
      thumbCache.set(key, p);
      if (thumbCache.size > THUMB_CACHE_MAX) thumbCache.delete(thumbCache.keys().next().value as string);
    }
    p.then((v) => alive && setSrc(v));
    return () => {
      alive = false;
    };
  }, [visible, wine.hasImage, wine.id, key, store, path]);

  if (!wine.hasImage) return null;
  return (
    <span ref={ref} className={cx('inline-block size-10 shrink-0 overflow-hidden rounded-md border border-border bg-surface-2', !src && 'animate-pulse', className)}>
      {src && <img src={src} alt={t('photos.alt', { name: `${wine.producer} ${wine.name} ${wine.vintage}`.trim() })} className="size-full object-cover" loading="lazy" decoding="async" />}
    </span>
  );
}
