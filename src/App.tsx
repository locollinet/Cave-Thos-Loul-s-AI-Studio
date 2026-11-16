import { Component, lazy, Suspense } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { ToastProvider, Spinner } from '@/ui';
import { AuthProvider, useAuth } from '@/app/auth';
import { OrgProvider, useOrg } from '@/app/org';
import { Layout } from '@/app/Layout';
import { LoginPage, OnboardingPage } from '@/pages/Auth';
import { hasRole, NAV } from '@/registry';
import type { ReactNode } from 'react';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Wines = lazy(() => import('@/pages/Wines'));
const CellarPlanPage = lazy(() => import('@/pages/CellarPlanPage'));
const Stock = lazy(() => import('@/pages/Stock'));
const Contacts = lazy(() => import('@/pages/Contacts'));
const Settings = lazy(() => import('@/pages/Settings'));
const PlatformAdmin = lazy(() => import('@/pages/PlatformAdmin'));

// Modules métier : chacun gère ses propres sous-routes.
const Carte = lazy(() => import('@/modules/carte'));
const Achats = lazy(() => import('@/modules/achats'));
const Negoce = lazy(() => import('@/modules/negoce'));
const Compta = lazy(() => import('@/modules/compta'));
const Pilotage = lazy(() => import('@/modules/pilotage'));
const PublicList = lazy(() => import('@/modules/carte/PublicList'));
const PublicOffer = lazy(() => import('@/modules/negoce/offers/PublicOffer'));
const Service = lazy(() => import('@/modules/service'));

const Loading = () => (
  <div className="grid min-h-[40dvh] place-items-center">
    <Spinner className="size-7" />
  </div>
);

class ErrorBoundaryBase extends Component<{ resetKey: string; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid min-h-[50dvh] place-items-center p-6">
          <div className="max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-sm">
            <h2 className="font-display text-xl font-semibold text-ink">Une erreur est survenue</h2>
            <p className="mt-2 text-sm text-muted">Cette page n’a pas pu s’afficher correctement.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2/80"
              >
                Recharger
              </button>
              <Link
                to="/"
                onClick={() => this.setState({ error: null })}
                className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90"
              >
                Retour à l’accueil
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  return <ErrorBoundaryBase resetKey={`${pathname}${search}`}>{children}</ErrorBoundaryBase>;
}

/** Garde d'accès : module activé + rôle autorisé. */
function Guard({ id, children }: { id: string; children: ReactNode }) {
  const { org, role } = useOrg();
  const item = NAV.find((n) => n.id === id);
  if (!item) return <>{children}</>;
  const ok = (!item.module || org.modules.includes(item.module)) && hasRole(role, item.roles);
  return ok ? <>{children}</> : <Navigate to="/" replace />;
}

function AppRoutes() {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="vins" element={<Guard id="wines"><Wines /></Guard>} />
            <Route path="plan-de-cave" element={<Guard id="stock"><CellarPlanPage /></Guard>} />
            <Route path="stock" element={<Guard id="stock"><Stock /></Guard>} />
            <Route path="inventaire" element={<Navigate to="/stock?tab=inventory" replace />} />
            <Route path="contacts" element={<Guard id="contacts"><Contacts /></Guard>} />
            <Route path="carte/*" element={<Guard id="carte"><Carte /></Guard>} />
            <Route path="service/*" element={<Guard id="service"><Service /></Guard>} />
            <Route path="achats/*" element={<Guard id="achats"><Achats /></Guard>} />
            <Route path="negoce/*" element={<Guard id="negoce"><Negoce /></Guard>} />
            <Route path="compta/*" element={<Guard id="compta"><Compta /></Guard>} />
            <Route path="pilotage/*" element={<Guard id="pilotage"><Pilotage /></Guard>} />
            <Route path="reglages" element={<Guard id="settings"><Settings /></Guard>} />
            <Route path="plateforme" element={<PlatformAdmin />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <LoginPage />;
  return (
    <OrgProvider key={user.uid} fallback={(g) => (g.status === 'none' ? <OnboardingPage /> : g.status === 'error' ? <div className="p-8 text-bad">{g.error}</div> : <Loading />)}>
      <AppRoutes />
    </OrgProvider>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <RouteErrorBoundary>
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route path="/p/:publicId" element={<PublicList />} />
                  <Route path="/o/:publicId" element={<PublicOffer />} />
                  <Route path="*" element={<Gate />} />
                </Routes>
              </Suspense>
            </RouteErrorBoundary>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </I18nProvider>
  );
}
