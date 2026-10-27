import { useState } from 'react';
import { Building2, Check, Loader2, Wine } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { useOrgGate } from '@/app/org';
import { useI18n } from '@/i18n';
import { Button, Card, Checkbox, Field, Input, Segmented, cx } from '@/ui';
import { MODULE_LIST, PROFILE_MODULES } from '@/registry';
import type { ModuleId, OrgProfile } from '@/types';

/** Sceau « L&T » : monogramme de la marque. */
export function Monogram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill="var(--brand)" />
      <circle cx="32" cy="32" r="25" fill="none" stroke="var(--accent)" strokeWidth="1" />
      <circle cx="32" cy="32" r="22" fill="none" stroke="var(--accent)" strokeWidth="0.5" opacity="0.7" />
      <text x="32" y="39.5" textAnchor="middle" fontFamily="var(--app-display)" fontSize="21" fill="var(--brand-fg)" letterSpacing="-0.5">
        L
        <tspan fontStyle="italic" fill="var(--accent)" fontSize="18" dx="0.5">
          &amp;
        </tspan>
        <tspan dx="0.5">T</tspan>
      </text>
    </svg>
  );
}

export function BrandMark({ className, logo, name, caption }: { className?: string; logo?: string; name?: string; caption?: string }) {
  if (name)
    return (
      <div className={cx('flex items-center gap-2.5', className)}>
        {logo && <img src={logo} alt="" className="size-9 shrink-0 object-contain" />}
        <span className="min-w-0">
          <span className="block truncate font-display text-xl leading-tight">{name}</span>
          {caption && <span className="block truncate text-[10px] uppercase tracking-[0.18em] text-muted">{caption}</span>}
        </span>
      </div>
    );
  return (
    <div className={cx('flex items-center gap-2.5', className)}>
      <Monogram className="size-9 shrink-0" />
      <span className="font-display text-2xl tracking-tight">Loul&rsquo;s &amp; Thos</span>
    </div>
  );
}

export function LoginPage() {
  const { t, locale, setLocale } = useI18n();
  const { signInGoogle, signInEmail, signUpEmail, resetPassword, signInDemo, firebaseReady } = useAuth();
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const inviteEmail = searchParams.get('email') ?? '';
  const inviteOrg = searchParams.get('org') ?? '';

  const [mode, setMode] = useState<'in' | 'up' | 'reset'>(inviteEmail ? 'up' : 'in');
  const [email, setEmail] = useState(inviteEmail);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message.replace('Firebase: ', ''));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      await resetPassword(email.trim());
      setMsg(t('auth.resetSent'));
    });
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand p-12 text-brand-fg lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 size-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-24 -left-24 size-80 rounded-full bg-white/5" />
        <BrandMark />
        <div className="relative">
          <h2 className="font-display text-4xl leading-tight">{t('app.tagline')}</h2>
          <p className="mt-4 max-w-md text-white/70">Stock multi-sites, carte des vins vivante, achats par IA, facturation, douane et comptabilité. Pour les maisons de négoce, les hôtels, les restaurants et les groupes.</p>
        </div>
        <div className="text-sm text-white/50">© Loul&rsquo;s &amp; Thos</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <BrandMark />
          </div>
          <div>
            <h1 className="font-display text-3xl font-semibold">{t('auth.title')}</h1>
            <p className="mt-1 text-sm text-muted">
              {inviteOrg ? `Invitation à rejoindre l’organisation` : t('auth.subtitle')}
            </p>
          </div>
          {!firebaseReady && <p className="rounded-lg border border-border bg-surface px-3 py-2.5 text-xs text-muted">{t('auth.notConfigured')}</p>}
          {firebaseReady && (
            <>
              {mode !== 'reset' && (
                <Button className="w-full" size="lg" onClick={() => run(signInGoogle)} disabled={busy}>
                  {t('auth.google')}
                </Button>
              )}
              {mode === 'reset' ? (
                <form className="space-y-3" onSubmit={handleReset}>
                  <Field label={t('auth.email')}>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                  </Field>
                  {err && <p className="text-xs text-bad">{err}</p>}
                  {msg && <p className="text-xs text-ok">{msg}</p>}
                  <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
                    {t('auth.sendReset')}
                  </Button>
                  <button type="button" className="w-full text-center text-xs text-muted hover:text-ink" onClick={() => setMode('in')}>
                    {t('auth.backToSignIn')}
                  </button>
                </form>
              ) : (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(() => (mode === 'in' ? signInEmail(email, password) : signUpEmail(email, password, name || email.split('@')[0])));
                  }}
                >
                  {mode === 'up' && (
                    <Field label={t('auth.name')}>
                      <Input value={name} onChange={(e) => setName(e.target.value)} required />
                    </Field>
                  )}
                  <Field label={t('auth.email')}>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                  </Field>
                  <Field label={t('auth.password')}>
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
                  </Field>
                  {mode === 'in' && (
                    <div className="flex justify-end">
                      <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setMode('reset')}>
                        {t('auth.forgotPassword')}
                      </button>
                    </div>
                  )}
                  {err && <p className="text-xs text-bad">{err}</p>}
                  <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
                    {mode === 'in' ? t('auth.signIn') : t('auth.signUp')}
                  </Button>
                  <button type="button" className="w-full text-center text-xs text-muted hover:text-ink" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
                    {mode === 'in' ? t('auth.toSignUp') : t('auth.toSignIn')}
                  </button>
                </form>
              )}
              <div className="flex items-center gap-3 text-xs text-muted">
                <div className="h-px flex-1 bg-border" />
                ou
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          <div>
            <Button className="w-full" size="lg" variant={firebaseReady ? 'secondary' : 'primary'} onClick={signInDemo}>
              {t('auth.demo')}
            </Button>
            <p className="mt-1.5 text-center text-xs text-muted">{t('auth.demoHint')}</p>
          </div>
          <div className="flex justify-center">
            <Segmented value={locale} onChange={setLocale} options={[{ value: 'fr', label: 'FR' }, { value: 'en', label: 'EN' }]} />
          </div>
        </div>
      </div>
    </div>
  );
}

