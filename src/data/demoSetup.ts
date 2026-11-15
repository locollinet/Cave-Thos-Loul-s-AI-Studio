import type { LegalInfo, Locale, ModuleId, OrgProfile } from '@/types';
import type { Op } from './store';
import type { Actor } from './stock';
import { buildDemoOps } from './demo';
import { buildServiceDemoOps } from '@/modules/service/demo';
import { buildOffersDemoOps } from '@/modules/negoce/offers/demo';
import { DEMO_MODELS, type DemoModel } from './demoModels';

export { DEMO_MODELS, type DemoModel };

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
