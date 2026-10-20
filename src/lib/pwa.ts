// Enregistrement du service worker (production uniquement) et annonce des mises à jour en attente.

/** Événement `window` émis quand une nouvelle version du service worker attend : `detail.apply()` l'active puis recharge. */
export const SW_UPDATE_EVENT = 'lt:sw-update';
export interface SwUpdateDetail {
  apply: () => void;
}

let waitingWorker: ServiceWorker | null = null;
let reloadOnChange = false;

export const hasPendingUpdate = (): boolean => !!waitingWorker;

/** Active la version en attente ; la page se recharge dès qu'elle prend le contrôle. */
export function applyUpdate(): void {
  if (!waitingWorker) return;
  reloadOnChange = true;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}

function announce(worker: ServiceWorker): void {
  waitingWorker = worker;
  window.dispatchEvent(new CustomEvent<SwUpdateDetail>(SW_UPDATE_EVENT, { detail: { apply: applyUpdate } }));
}

/** Pages publiques (carte /p/, offre /o/) : consultées par des clients, pas d'invitation à installer l'outil interne. */
export const isGuestPage = (pathname: string): boolean => /^\/(p|o)\//.test(pathname);

export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  if (isGuestPage(location.pathname)) document.querySelector('link[rel="manifest"]')?.remove();

  const start = async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const next = reg.installing;
        next?.addEventListener('statechange', () => {
          if (next.state === 'installed' && navigator.serviceWorker.controller) announce(next);
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloadOnChange) return;
        reloadOnChange = false;
        location.reload();
      });

      // Les ressources chargées avant la prise de contrôle (1re visite) sont confiées au SW pour l'usage hors ligne.
      const ready = await navigator.serviceWorker.ready;
      const urls = performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((u) => u.startsWith(`${location.origin}/assets/`) || /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u));
      ready.active?.postMessage({ type: 'CACHE_URLS', urls });

      let lastCheck = Date.now();
      const check = () => {
        if (Date.now() - lastCheck < 10 * 60_000) return;
        lastCheck = Date.now();
        reg.update().catch(() => undefined);
      };
      document.addEventListener('visibilitychange', () => !document.hidden && check());
      setInterval(check, 60 * 60_000);
    } catch {
      /* SW indisponible (navigation privée, politique d'entreprise…) : l'application fonctionne en ligne. */
    }
  };
  if (document.readyState === 'complete') void start();
  else window.addEventListener('load', () => void start(), { once: true });
}
