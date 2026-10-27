import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Calculator, ChevronDown, ChevronUp, Compass, FileText, GlassWater, Sparkles, Tag, Truck, Warehouse, X, Zap } from 'lucide-react';
import { useOrg } from '@/app/org';
import { useAuth } from '@/app/auth';
import type { OrgProfile } from '@/types';
import { cx } from '@/ui';

interface DiscoveryStep {
  title: string;
  desc: string;
  to: string;
  icon: typeof Sparkles;
  badge: string;
}

const STEPS_BY_PROFILE: Record<OrgProfile, DiscoveryStep[]> = {
  restaurant: [
    {
      title: '1. Flasher la Carte des Vins QR',
      desc: 'Ouvrez la carte interactive multilingue (FR/EN/IT) et le sommelier IA.',
      to: '/carte',
      icon: BookOpen,
      badge: 'Client & QR',
    },
    {
      title: '2. Mode Service & Flacons Coravin',
      desc: 'Gérez les bouteilles ouvertes, le décompte des verres et la fraîcheur.',
      to: '/service',
      icon: GlassWater,
      badge: 'Salle & Bar',
    },
    {
      title: '3. Réception de factures par IA',
      desc: 'Numérisez une facture fournisseur : extraction des millésimes et stocks.',
      to: '/achats',
      icon: Truck,
      badge: 'Achats & Chai',
    },
  ],
  negoce: [
    {
      title: '1. Devis & Bon de Livraison (BL)',
      desc: 'Créez un devis client et basculez en vue Bon de Livraison logistique.',
      to: '/negoce',
      icon: FileText,
      badge: 'Ventes B2B',
    },
    {
      title: '2. Offres clients par lien public',
      desc: 'Partagez une sélection de flacons sans exposer vos prix d’achat.',
      to: '/negoce',
      icon: Sparkles,
      badge: 'Commercial',
    },
    {
      title: '3. Douane DRM & Export FEC',
      desc: 'Consultez la déclaration mensuelle de régie et l’export comptable.',
      to: '/compta',
      icon: Calculator,
      badge: 'Régie & Compta',
    },
  ],
  independant: [
    {
      title: '1. Vente Comptoir Express',
      desc: 'Encaissez un flacon et décomptez le stock en 2 clics sans fiche lourde.',
      to: '/negoce',
      icon: Zap,
      badge: 'Comptoir',
    },
    {
      title: '2. Stop-Rayons & Étiquettes',
      desc: 'Imprimez vos étiquettes de cave avec notes de dégustation et prix TTC.',
      to: '/vins',
      icon: Tag,
      badge: 'Boutique',
    },
    {
      title: '3. Dépôt-Vente Restaurateurs',
      desc: 'Suivez les bouteilles en dépôt chez vos partenaires CHR.',
      to: '/negoce',
      icon: Warehouse,
      badge: 'Partenaires',
    },
  ],
  chaine: [
    {
      title: '1. Comparatif Multi-Établissements',
      desc: 'Visualisez la valeur de stock et les alertes de rupture site par site.',
      to: '/',
      icon: Compass,
      badge: 'Direction',
    },
    {
      title: '2. Transfert de bouteilles inter-sites',
      desc: 'Transférez des flacons entre la cave centrale et les bars sans écart.',
      to: '/stock?new=transfer',
      icon: Truck,
      badge: 'Logistique',
    },
    {
      title: '3. Cartes dédiées par établissement',
      desc: 'Personnalisez une carte spécifique par hôtel ou restaurant du groupe.',
      to: '/carte',
      icon: BookOpen,
      badge: 'Multi-cartes',
    },
  ],
};

export function DemoDiscoveryBanner() {
  const { org } = useOrg();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(`lt-demo-discovery-hide:${org.id}`) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed || (!org.isDemo && !user?.demo)) return null;

  const steps = STEPS_BY_PROFILE[org.profile] || STEPS_BY_PROFILE.restaurant;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(`lt-demo-discovery-hide:${org.id}`, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand/30 bg-gradient-to-r from-brand-soft/80 via-surface to-brand-soft/40 p-4 md:p-5 shadow-xs">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-brand text-brand-fg shadow-xs">
            <Compass className="size-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-base font-semibold text-ink">
                Parcours de Découverte Démo (3 étapes clés)
              </span>
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
                {org.profile.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-muted">
              Guide rapide pour tester les points forts de la plateforme conçus pour votre métier.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
            title={collapsed ? 'Déplier le guide' : 'Réduire le guide'}
          >
            {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink cursor-pointer"
            title="Masquer le guide"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {steps.map((st, i) => {
            const Icon = st.icon;
            return (
              <Link
                key={i}
                to={st.to}
                className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-surface/90 p-3.5 transition hover:border-brand hover:shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted">
                      {st.badge}
                    </span>
                    <Icon className="size-4 text-brand group-hover:scale-110 transition" />
                  </div>
                  <h4 className="mt-2 font-display text-sm font-semibold text-ink leading-snug group-hover:text-brand">
                    {st.title}
                  </h4>
                  <p className="mt-1 text-xs text-muted leading-relaxed line-clamp-2">
                    {st.desc}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-end text-[11px] font-medium text-brand">
                  <span>Explorer →</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
