import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, ClipboardCheck, Command, CornerDownLeft, GlassWater, LogOut, Menu, Moon, Plus, Search, SlidersHorizontal, Sparkles, Sun, Wine as WineIcon } from 'lucide-react';
import { useOrg } from './org';
import { useAuth } from './auth';
import { useI18n } from '@/i18n';
import { NAV, isNavVisible } from '@/registry';
import { Modal, cx, useToast } from '@/ui';
import { BrandMark, Monogram } from '@/pages/Auth';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ModuleSwitcherModal } from '@/components/ModuleSwitcherModal';
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
  const { org, role, sites, activeSiteId, setActiveSiteId, orgs, switchOrg, hasModule, can, overrideRole, setOverrideRole } = useOrg();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [dark, setDark] = useTheme();
  const whiteLabel = !!(org.brandApp && org.brand);
  useWhiteLabel(org.brand, whiteLabel, dark);
  const [palette, setPalette] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);
  // Modifier l'organisation (modules, profil) : direction uniquement ; libre en démo locale.
  const canManageModules = can('manager') || !!user?.demo;
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
        {canManageModules && (
          <div className="pt-2 pb-1">
            <button
              type="button"
              onClick={() => setModulesOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border bg-surface-2/60 px-3 py-2 text-xs font-medium text-ink hover:border-brand/50 hover:bg-brand-soft/40 transition cursor-pointer"
            >
              <SlidersHorizontal className="size-3.5 text-brand shrink-0" />
              <span className="flex-1 truncate text-left">Modules &amp; Profil</span>
              <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                {org.modules.length}/6
              </span>
            </button>
          </div>
        )}
        <div className="mt-2 border-t border-border pt-3">
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
            <div className="flex flex-wrap items-center justify-center gap-2 border-b border-accent/20 bg-accent/10 px-3 py-1 text-center text-[11px] font-medium text-accent">
              <span className="font-semibold">Démo</span>
              <button
                type="button"
                onClick={() => canManageModules && setModulesOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent/20 px-2.5 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent/30 transition cursor-pointer"
              >
                <SlidersHorizontal className="size-3" />
                <span>Modules : {t(`profile.${org.profile}`)} ({org.modules.length}/6)</span>
              </button>
              <div className="inline-flex items-center gap-1.5 pl-1">
                <span className="text-muted">| Simuler rôle :</span>
                <select
                  value={overrideRole || ''}
                  onChange={(e) => setOverrideRole((e.target.value as any) || null)}
                  className="rounded border border-accent/30 bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink cursor-pointer hover:border-accent"
                  title="Simuler un rôle pour tester la séparation des accès (ex: masquer les marges pour l'équipe de salle)"
                >
                  <option value="">Rôle réel ({role})</option>
                  <option value="owner">Propriétaire (tout voir)</option>
                  <option value="manager">Responsable / Direction</option>
                  <option value="sommelier">Chef Sommelier</option>
                  <option value="accountant">Comptable (chiffres &amp; douane)</option>
                  <option value="staff">Équipe de salle (marges masquées)</option>
                </select>
                {overrideRole && (
                  <button
                    type="button"
                    onClick={() => setOverrideRole(null)}
                    className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand hover:bg-brand/25"
                    title="Rétablir le rôle par défaut"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
              {org.expiresAt && org.expiresAt > Date.now() && (
                <span className="text-muted">· expire dans {Math.ceil((org.expiresAt - Date.now()) / 86_400_000)} j</span>
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
          {canManageModules && (
            <button
              type="button"
              onClick={() => setModulesOpen(true)}
              title="Gérer les modules & profil métier"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink hover:border-brand/40 hover:bg-surface-2 transition cursor-pointer"
            >
              <SlidersHorizontal className="size-3.5 text-brand" />
              <span className="hidden sm:inline">Modules</span>
              <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                {org.modules.length}/6
              </span>
            </button>
          )}
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
            {canManageModules && (
              <button
                onClick={() => {
                  setMoreOpen(false);
                  setModulesOpen(true);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink hover:bg-surface-2"
              >
                <SlidersHorizontal className="size-4.5 text-brand" />
                <span>Modules &amp; Profil ({org.modules.length}/6 activés)</span>
              </button>
            )}
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

      <CommandPalette open={palette} onClose={() => setPalette(false)} onOpenModules={canManageModules ? () => setModulesOpen(true) : undefined} />
      {canManageModules && <ModuleSwitcherModal open={modulesOpen} onClose={() => setModulesOpen(false)} />}
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

function CommandPalette({ open, onClose, onOpenModules }: { open: boolean; onClose: () => void; onOpenModules?: () => void }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const { toast } = useToast();
  const { org, updateOrg, role, wines, hasModule, setOverrideRole } = useOrg();
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
      {
        id: 'a-role-staff',
        label: 'Simuler vue : Équipe de salle (masquer marges et prix d’achat)',
        group: 'Démo & Rôles',
        icon: <SlidersHorizontal className="size-4 text-warn" />,
        run: () => {
          setOverrideRole('staff');
          toast('Simulation active : Rôle Équipe de salle (marges et compta masquées)', 'ok');
        },
        hay: norm('simuler role equipe salle staff serveur masquer marges securite'),
      },
      {
        id: 'a-role-sommelier',
        label: 'Simuler vue : Chef Sommelier (carte, service et cave)',
        group: 'Démo & Rôles',
        icon: <SlidersHorizontal className="size-4 text-brand" />,
        run: () => {
          setOverrideRole('sommelier');
          toast('Simulation active : Rôle Chef Sommelier', 'ok');
        },
        hay: norm('simuler role chef sommelier cave carte vins'),
      },
      {
        id: 'a-role-owner',
        label: 'Rétablir vue : Propriétaire / Direction (accès complet)',
        group: 'Démo & Rôles',
        icon: <SlidersHorizontal className="size-4 text-ok" />,
        run: () => {
          setOverrideRole(null);
          toast('Rôle Propriétaire restauré', 'ok');
        },
        hay: norm('retablir role proprietaire direction vue complete reset simulation'),
      },
      {
        id: 'a-modules',
        label: 'Gérer les modules & profils démo (Changer de profil)',
        group: t('nav.cmdkActions'),
        icon: <SlidersHorizontal className="size-4 text-brand" />,
        run: () => onOpenModules?.(),
        hay: norm('modules profil demo changer restaurant negoce caviste chaine activation configurer'),
      },
      {
        id: 'a-all-modules',
        label: 'Mode Démo Complète (Activer tous les 6 modules)',
        group: t('nav.cmdkActions'),
        icon: <Sparkles className="size-4 text-accent" />,
        run: async () => {
          await updateOrg({ modules: ['stock', 'carte', 'achats', 'negoce', 'compta', 'pilotage'] });
          toast('Tous les modules ont été activés !', 'ok');
        },
        hay: norm('demo complete full suite tous les modules tout activer'),
      },
      {
        id: 'a-preset-rest',
        label: 'Activer profil : Restaurant / Bar (Carte, Service, Achats, Stock)',
        group: t('nav.cmdkActions'),
        icon: <SlidersHorizontal className="size-4 text-muted" />,
        run: async () => {
          await updateOrg({ profile: 'restaurant', modules: ['stock', 'carte', 'achats', 'pilotage'] });
          toast('Profil Restaurant appliqué', 'ok');
        },
        hay: norm('profil restaurant bistrot bar palace service carte'),
      },
      {
        id: 'a-preset-negoce',
        label: 'Activer profil : Maison de Négoce (B2B, Achats, Compta, Pilotage, Stock)',
        group: t('nav.cmdkActions'),
        icon: <SlidersHorizontal className="size-4 text-muted" />,
        run: async () => {
          await updateOrg({ profile: 'negoce', modules: ['stock', 'achats', 'negoce', 'compta', 'pilotage'] });
          toast('Profil Maison de Négoce appliqué', 'ok');
        },
        hay: norm('profil negoce b2b factures devis douane drm compta'),
      },
      {
        id: 'a-wine',
        label: 'Nouveau vin',
        group: t('nav.cmdkActions'),
        icon: <Plus className="size-4" />,
        run: () => nav('/vins?new=1'),
        hay: norm('nouveau vin'),
      },
      {
        id: 'a-in',
        label: 'Entrée de stock',
        group: t('nav.cmdkActions'),
        icon: <Plus className="size-4" />,
        run: () => nav('/stock?new=in'),
        hay: norm('entree de stock'),
      },
      {
        id: 'a-out',
        label: 'Sortie de stock',
        group: t('nav.cmdkActions'),
        icon: <Plus className="size-4" />,
        run: () => nav('/stock?new=out'),
        hay: norm('sortie de stock'),
      },
      {
        id: 'a-inv',
        label: 'Démarrer un inventaire',
        group: t('nav.cmdkActions'),
        icon: <Plus className="size-4" />,
        run: () => nav('/inventaire'),
        hay: norm('demarrer un inventaire'),
      },
      ...(hasModule('negoce') && ['owner', 'manager', 'accountant'].includes(role)
        ? [
            {
              id: 'a-quote',
              label: 'Nouveau devis',
              group: t('nav.cmdkActions'),
              icon: <Plus className="size-4" />,
              run: () => nav('/negoce?new=quote'),
              hay: norm('nouveau devis'),
            },
          ]
        : []),
    ];
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
    // Actions qui modifient l'organisation : seulement si l'utilisateur peut gérer les modules.
    const orgActions = new Set(['a-modules', 'a-all-modules', 'a-preset-rest', 'a-preset-negoce']);
    return [...actions.filter((a) => onOpenModules || !orgActions.has(a.id)), ...pages, ...ws];
  }, [org.modules, role, wines, t, nav, hasModule, onOpenModules]);

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
