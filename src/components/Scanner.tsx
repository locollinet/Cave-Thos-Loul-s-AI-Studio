import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { CameraOff, Flashlight, FlashlightOff, Keyboard, Loader2, RefreshCw, X } from 'lucide-react';
import { useT } from '@/i18n';
import { cx } from '@/ui';
import { normalizeBarcode } from '@/lib/barcode';

type Phase = 'starting' | 'engine' | 'live' | 'denied' | 'nocamera' | 'insecure' | 'busy' | 'error' | 'engineError';
type Detect = (video: HTMLVideoElement) => Promise<string | null>;

/** Délai pendant lequel un même code n'est pas recompté en mode continu (rafraîchi à chaque lecture). */
export const SAME_CODE_DEBOUNCE_MS = 1500;
const SCAN_INTERVAL_MS = 120;

interface NativeDetector {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}
interface NativeDetectorCtor {
  new (opts: { formats: string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

/** BarcodeDetector natif (Chrome Android, Chrome macOS/ChromeOS) ; sinon ZXing chargé à la demande. */
async function createDetector(onEngineLoading: () => void): Promise<Detect> {
  const BD = (globalThis as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
  if (BD) {
    try {
      const supported = (await BD.getSupportedFormats?.()) ?? [];
      const formats = ['ean_13', 'ean_8', 'upc_a'].filter((f) => supported.includes(f));
      if (formats.length) {
        const det = new BD({ formats });
        return async (v) => (await det.detect(v))[0]?.rawValue ?? null;
      }
    } catch {
      /* repli ZXing */
    }
  }
  onEngineLoading();
  const z = await import('@zxing/library');
  const hints = new Map<number, unknown>([
    [z.DecodeHintType.POSSIBLE_FORMATS, [z.BarcodeFormat.EAN_13, z.BarcodeFormat.EAN_8, z.BarcodeFormat.UPC_A]],
    [z.DecodeHintType.TRY_HARDER, true],
  ]);
  const reader = new z.MultiFormatOneDReader(hints as never);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (v) => {
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    if (!ctx || !vw || !vh) return null;
    // Bande centrale (là où se trouve le cadre), réduite à 720 px de large pour rester fluide.
    const sw = vw * 0.86;
    const sh = vh * 0.5;
    const scale = Math.min(1, 720 / sw);
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    ctx.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
    try {
      return reader.decode(new z.BinaryBitmap(new z.HybridBinarizer(new z.HTMLCanvasElementLuminanceSource(canvas))), hints as never).getText();
    } catch {
      return null;
    }
  };
}

let audio: AudioContext | null = null;
/** Bip discret + vibration (si disponibles) ; `bad` = double impulsion grave. */
export function scanFeedback(bad = false): void {
  try {
    navigator.vibrate?.(bad ? [70, 60, 70] : 50);
  } catch {
    /* non supporté */
  }
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audio ??= new Ctor();
    if (audio.state === 'suspended') void audio.resume();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const t0 = audio.currentTime;
    osc.type = 'sine';
    osc.frequency.value = bad ? 330 : 1320;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.08, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (bad ? 0.22 : 0.09));
    osc.connect(gain).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + 0.25);
  } catch {
    /* audio indisponible */
  }
}

const errorPhase = (e: unknown): Phase => {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return 'nocamera';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  return 'error';
};

const MESSAGE: Partial<Record<Phase, string>> = {
  denied: 'scan.denied',
  nocamera: 'scan.noCamera',
  insecure: 'scan.insecure',
  busy: 'scan.busy',
  error: 'scan.error',
  engineError: 'scan.engineError',
};

/**
 * Scanner plein écran : caméra arrière, cadre de visée, lampe si disponible, saisie manuelle de secours.
 * Mode simple : la caméra s'arrête au premier code valide puis `onResult` est appelé (le parent ferme).
 * Mode `continuous` : la caméra reste ouverte, chaque nouveau code déclenche `onResult` (même code ignoré 1,5 s).
 */
export function Scanner({
  open,
  onClose,
  onResult,
  continuous = false,
  title,
  feedback,
}: {
  open: boolean;
  onClose: () => void;
  /** Renvoyer `false` signale un code refusé (ex. inconnu) : retour sonore/vibration d'erreur. */
  onResult: (code: string) => void | boolean;
  continuous?: boolean;
  title?: string;
  /** Contenu affiché au-dessus de la saisie manuelle (ex. dernier vin compté). */
  feedback?: ReactNode;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const last = useRef<{ code: string; at: number } | null>(null);
  const done = useRef(false);
  const cb = useRef({ onResult, onClose, continuous });
  cb.current = { onResult, onClose, continuous };

  const [phase, setPhase] = useState<Phase>('starting');
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [torch, setTorch] = useState<boolean | null>(null); // null = non supportée
  const [manual, setManual] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const flashRef = useRef<HTMLSpanElement>(null);

  /** Code validé (caméra ou saisie). Renvoie false s'il est ignoré (anti-rebond). */
  const accept = useCallback((code: string, fromCamera: boolean): boolean => {
    const now = Date.now();
    if (fromCamera) {
      const prev = last.current;
      last.current = { code, at: now };
      if (prev && prev.code === code && now - prev.at < SAME_CODE_DEBOUNCE_MS) return false;
    }
    if (!cb.current.continuous) {
      if (done.current) return false;
      done.current = true;
    }
    const ok = cb.current.onResult(code) !== false;
    if (fromCamera || !ok) scanFeedback(!ok);
    if (ok && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) flashRef.current?.animate?.([{ opacity: 0.9 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' });
    return true;
  }, []);

  useEffect(() => {
    if (!open) return;
    done.current = false;
    last.current = null;
    setManual('');
    setInvalid(false);
    setManualOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    // Capture : Échap ferme le scanner sans fermer la fenêtre modale située dessous.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      cb.current.onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !visible) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stream: MediaStream | null = null;
    setPhase('starting');
    setTorch(null);

    const stopCamera = () => {
      stream?.getTracks().forEach((tr) => tr.stop());
      stream = null;
      trackRef.current = null;
      const v = videoRef.current;
      if (v) v.srcObject = null;
    };

    (async () => {
      if (!window.isSecureContext) return setPhase('insecure');
      if (!navigator.mediaDevices?.getUserMedia) return setPhase('nocamera');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (e) {
        if (!stopped) setPhase(errorPhase(e));
        return;
      }
      if (stopped) return stopCamera();
      const track = stream.getVideoTracks()[0];
      trackRef.current = track ?? null;
      const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
      if (caps.torch) setTorch(false);
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => undefined);
      }
      let detect: Detect;
      try {
        detect = await createDetector(() => !stopped && setPhase('engine'));
      } catch {
        if (!stopped) {
          stopCamera();
          setPhase('engineError');
        }
        return;
      }
      if (stopped) return;
      setPhase('live');
      const tick = async () => {
        if (stopped) return;
        const vid = videoRef.current;
        if (vid && vid.readyState >= 2 && !(done.current && !cb.current.continuous)) {
          const raw = await detect(vid).catch(() => null);
          const code = raw ? normalizeBarcode(raw) : null;
          if (code && !stopped && accept(code, true) && !cb.current.continuous) {
            stopCamera();
            return;
          }
        }
        if (!stopped) timer = setTimeout(tick, SCAN_INTERVAL_MS);
      };
      void tick();
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stopCamera();
    };
  }, [open, visible, attempt, accept]);

  const toggleTorch = async () => {
    const tr = trackRef.current;
    if (!tr || torch === null) return;
    try {
      await tr.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  };

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const code = normalizeBarcode(manual);
    if (!code) {
      setInvalid(true);
      scanFeedback(true);
      return;
    }
    setInvalid(false);
    setManual('');
    accept(code, false);
  };

  if (!open) return null;
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  const message = MESSAGE[phase];
  const failed = !!message;
  const showManual = manualOpen || failed;

  return createPortal(
    <div
      className="no-print fixed inset-0 z-[70] flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? t(continuous ? 'scan.titleContinuous' : 'scan.title')}
      // Le portail remonte les événements React vers les parents (formulaire, <label>…) : on les isole.
      onClick={stop}
      onMouseDown={stop}
      onPointerDown={stop}
      onKeyDown={stop}
    >
      <video ref={videoRef} playsInline muted autoPlay aria-hidden className={cx('absolute inset-0 size-full object-cover transition-opacity duration-300', phase === 'live' || phase === 'engine' ? 'opacity-100' : 'opacity-0')} />

      <div className="relative z-10 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 pb-6 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <button ref={closeRef} type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" aria-label={t('scan.close')}>
          <X className="size-5" />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-center font-display text-lg tracking-wide">{title ?? t(continuous ? 'scan.titleContinuous' : 'scan.title')}</h2>
        {torch !== null ? (
          <button
            type="button"
            onClick={toggleTorch}
            aria-pressed={torch}
            aria-label={t(torch ? 'scan.torchOff' : 'scan.torchOn')}
            className={cx('grid size-11 place-items-center rounded-full backdrop-blur focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white', torch ? 'bg-[#c9a96a] text-black' : 'bg-white/10 hover:bg-white/20')}
          >
            {torch ? <FlashlightOff className="size-5" /> : <Flashlight className="size-5" />}
          </button>
        ) : (
          <span className="size-11" />
        )}
      </div>

      <div className="relative z-0 flex min-h-0 flex-1 items-center justify-center px-6">
        {failed ? (
          <div className="max-w-sm text-center" role="alert">
            <CameraOff className="mx-auto mb-3 size-9 text-white/70" />
            <p className="text-[15px] leading-relaxed text-white/90">{t(message)}</p>
            {phase !== 'insecure' && phase !== 'nocamera' && (
              <button type="button" onClick={() => setAttempt((a) => a + 1)} className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/30 px-4 py-2 text-sm hover:bg-white/10">
                <RefreshCw className="size-4" />
                {t('scan.retry')}
              </button>
            )}
          </div>
        ) : (
          <div className="relative aspect-[16/10] w-[min(82vw,24rem)] rounded-2xl shadow-[0_0_0_100vmax_rgba(0,0,0,0.5)]" aria-hidden>
            {(['left-0 top-0 border-l-2 border-t-2 rounded-tl-2xl', 'right-0 top-0 border-r-2 border-t-2 rounded-tr-2xl', 'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-2xl', 'bottom-0 right-0 border-b-2 border-r-2 rounded-br-2xl'] as const).map((c) => (
              <span key={c} className={cx('absolute size-8 border-[#c9a96a]', c)} />
            ))}
            {phase === 'live' && <span className="absolute inset-x-6 top-1/2 h-px bg-[#e05a6e] shadow-[0_0_10px_2px_rgba(224,90,110,0.6)] motion-safe:animate-pulse" />}
            <span ref={flashRef} className="absolute inset-0 rounded-2xl border-2 border-[#c9a96a] bg-[#c9a96a]/15 opacity-0" />
            {(phase === 'starting' || phase === 'engine') && (
              <span className="absolute inset-0 grid place-items-center">
                <Loader2 className="size-7 animate-spin text-white/80" />
              </span>
            )}
          </div>
        )}
      </div>

      <div className="relative z-10 space-y-3 bg-gradient-to-t from-black/85 via-black/70 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-8">
        <p className="text-center text-sm text-white/80" aria-live="polite">
          {phase === 'starting' ? t('scan.starting') : phase === 'engine' ? t('scan.loadingEngine') : failed ? '' : t(continuous ? 'scan.hintContinuous' : 'scan.hint')}
        </p>
        {feedback && <div aria-live="polite">{feedback}</div>}
        {showManual ? (
          <form onSubmit={submitManual} className="mx-auto flex max-w-md gap-2">
            <label className="sr-only" htmlFor="lt-scan-manual">
              {t('scan.manual')}
            </label>
            <input
              id="lt-scan-manual"
              value={manual}
              onChange={(e) => {
                setManual(e.target.value);
                setInvalid(false);
              }}
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="done"
              autoFocus={manualOpen}
              placeholder={t('scan.manualPlaceholder')}
              aria-invalid={invalid}
              aria-describedby={invalid ? 'lt-scan-invalid' : undefined}
              className={cx('tabular h-12 min-w-0 flex-1 rounded-xl border bg-white/10 px-4 text-base tracking-wider text-white placeholder:tracking-normal placeholder:text-white/50 focus:outline-none focus:ring-2', invalid ? 'border-[#ff8a8a] focus:ring-[#ff8a8a]/40' : 'border-white/25 focus:border-white/60 focus:ring-white/20')}
            />
            <button type="submit" disabled={!manual.trim()} className="h-12 rounded-xl bg-white px-5 text-sm font-semibold text-black transition active:scale-[0.98] disabled:opacity-40">
              {t('scan.manualSubmit')}
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setManualOpen(true)} className="mx-auto flex items-center gap-2 rounded-full px-4 py-2 text-sm text-white/85 hover:bg-white/10">
            <Keyboard className="size-4" />
            {t('scan.manual')}
          </button>
        )}
        {invalid && (
          <p id="lt-scan-invalid" role="alert" className="text-center text-sm text-[#ffb4b4]">
            {t('scan.invalid')}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
