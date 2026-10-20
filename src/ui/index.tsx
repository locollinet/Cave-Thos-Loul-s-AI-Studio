import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, CheckCircle2, Info, Loader2, Search, TriangleAlert, X } from 'lucide-react';

export const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ Button */

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type BtnSize = 'sm' | 'md' | 'lg';

const BTN_V: Record<BtnVariant, string> = {
  primary: 'bg-brand text-brand-fg hover:opacity-90 shadow-sm',
  secondary: 'bg-surface text-ink border border-border hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'bg-bad text-white hover:opacity-90',
  accent: 'bg-accent text-black hover:opacity-90',
};
const BTN_S: Record<BtnSize, string> = {
  sm: 'h-8 px-2.5 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      {...p}
      disabled={disabled || loading}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        BTN_V[variant],
        BTN_S[size],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ Fields */

const FIELD =
  'rounded-lg border border-border bg-surface px-3 text-sm text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-60';

const wFull = (c?: string) => (c && /(^|\s)w-/.test(c) ? '' : 'w-full');

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(FIELD, wFull(className), 'h-10', className)} />;
}
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...p} className={cx(FIELD, wFull(className), 'h-10 pr-8', className)}>
      {children}
    </select>
  );
}
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx(FIELD, wFull(className), 'min-h-20 py-2', className)} />;
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block space-y-1', className)}>
      <span className="block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted/80">{hint}</span>}
      {error && <span className="block text-xs text-bad">{error}</span>}
    </label>
  );
}

export function NumberInput({
  value,
  onChange,
  ...p
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <Input
      {...p}
      type="number"
      inputMode="decimal"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    />
  );
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" />
    </div>
  );
}

/* ------------------------------------------------------------------ Layout bits */

export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...p} className={cx('min-w-0 rounded-xl border border-border bg-surface', className)}>
      {children}
    </div>
  );
}

const NestedHeaderCtx = createContext(false);
/** Les en-têtes de page imbriqués (sous les onglets d'un module) deviennent des titres de section. */
export function NestedHeaders({ children }: { children: ReactNode }) {
  return <NestedHeaderCtx.Provider value>{children}</NestedHeaderCtx.Provider>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  const nested = useContext(NestedHeaderCtx);
  const Heading = nested ? 'h2' : 'h1';
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <Heading className={cx('font-display tracking-tight', nested ? 'text-2xl md:text-[1.75rem]' : 'text-3xl md:text-4xl')}>{title}</Heading>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'bad' | 'info' | 'accent';
const DOT: Record<Tone, string> = {
  neutral: '',
  brand: 'bg-brand',
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
  info: 'bg-info',
  accent: 'bg-accent',
};
/** Statut discret : point de couleur + libellé (le texte porte le sens, la couleur le confirme). */
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-[11px] font-medium',
        tone === 'neutral' ? 'text-muted' : tone === 'bad' ? 'text-bad' : 'text-ink',
        className,
      )}
    >
      {tone !== 'neutral' && <span aria-hidden className={cx('size-1.5 shrink-0 rounded-full', DOT[tone])} />}
      {children}
    </span>
  );
}

