import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useT } from '@/i18n';
import { useAuth } from '@/app/auth';
import { isFirebaseConfigured } from '@/data/firebase';
import { SW_UPDATE_EVENT, applyUpdate, hasPendingUpdate } from '@/lib/pwa';
import { cx } from '@/ui';

const subscribe = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

/** État réseau du navigateur (événements online/offline). */
export const useOnline = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

/** Vrai quand une nouvelle version du service worker attend (voir `SW_UPDATE_EVENT`). */
export function useAppUpdate(): [boolean, () => void] {
  const [pending, setPending] = useState(hasPendingUpdate);
  useEffect(() => {
    const on = () => setPending(true);
    window.addEventListener(SW_UPDATE_EVENT, on);
    return () => window.removeEventListener(SW_UPDATE_EVENT, on);
  }, []);
  return [pending, () => setPending(false)];
}

/**
 * Bandeau discret (dans le flux, pleine largeur) : hors ligne, retour du réseau, nouvelle version disponible.
 * À placer tout en haut du Layout. `local` force le message « données locales » (sinon déduit du mode démo / Firebase).
 */
export function OfflineBanner({ local, className }: { local?: boolean; className?: string }) {
  const t = useT();
  const { demo } = useAuth();
  const online = useOnline();
  const [back, setBack] = useState(false);
  const wasOffline = useRef(!online);
  const [update, dismissUpdate] = useAppUpdate();
  const isLocal = local ?? (demo || !isFirebaseConfigured());

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setBack(false);
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setBack(true);
    const id = setTimeout(() => setBack(false), 3500);
    return () => clearTimeout(id);
  }, [online]);

  if (online && !back && !update) return null;
  const bar = 'flex items-center justify-center gap-2 px-4 py-1.5 text-center text-[12.5px] leading-snug';

  return (
    <div className={cx('no-print', className)}>
      {!online ? (
        <div role="status" className={cx(bar, 'bg-[#2a1f22] text-[#f7f4ef]')}>
          <WifiOff className="size-3.5 shrink-0 text-[#c9a96a]" aria-hidden />
          <span>{t(isLocal ? 'offline.bannerDemo' : 'offline.banner')}</span>
        </div>
      ) : back ? (
        <div role="status" className={cx(bar, 'bg-ok/12 text-ok')}>
          <Wifi className="size-3.5 shrink-0" aria-hidden />
          <span>{t('offline.back')}</span>
        </div>
      ) : null}
      {update && (
        <div role="status" className={cx(bar, 'flex-wrap bg-brand-soft text-brand')}>
          <RefreshCw className="size-3.5 shrink-0" aria-hidden />
          <span>{t('pwa.update')}</span>
          <button type="button" onClick={applyUpdate} className="rounded-md px-2 py-0.5 font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-brand">
            {t('pwa.reload')}
          </button>
          <button type="button" onClick={dismissUpdate} className="rounded-md px-2 py-0.5 text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-brand">
            {t('pwa.later')}
          </button>
        </div>
      )}
    </div>
  );
}
