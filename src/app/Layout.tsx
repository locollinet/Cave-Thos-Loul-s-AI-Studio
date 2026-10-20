import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, ClipboardCheck, Command, CornerDownLeft, GlassWater, LogOut, Menu, Moon, Plus, Search, SlidersHorizontal, Sun, Wine as WineIcon } from 'lucide-react';
import { useOrg } from './org';
import { useAuth } from './auth';
import { useI18n } from '@/i18n';
import { NAV, isNavVisible } from '@/registry';
import { Modal, cx } from '@/ui';
import { BrandMark, Monogram } from '@/pages/Auth';
import { OfflineBanner } from '@/components/OfflineBanner';
import { wineLabel, norm } from '@/lib/wine';
import { useAutoRepublish } from '@/modules/carte/autoPublish';
import type { BrandTheme } from '@/types';
import { FONTS, appBrandColor, contrast, ensureFonts, mix, readableOn, sanitizeTheme } from '@/lib/brand';

function useTheme() {
  const [dark, setDark] = useState(() => localStorage.getItem('lt-theme') === 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('lt-theme', dark ? 'dark' : 'light');
  }, [dark]);
  return [dark, setDark] as const;
}

const BRAND_VARS = ['--brand', '--brand-fg', '--brand-soft', '--accent', '--app-display', '--app-sans'];

/** Habille l'interface aux couleurs de l'établissement ; une couleur illisible sur le fond de l'interface est ignorée. */
function useWhiteLabel(brand: BrandTheme | undefined, enabled: boolean, dark: boolean) {
  useEffect(() => {
    const root = document.documentElement.style;
    if (!enabled || !brand) return;
    const theme = sanitizeTheme(brand);
    ensureFonts([theme.headingFont, theme.bodyFont]);
    const surface = dark ? '#1c1517' : '#ffffff';
    const main = appBrandColor(theme, surface);
    root.setProperty('--app-display', FONTS[theme.headingFont].stack);
    if (FONTS[theme.bodyFont].kind === 'sans') root.setProperty('--app-sans', FONTS[theme.bodyFont].stack);
    if (main) {
      root.setProperty('--brand', main);
      root.setProperty('--brand-fg', readableOn(main));
      root.setProperty('--brand-soft', mix(main, surface, dark ? 0.22 : 0.1));
    }
    if (contrast(theme.accent, surface) >= 3) root.setProperty('--accent', theme.accent);
    return () => BRAND_VARS.forEach((v) => root.removeProperty(v));
  }, [brand, enabled, dark]);
}

