import type { LegalInfo, Locale, ModuleId, OrgProfile, Role } from '@/types';
import type { Op } from './store';
import type { Actor } from './stock';
import { buildDemoOps } from './demo';
import { buildServiceDemoOps } from '@/modules/service/demo';
import { buildOffersDemoOps } from '@/modules/negoce/offers/demo';

export interface DemoModel {
  profile: OrgProfile;
  name: string;
  location: string;
  headline: string;
  description: string;
  accounts: { role: Role; name: string; email: string }[];
}

export const DEMO_MODELS: Record<OrgProfile, DemoModel> = {
  negoce: {
    profile: 'negoce',
    name: 'Maison Bertrand & Fils',
    location: 'Beaune',
    headline: 'Maison de négoce (catalogue large, achats, factures, relances, compta)',
    description: '12 mois d’achats et ventes, offres publiées, relances d’impayés, TVA & douane.',
    accounts: [
      { role: 'owner', name: 'Pierre Bertrand', email: 'pierre.bertrand@bertrand-vins.example' },
      { role: 'manager', name: 'Sophie Dubois', email: 'sophie.dubois@bertrand-vins.example' },
      { role: 'accountant', name: 'Luc Martin', email: 'luc.martin@bertrand-vins.example' },
      { role: 'staff', name: 'Julien Faure', email: 'julien.faure@bertrand-vins.example' },
    ],
  },
  independant: {
    profile: 'independant',
    name: 'Cave Itinérante — Claire Martin',
    location: 'Bordeaux & itinérant',
    headline: 'Négociant indépendant sans boutique (mobile, devis rapides, dépôt-vente)',
    description: 'Devis rapides sur mobile, sélection de vins d’artisans, offres partagées par lien.',
    accounts: [
      { role: 'owner', name: 'Claire Martin', email: 'claire.martin@cave-itinerante.example' },
      { role: 'staff', name: 'Thomas Morel', email: 'thomas.morel@cave-itinerante.example' },
    ],
  },
  restaurant: {
    profile: 'restaurant',
    name: 'Le Grand Palais',
    location: 'Paris',
    headline: 'Palace & Restaurant gastronomique (carte QR, multilingue, vins au verre, photos)',
    description: 'Charte palace, carte des vins multilingue (FR/EN/IT), mode service en salle et bouteilles ouvertes.',
    accounts: [
      { role: 'owner', name: 'Antoine de Saint-Germain', email: 'direction@legrandpalais.example' },
      { role: 'sommelier', name: 'Marc Sommelier', email: 'sommelier@legrandpalais.example' },
      { role: 'staff', name: 'Camille Service', email: 'service@legrandpalais.example' },
    ],
  },
  chaine: {
    profile: 'chaine',
    name: 'Groupe Riviera Hôtels',
    location: 'Paris & Annecy',
    headline: 'Chaîne & groupe (multi-établissements, transferts, consolidation)',
    description: '3 établissements (Palais Paris, Hôtel du Lac, Bar), transferts de bouteilles, gestion centralisée.',
    accounts: [
      { role: 'owner', name: 'Hélène Riviera', email: 'direction@riviera-hotels.example' },
      { role: 'manager', name: 'Alexandre Achats', email: 'achats@riviera-hotels.example' },
      { role: 'accountant', name: 'Valérie Finance', email: 'finance@riviera-hotels.example' },
    ],
  },
};

export interface DemoSetup {
  orgName: string;
  modules: ModuleId[];
  locale: Locale;
  defaultVatRate: number;
  legal: LegalInfo;
  now?: number;
  /** Auteur des mouvements (obligatoire sur Firebase : les règles exigent la signature de l'utilisateur connecté). */
  actor?: Actor;
  /** Fiches équipe fictives (mode démo local uniquement : sur Firebase, un membre est toujours un vrai compte). */
  sampleMembers?: boolean;
}

/**
 * Jeu de démonstration complet d'un nouvel espace : catalogue, historique, documents…
 * + bouteilles ouvertes au verre (module carte) + offres clients (module négoce).
 */
export function buildFullDemoOps(orgId: string, mainSiteId: string, profile: OrgProfile, setup: DemoSetup): Op[] {
  const model = DEMO_MODELS[profile];
  const now = setup.now ?? Date.now();
  // Générer les comptes membres de démonstration pour chaque rôle
  const memberOps: Op[] = setup.sampleMembers === false ? [] : model.accounts.map((a, i) => ({
    op: 'set',
    path: `orgs/${orgId}/members/demo-${profile}-${a.role}`,
    data: { uid: `demo-${profile}-${a.role}`, name: a.name, email: a.email, role: a.role, createdAt: now + i * 1000 },
  }));

  const demoOps = buildDemoOps(orgId, mainSiteId, profile, {
    orgName: setup.orgName,
    now,
    actor: setup.actor,
    extras: (ctx) => [
      ...(setup.modules.includes('carte')
        ? buildServiceDemoOps(orgId, ctx.serviceSiteId, ctx.wines.filter((w) => ctx.stockQty(w.id, ctx.serviceSiteId) > 0), ctx.now, ctx.actor)
        : []),
      ...(setup.modules.includes('negoce')
        ? buildOffersDemoOps(orgId, ctx.wines, ctx.clients, ctx.now, { name: setup.orgName, locale: setup.locale, defaultVatRate: setup.defaultVatRate, legal: setup.legal })
        : []),
    ],
  });

  return [...memberOps, ...demoOps];
}