const PROFILES: OrgProfile[] = ['restaurant', 'negoce', 'independant', 'chaine'];

export function OnboardingPage() {
  const { t, locale } = useI18n();
  const { user, signOut } = useAuth();
  const { createOrg, joinOrg, error } = useOrgGate() as ReturnType<typeof useOrgGate> & { error?: string };
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const inviteOrgId = searchParams.get('org') ?? '';

  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<OrgProfile>('restaurant');
  const [name, setName] = useState('');
  const [modules, setModules] = useState<ModuleId[]>(PROFILE_MODULES.restaurant);
  const [demoData, setDemoData] = useState(!!user?.demo);
  const [busy, setBusy] = useState(false);
  const [joinId, setJoinId] = useState(inviteOrgId);
  const [err, setErr] = useState(error ?? '');

  const pick = (p: OrgProfile) => {
    setProfile(p);
    setModules(PROFILE_MODULES[p]);
  };
  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      await createOrg({ name: name.trim(), profile, modules, locale, withDemoData: demoData });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  const join = async () => {
    setBusy(true);
    setErr('');
    try {
      await joinOrg(joinId.trim());
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 p-6">
      <div className="flex items-center justify-between">
        <BrandMark />
        <button className="text-xs text-muted hover:text-ink" onClick={signOut}>
          {t('auth.signOut')} ({user?.email})
        </button>
      </div>
      <Card className="p-6">
        <h1 className="font-display text-2xl font-semibold">{t('onb.title')}</h1>
        <div className="mt-1 flex gap-2 text-xs text-muted">
          <span className={cx(step === 1 && 'font-semibold text-brand')}>1. {t('onb.step1')}</span>›<span className={cx(step === 2 && 'font-semibold text-brand')}>2. {t('onb.step2')}</span>
        </div>

        {step === 1 && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {PROFILES.map((p) => (
              <button
                key={p}
                onClick={() => pick(p)}
                className={cx('rounded-xl border p-4 text-left transition', profile === p ? 'border-brand bg-brand-soft ring-2 ring-brand/20' : 'border-border hover:bg-surface-2')}
              >
                <div className="flex items-center gap-2 font-medium">
                  <Building2 className="size-4 text-brand" />
                  {t(`profile.${p}`)}
                  {profile === p && <Check className="ml-auto size-4 text-brand" />}
                </div>
                <p className="mt-1 text-sm text-muted">{t(`profile.${p}.desc`)}</p>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="mt-5 space-y-5">
            <Field label={t('onb.orgName')}>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-medium">{t('onb.modules')}</div>
                <button
                  type="button"
                  onClick={() => setModules(['stock', 'carte', 'achats', 'negoce', 'compta', 'pilotage'])}
                  className="text-xs text-brand hover:underline font-medium cursor-pointer"
                >
                  Tout activer (Démo complète)
                </button>
              </div>
              <p className="mb-2 text-xs text-muted">
                {t('onb.modulesHint')} Vous pourrez changer de profil et activer d’autres modules à tout moment en un clic depuis l’application.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {MODULE_LIST.map((m) => (
                  <div key={m.id} className="rounded-lg border border-border p-3">
                    <Checkbox
                      checked={modules.includes(m.id)}
                      onChange={(v) => setModules((cur) => (v ? [...cur, m.id] : cur.filter((x) => x !== m.id)))}
                      label={<span className="font-medium">{t(m.labelKey)}</span>}
                    />
                    <p className="ml-6.5 mt-0.5 text-xs text-muted">{t(m.descKey)}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <Checkbox checked={demoData} onChange={setDemoData} label={t('onb.demoData')} />
              <p className="ml-6.5 text-xs text-muted">{t('onb.demoDataHint')}</p>
            </div>
          </div>
        )}

        {err && <p className="mt-4 text-sm text-bad">{err}</p>}
        <div className="mt-6 flex justify-between">
          {step === 2 ? <Button onClick={() => setStep(1)}>{t('common.back')}</Button> : <span />}
          {step === 1 ? (
            <Button variant="primary" onClick={() => setStep(2)}>
              {t('common.next')}
            </Button>
          ) : (
            <Button variant="primary" onClick={submit} disabled={!name.trim() || !modules.includes('stock')} loading={busy} icon={busy ? <Loader2 className="size-4" /> : undefined}>
              {t('onb.create')}
            </Button>
          )}
        </div>
      </Card>
      {!user?.demo && (
        <Card className="p-5">
          <div className="font-medium">{t('onb.join')}</div>
          {inviteOrgId ? (
            <div className="mb-3 mt-1 rounded-md bg-brand-soft p-3 text-xs text-brand">
              Invitation détectée pour l’organisation <code className="font-mono font-semibold">{inviteOrgId}</code> liée à votre adresse {user?.email}.
            </div>
          ) : (
            <p className="mb-3 text-sm text-muted">{t('onb.joinHint')}</p>
          )}
          <div className="flex gap-2">
            <Input value={joinId} onChange={(e) => setJoinId(e.target.value)} placeholder={t('onb.joinId')} />
            <Button variant={inviteOrgId ? 'primary' : 'secondary'} onClick={join} disabled={!joinId.trim()} loading={busy}>
              {t('onb.joinBtn')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