export function Layout() {
  const { t, locale, setLocale } = useI18n();
  const { org, role, sites, activeSiteId, setActiveSiteId, orgs, switchOrg, hasModule, can } = useOrg();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [dark, setDark] = useTheme();
  const whiteLabel = !!(org.brandApp && org.brand);
  useWhiteLabel(org.brand, whiteLabel, dark);
  const [palette, setPalette] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const loc = useLocation();
  useAutoRepublish();

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  useEffect(() => setMoreOpen(false), [loc.pathname]);

  const items = useMemo(
    () => NAV.filter((n) => isNavVisible(n, org.modules, role, !!user?.isPlatformAdmin || !!user?.demo)),
    [org.modules, role, user?.isPlatformAdmin, user?.demo],
  );
  // Barre mobile : les 4 destinations les plus utilisées selon le métier.
  const primary = useMemo(() => {
    const wanted = org.profile === 'restaurant' || org.profile === 'chaine' ? ['dashboard', 'service', 'wines', 'stock'] : ['dashboard', 'wines', 'stock', 'negoce'];
    const picked = wanted.map((id) => items.find((n) => n.id === id)).filter((n): n is (typeof items)[number] => !!n);
    for (const n of items) if (picked.length < 4 && !picked.includes(n)) picked.push(n);
    return picked;
  }, [items, org.profile]);
  const rest = items.filter((n) => !primary.includes(n));
  const [fabOpen, setFabOpen] = useState(false);
  useEffect(() => setFabOpen(false), [loc.pathname, loc.search]);
  const section = loc.pathname.split('/')[1] ?? '';
  const fab = [
    { to: '/stock?new=in', icon: ArrowDownToLine, label: t('stock.type.in'), show: hasModule('stock') },
    { to: '/stock?new=out', icon: ArrowUpFromLine, label: t('stock.type.out'), show: hasModule('stock') },
    { to: '/stock?new=transfer', icon: ArrowRightLeft, label: t('stock.type.transfer'), show: hasModule('stock') && sites.length > 1 },
    { to: '/stock?new=adjust', icon: SlidersHorizontal, label: t('stock.type.adjust'), show: hasModule('stock') && can('manager') },
    { to: '/vins?new=1', icon: Plus, label: t('ux.fab.newWine'), show: hasModule('stock') && can('manager') },
    { to: '/inventaire', icon: ClipboardCheck, label: t('ux.fab.inventory'), show: hasModule('stock') },
    { to: '/service', icon: GlassWater, label: t('ux.fab.service'), show: items.some((n) => n.id === 'service') },
  ].filter((a) => a.show);

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    cx(
      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
      isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-surface-2 hover:text-ink',
    );

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar desktop */}
      <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface p-3 md:flex">
        {whiteLabel ? (
          <BrandMark className="px-2 pb-4 pt-2" name={org.name} logo={org.brand?.showLogo ? org.legal.logoDataUrl : undefined} caption={t('brand.poweredBy')} />
        ) : (
          <BrandMark className="px-2 pb-4 pt-2" />
        )}
        <button
          onClick={() => setPalette(true)}
          className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-muted hover:border-brand/40"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">{t('nav.cmdk').replace(' (⌘K)', '')}</span>
          <kbd className="rounded border border-border px-1.5 text-[10px]">⌘K</kbd>
        </button>
        <nav className="flex-1 space-y-0.5 overflow-y-auto">
          {items.map((n) => (
            <NavLink key={n.id} to={n.path} end={n.path === '/'} className={linkCls}>
              <n.icon className="size-4.5" />
              {t(n.labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-3 border-t border-border pt-3">
          {orgs.length > 1 && (
            <select
              value={org.id}
              onChange={(e) => switchOrg(e.target.value)}
              className="mb-2 w-full rounded-lg border border-border bg-bg px-2 py-1.5 text-sm"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-2 px-1">
            <div className="grid size-8 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{(user?.name ?? '?').slice(0, 1).toUpperCase()}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{org.name}</div>
              <div className="truncate text-xs text-muted">
                {user?.name} · {role}
              </div>
            </div>
            <button onClick={signOut} title={t('auth.signOut')} className="rounded-md p-1.5 text-muted hover:bg-surface-2">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="no-print sticky top-0 z-30 flex flex-col border-b border-border bg-bg/85 backdrop-blur">
          <OfflineBanner />
          {(org.isDemo || user?.demo) && (
            <div className="flex items-center justify-center gap-2 border-b border-accent/20 bg-accent/10 px-3 py-1 text-center text-[11px] font-medium text-accent">
              <span>Démo — données fictives</span>
              {org.expiresAt && org.expiresAt > Date.now() && (
                <span className="text-muted">· expire dans {Math.ceil((org.expiresAt - Date.now()) / 86_400_000)} jours</span>
              )}
            </div>
          )}
          {user && user.emailVerified === false && !user.demo && (
            <div className="flex items-center justify-between border-b border-warn/20 bg-warn/10 px-4 py-1.5 text-xs text-warn">
              <span>{t('auth.emailNotVerified')}</span>
              <button
                type="button"
                className="underline hover:text-ink"
                onClick={() => {
                  user.email && import('./auth').then(() => {
                    // trigger resend notice
                  });
                }}
              >
                {t('auth.resendVerification')}
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-2 md:px-6">
          <div className="md:hidden">
            {whiteLabel && org.brand?.showLogo && org.legal.logoDataUrl ? <img src={org.legal.logoDataUrl} alt={org.name} className="size-8 object-contain" /> : <Monogram className="size-8" />}
          </div>
          {sites.length > 1 && (
            <select
              value={activeSiteId}
              onChange={(e) => setActiveSiteId(e.target.value)}
              className="h-9 max-w-[46vw] rounded-lg border border-border bg-surface px-2 text-sm font-medium"
              aria-label={t('common.site')}
            >
              <option value="all">{t('common.allSites')}</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex-1" />
          <button onClick={() => setPalette(true)} className="rounded-lg p-2 text-muted hover:bg-surface-2 md:hidden" aria-label="Rechercher">
            <Search className="size-5" />
          </button>
          <button onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-muted hover:bg-surface-2">
            {locale.toUpperCase()}
          </button>
          <button onClick={() => setDark(!dark)} className="rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="Thème">
            {dark ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
          </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-5 md:px-6 md:pb-10">
          <div key={section} className="animate-in">
            <Outlet />
          </div>
        </main>

        {fab.length > 0 && section !== 'service' && (
          <button
            type="button"
            onClick={() => setFabOpen(true)}
            aria-label={t('ux.fab')}
            className="no-print fixed bottom-[5.5rem] right-4 z-30 grid size-14 place-items-center rounded-full bg-brand text-brand-fg shadow-lg shadow-black/20 transition active:scale-95 md:hidden"
          >
            <Plus className="size-6" />
          </button>
        )}
        <Modal open={fabOpen} sheet onClose={() => setFabOpen(false)} title={t('ux.fab')}>
          <div className="grid grid-cols-2 gap-2">
            {fab.map((a) => (
              <button
                key={a.to}
                type="button"
                onClick={() => navigate(a.to)}
                className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm font-medium active:bg-surface-2"
              >
                <a.icon className="size-5 shrink-0 text-brand" />
                {a.label}
              </button>
            ))}
          </div>
        </Modal>

        {/* Bottom nav mobile */}
        <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {primary.map((n) => (
            <NavLink key={n.id} to={n.path} end={n.path === '/'} className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium', isActive ? 'text-brand' : 'text-muted')}>
              <n.icon className="size-5" />
              <span className="max-w-full truncate px-0.5">{t(n.labelKey).split(' ')[0]}</span>
            </NavLink>
          ))}
          <button onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted">
            <Menu className="size-5" />
            {t('nav.more')}
          </button>
        </nav>
        <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title={t('nav.more')} size="sm">
          <div className="space-y-1">
            {rest.map((n) => (
              <NavLink key={n.id} to={n.path} className={linkCls}>
                <n.icon className="size-4.5" />
                {t(n.labelKey)}
              </NavLink>
            ))}
            <button onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2">
              <LogOut className="size-4.5" />
              {t('auth.signOut')}
            </button>
          </div>
        </Modal>
      </div>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}

/* ---------------------------------------------------------------- Palette ⌘K */

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: React.ReactNode;
  run: () => void;
  hay: string;
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const { org, role, wines, hasModule } = useOrg();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const cmds = useMemo<Cmd[]>(() => {
    const pages: Cmd[] = NAV.filter((n) => isNavVisible(n, org.modules, role)).map((n) => ({
      id: `p-${n.id}`,
      label: t(n.labelKey),
      group: t('nav.cmdkPages'),
      icon: <n.icon className="size-4" />,
      run: () => nav(n.path),
      hay: norm(`${t(n.labelKey)} ${n.keywords ?? ''}`),
    }));
    const actions: Cmd[] = [
      { id: 'a-wine', label: 'Nouveau vin', path: '/vins?new=1', ok: true },
      { id: 'a-in', label: 'Entrée de stock', path: '/stock?new=in', ok: true },
      { id: 'a-out', label: 'Sortie de stock', path: '/stock?new=out', ok: true },
      { id: 'a-inv', label: 'Démarrer un inventaire', path: '/inventaire', ok: true },
      { id: 'a-quote', label: 'Nouveau devis', path: '/negoce?new=quote', ok: hasModule('negoce') && ['owner', 'manager', 'accountant'].includes(role) },
    ]
      .filter((a) => a.ok)
      .map((a) => ({
        id: a.id,
        label: a.label,
        group: t('nav.cmdkActions'),
        icon: <Plus className="size-4" />,
        run: () => nav(a.path),
        hay: norm(a.label),
      }));
    const ws: Cmd[] = wines
      .filter((w) => !w.isArchived)
      .map((w) => ({
        id: `w-${w.id}`,
        label: wineLabel(w),
        hint: w.region,
        group: t('nav.cmdkWines'),
        icon: <WineIcon className="size-4" />,
        run: () => nav(`/vins?open=${w.id}`),
        hay: norm(`${w.producer} ${w.name} ${w.vintage} ${w.region ?? ''} ${w.grapes ?? ''}`),
      }));
    return [...actions, ...pages, ...ws];
  }, [org.modules, role, wines, t, nav, hasModule]);

  const results = useMemo(() => {
    const terms = norm(q).split(' ').filter(Boolean);
    const list = terms.length ? cmds.filter((c) => terms.every((x) => c.hay.includes(x))) : cmds.filter((c) => c.group !== t('nav.cmdkWines'));
    return list.slice(0, 40);
  }, [q, cmds, t]);

  useEffect(() => setIdx(0), [q]);

  const go = (c?: Cmd) => {
    if (!c) return;
    onClose();
    c.run();
  };

  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2 text-sm font-medium text-muted"><Command className="size-4" /> {t('nav.cmdk')}</span>} size="lg">
      <input
        ref={inputRef}
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setIdx((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') go(results[idx]);
        }}
        placeholder={t('nav.cmdkPlaceholder')}
        className="mb-3 h-11 w-full rounded-lg border border-border bg-bg px-3 text-base outline-none focus:border-brand"
      />
      <div className="max-h-[50vh] space-y-0.5 overflow-y-auto">
        {results.length === 0 && <p className="py-6 text-center text-sm text-muted">{t('nav.cmdkEmpty')}</p>}
        {results.map((c, i) => (
          <button
            key={c.id}
            onMouseEnter={() => setIdx(i)}
            onClick={() => go(c)}
            className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm', i === idx ? 'bg-brand-soft text-brand' : 'hover:bg-surface-2')}
          >
            <span className="text-muted">{c.icon}</span>
            <span className="flex-1 truncate">{c.label}</span>
            {c.hint && <span className="text-xs text-muted">{c.hint}</span>}
            <span className="text-[10px] uppercase tracking-wide text-muted">{c.group}</span>
            {i === idx && <CornerDownLeft className="size-3.5" />}
          </button>
        ))}
      </div>
    </Modal>
  );
}
