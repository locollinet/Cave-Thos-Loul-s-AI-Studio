import {
  BarChart3,
  BookOpen,
  Boxes,
  Calculator,
  FileText,
  GlassWater,
  Layers,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  Wine as WineIcon,
  type LucideIcon,
} from 'lucide-react';
import type { ModuleId, OrgProfile, Role } from '@/types';
import { ROLE_RANK } from '@/types';

export type NavGroup = 'cockpit' | 'service' | 'cellar' | 'commerce' | 'admin';

export interface NavItem {
  id: string;
  path: string;
  labelKey: string;
  hintKey?: string;
  group?: NavGroup;
  icon: LucideIcon;
  module?: ModuleId; // si défini, requiert que le module soit activé
  roles?: Role[]; // si défini, rôles autorisés (sinon tous)
  keywords?: string; // pour la palette de commandes
  platformOnly?: boolean; // réservé au rôle plateforme
}

export const NAV: NavItem[] = [
  { id: 'dashboard', path: '/', labelKey: 'nav.dashboard', hintKey: 'nav.hint.dashboard', group: 'cockpit', icon: LayoutDashboard, keywords: 'accueil cockpit direction résumé' },

  { id: 'service', path: '/service', labelKey: 'nav.service', hintKey: 'nav.hint.service', group: 'service', icon: GlassWater, module: 'carte', keywords: 'service salle verre au verre bouteilles ouvertes tablette coravin ticket z pos' },
  { id: 'carte', path: '/carte', labelKey: 'nav.carte', hintKey: 'nav.hint.carte', group: 'service', icon: BookOpen, module: 'carte', roles: ['owner', 'manager', 'sommelier'], keywords: 'carte des vins menu qr sommelier ia client' },

  { id: 'wines', path: '/vins', labelKey: 'nav.wines', hintKey: 'nav.hint.wines', group: 'cellar', icon: WineIcon, module: 'stock', keywords: 'référentiel catalogue produits cuvées fiches techniques allocations' },
  { id: 'cellarPlan', path: '/plan-de-cave', labelKey: 'nav.cellarPlan', hintKey: 'nav.hint.cellarPlan', group: 'cellar', icon: Layers, module: 'stock', keywords: 'plan de cave casiers alvéoles étagères quinconce rangement goulots' },
  { id: 'stock', path: '/stock', labelKey: 'nav.stock', hintKey: 'nav.hint.stock', group: 'cellar', icon: Boxes, module: 'stock', keywords: 'mouvements entrées sorties transferts casse journal ticket z inventaire comptage' },

  { id: 'achats', path: '/achats', labelKey: 'nav.achats', hintKey: 'nav.hint.achats', group: 'commerce', icon: Truck, module: 'achats', roles: ['owner', 'manager', 'sommelier', 'accountant'], keywords: 'factures fournisseurs réception import ia pdf ocr' },
  { id: 'negoce', path: '/negoce', labelKey: 'nav.negoce', hintKey: 'nav.hint.negoce', group: 'commerce', icon: ShoppingCart, module: 'negoce', roles: ['owner', 'manager', 'accountant'], keywords: 'devis factures clients dépôt-vente offres' },
  { id: 'contacts', path: '/contacts', labelKey: 'nav.contacts', hintKey: 'nav.hint.contacts', group: 'commerce', icon: Users, roles: ['owner', 'manager', 'sommelier', 'accountant'], keywords: 'clients fournisseurs domaines partenaires' },

  { id: 'pilotage', path: '/pilotage', labelKey: 'nav.pilotage', hintKey: 'nav.hint.pilotage', group: 'admin', icon: BarChart3, module: 'pilotage', roles: ['owner', 'manager', 'sommelier', 'accountant'], keywords: 'marges analyse stratégie millésimes verticales rotation abc multi-sites' },
  { id: 'compta', path: '/compta', labelKey: 'nav.compta', hintKey: 'nav.hint.compta', group: 'admin', icon: Calculator, module: 'compta', roles: ['owner', 'manager', 'accountant'], keywords: 'tva drm douane charges immobilisations fec' },
  { id: 'settings', path: '/reglages', labelKey: 'nav.settings', hintKey: 'nav.hint.settings', group: 'admin', icon: Settings, roles: ['owner', 'manager'], keywords: 'organisation sites équipe paramètres charte' },
  { id: 'platform', path: '/plateforme', labelKey: 'nav.platform', group: 'admin', icon: ShieldCheck, platformOnly: true, keywords: 'administration démos prospects console' },
];

export const MODULE_LIST: { id: ModuleId; labelKey: string; descKey: string; icon: LucideIcon }[] = [
  { id: 'stock', labelKey: 'mod.stock', descKey: 'mod.stock.desc', icon: Boxes },
  { id: 'carte', labelKey: 'mod.carte', descKey: 'mod.carte.desc', icon: BookOpen },
  { id: 'achats', labelKey: 'mod.achats', descKey: 'mod.achats.desc', icon: Truck },
  { id: 'negoce', labelKey: 'mod.negoce', descKey: 'mod.negoce.desc', icon: FileText },
  { id: 'compta', labelKey: 'mod.compta', descKey: 'mod.compta.desc', icon: Calculator },
  { id: 'pilotage', labelKey: 'mod.pilotage', descKey: 'mod.pilotage.desc', icon: BarChart3 },
];

/** Modules activés par défaut selon le profil d'entreprise. */
export const PROFILE_MODULES: Record<OrgProfile, ModuleId[]> = {
  negoce: ['stock', 'achats', 'negoce', 'compta', 'pilotage', 'carte'],
  independant: ['stock', 'achats', 'negoce', 'compta', 'pilotage'],
  restaurant: ['stock', 'carte', 'achats', 'pilotage'],
  chaine: ['stock', 'carte', 'achats', 'compta', 'pilotage'],
};

export const hasRole = (role: Role | undefined, allowed?: Role[]): boolean => !allowed || (!!role && allowed.includes(role));
export const atLeast = (role: Role | undefined, min: Role): boolean => !!role && ROLE_RANK[role] >= ROLE_RANK[min];

export const isNavVisible = (item: NavItem, modules: ModuleId[], role: Role | undefined, isPlatformAdmin = false): boolean => {
  if (item.platformOnly) return isPlatformAdmin;
  return (!item.module || modules.includes(item.module)) && hasRole(role, item.roles);
};