export function Stat({ label, value, sub, tone, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
        <span>{label}</span>
        {icon}
      </div>
      <div className={cx('tabular mt-2 font-display text-[2rem] leading-none', tone === 'bad' && 'text-bad', tone === 'warn' && 'text-warn', tone === 'ok' && 'text-ok')}>{value}</div>
      {sub && <div className="mt-1.5 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-14 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <div className="font-medium">{title}</div>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-muted', className)} />;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cx('inline-flex max-w-full flex-wrap rounded-lg bg-surface-2 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('rounded-md px-3 py-1.5 text-[13px] font-medium transition', value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <span className={cx('grid size-4.5 place-items-center rounded border transition', checked ? 'border-brand bg-brand text-brand-fg' : 'border-border bg-surface')}>
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/* ------------------------------------------------------------------ Modal / Drawer */

const modalStack: string[] = [];

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  side = false,
  sheet = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  side?: boolean; // tiroir latéral
  sheet?: boolean; // panneau montant depuis le bas sur mobile, tiroir latéral à partir de md
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    // Pile des fenêtres ouvertes : Échap ne ferme que celle du dessus.
    modalStack.push(titleId);
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === titleId) {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', h);
    return () => {
      document.removeEventListener('keydown', h);
      modalStack.splice(modalStack.lastIndexOf(titleId), 1);
    };
  }, [open, onClose, titleId]);
  if (!open) return null;
  const w = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  const mdW = { sm: 'md:max-w-sm', md: 'md:max-w-lg', lg: 'md:max-w-2xl', xl: 'md:max-w-4xl' }[size];
  return createPortal(
    <div className="no-print fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined}>
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cx(
          'animate-in relative flex max-h-full w-full flex-col bg-surface shadow-2xl',
          sheet
            ? `mt-auto max-h-[88dvh] rounded-t-2xl border-t border-border md:ml-auto md:mt-0 md:h-full md:max-h-full md:rounded-none md:border-l md:border-t-0 ${mdW}`
            : side
              ? `ml-auto h-full ${w} border-l border-border`
              : `m-auto max-h-[92dvh] ${w} rounded-2xl border border-border`,
        )}
      >
        {sheet && <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-border md:hidden" />}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 id={titleId} className="font-display text-xl">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2" aria-label="Fermer">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-2/50 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ Toasts & confirm */

interface ToastAction {
  label: string;
  onClick: () => void;
}
interface Toast {
  id: number;
  tone: 'ok' | 'bad' | 'info';
  text: string;
  action?: ToastAction;
}
interface ToastApi {
  /** `action` ajoute un bouton (ex. « Annuler ») ; la notification reste alors affichée 7 s. */
  toast: (text: string, tone?: Toast['tone'], action?: ToastAction) => void;
  confirm: (opts: { title: string; message?: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
}
const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dlg, setDlg] = useState<{ title: string; message?: string; confirmLabel?: string; danger?: boolean; resolve: (v: boolean) => void } | null>(null);
  const n = useRef(0);
  const toast = useCallback<ToastApi['toast']>((text, tone = 'ok', action) => {
    const id = ++n.current;
    setToasts((t) => [...t, { id, tone, text, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 7000 : 4200);
  }, []);
  const confirm = useCallback<ToastApi['confirm']>((o) => new Promise((resolve) => setDlg({ ...o, resolve })), []);
  const api = useMemo(() => ({ toast, confirm }), [toast, confirm]);
  const close = (v: boolean) => {
    dlg?.resolve(v);
    setDlg(null);
  };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      {createPortal(
        <div className="no-print pointer-events-none fixed inset-x-0 bottom-36 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-24">
          {toasts.map((t) => (
            <div key={t.id} className="animate-in pointer-events-auto flex max-w-md items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm shadow-lg">
              {t.tone === 'ok' ? <CheckCircle2 className="size-4 text-ok" /> : t.tone === 'bad' ? <TriangleAlert className="size-4 text-bad" /> : <Info className="size-4 text-info" />}
              {t.text}
              {t.action && (
                <button
                  type="button"
                  className="ml-2 rounded-md px-2 py-0.5 text-sm font-semibold text-brand hover:bg-surface-2"
                  onClick={() => {
                    setToasts((all) => all.filter((x) => x.id !== t.id));
                    t.action?.onClick();
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
      <Modal
        open={!!dlg}
        onClose={() => close(false)}
        title={dlg?.title}
        size="sm"
        footer={
          <>
            <Button onClick={() => close(false)}>Annuler</Button>
            <Button variant={dlg?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
              {dlg?.confirmLabel ?? 'Confirmer'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{dlg?.message}</p>
      </Modal>
    </ToastCtx.Provider>
  );
}

export const useToast = (): ToastApi => {
  const c = useContext(ToastCtx);
  if (!c) throw new Error('useToast hors ToastProvider');
  return c;
};

/* ------------------------------------------------------------------ Tabs */

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="no-print mb-4 flex gap-1 overflow-x-auto border-b border-border md:flex-wrap md:overflow-visible">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            '-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition',
            value === t.value ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="rounded-full bg-surface-2 px-1.5 text-[11px] text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Table */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('overflow-x-auto rounded-xl border border-border bg-surface', className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}
export const Th = ({ children, className, right }: { children?: ReactNode; className?: string; right?: boolean }) => (
  <th className={cx('border-b border-border bg-surface-2/60 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted', right ? 'text-right' : 'text-left', className)}>{children}</th>
);
/** En-tête triable : un clic trie, un second clic inverse l'ordre. */
export function SortTh({ children, active, reverse, onClick, right, className }: { children: ReactNode; active: boolean; reverse: boolean; onClick: () => void; right?: boolean; className?: string }) {
  return (
    <th
      aria-sort={active ? (reverse ? 'descending' : 'ascending') : 'none'}
      className={cx('border-b border-border bg-surface-2/60 p-0 text-[10px] font-medium uppercase tracking-[0.14em] text-muted', right ? 'text-right' : 'text-left', className)}
    >
      <button type="button" onClick={onClick} className={cx('inline-flex w-full items-center gap-1 px-3 py-2 uppercase hover:text-ink', right && 'justify-end', active && 'text-ink')}>
        {children}
        <span aria-hidden className={cx('text-[9px]', !active && 'opacity-0')}>{reverse ? '▲' : '▼'}</span>
      </button>
    </th>
  );
}
export const Td = ({ children, className, right, ...p }: { children?: ReactNode; className?: string; right?: boolean } & React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td {...p} className={cx('border-b border-border/60 px-3 py-2.5 align-middle', right && 'tabular text-right', className)}>
    {children}
  </td>
);
