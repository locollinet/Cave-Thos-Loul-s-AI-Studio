import type { InventorySession, Invite, LegalInfo, Locale, ModuleId, OrgProfile, PurchaseInvoice } from '@/types';
import type { Op } from './store';
import type { Actor } from './stock';
import { buildDemoOps } from './demo';
import { buildSecondaryCarte } from './demo/carte';
import { buildServiceDemoOps } from '@/modules/service/demo';
import { buildOffersDemoOps } from '@/modules/negoce/offers/demo';
import { computeTotals } from '@/modules/achats/logic';
import { wineLabel } from '@/lib/wine';
import { round2, uid } from '@/lib/utils';
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
 * + bouteilles ouvertes au verre (module carte) + offres clients (module négoce) + brouillons & inventaire en cours.
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
    modules: setup.modules,
    actor: setup.actor,
    extras: (ctx) => {
      const extra: Op[] = [];

      // 1. Service au verre + 2e carte multi-sites si module Carte actif
      if (setup.modules.includes('carte')) {
        extra.push(...buildServiceDemoOps(orgId, ctx.serviceSiteId, ctx.wines.filter((w) => ctx.stockQty(w.id, ctx.serviceSiteId) > 0), ctx.now, ctx.actor));
        const secSite = ctx.sites.find((s) => s.id !== ctx.mainSiteId);
        if (secSite) {
          extra.push(...buildSecondaryCarte(orgId, setup.orgName, secSite.id, `Carte — ${secSite.name}`, ctx.wines, ctx.stock, ctx.now));
        }
      }

      // 2. Offres commerciales si module Négoce actif
      if (setup.modules.includes('negoce')) {
        extra.push(...buildOffersDemoOps(orgId, ctx.wines, ctx.clients, ctx.now, { name: setup.orgName, locale: setup.locale, defaultVatRate: setup.defaultVatRate, legal: setup.legal }));
      }

      // 3. Facture d'achat en brouillon à valider si module Achats actif
      if (setup.modules.includes('achats') && ctx.suppliers.length && ctx.wines.length) {
        const sup = ctx.suppliers[0];
        const picks = ctx.wines.filter((w) => !w.isArchived && !w.isPreSale).slice(0, 2);
        const lines = picks.map((w) => ({
          wineId: w.id,
          description: wineLabel(w),
          producer: w.producer,
          vintage: w.vintage,
          formatCl: w.formatCl,
          qty: 6,
          unitPriceHT: round2(w.buyPriceHT ?? 40),
          vatRate: setup.defaultVatRate,
          received: false,
        }));
        const totals = computeTotals(lines, 35, setup.defaultVatRate);
        const draftInv: PurchaseInvoice = {
          id: `demo-purchase-draft-${orgId.slice(0, 6)}`,
          supplierId: sup.id,
          supplierName: sup.name,
          number: 'BROUILLON-RECEPTION',
          date: ctx.today,
          lines,
          shippingHT: 35,
          totalHT: totals.ht,
          totalVAT: totals.vat,
          totalTTC: totals.ttc,
          status: 'draft',
          siteId: ctx.mainSiteId,
          createdAt: ctx.now - 3_600_000,
          createdBy: ctx.actor.userName,
        };
        extra.push({ op: 'set', path: `orgs/${orgId}/purchaseInvoices/${draftInv.id}`, data: JSON.parse(JSON.stringify(draftInv)) });
      }

      // 4. Session d'inventaire en cours (ouverte) pour tester le comptage & la validation d'écarts
      if (setup.modules.includes('stock')) {
        const sampleWines = ctx.wines.filter((w) => !w.isArchived && ctx.stockQty(w.id, ctx.mainSiteId) > 0).slice(0, 4);
        const counts: Record<string, number> = {};
        sampleWines.forEach((w, idx) => {
          const cur = ctx.stockQty(w.id, ctx.mainSiteId);
          counts[w.id] = idx === 0 ? Math.max(0, cur - 1) : cur;
        });
        const openInv: InventorySession = {
          id: `demo-inv-open-${orgId.slice(0, 6)}`,
          siteId: ctx.mainSiteId,
          name: 'Inventaire partiel en cours (Contrôle Grands Crus)',
          status: 'open',
          counts,
          startedAt: ctx.now - 2 * 3_600_000,
          userName: ctx.actor.userName,
        };
        extra.push({ op: 'set', path: `orgs/${orgId}/inventories/${openInv.id}`, data: openInv as never });
      }

      // 5. Invitation d'équipe en attente (dans Réglages > Équipe)
      const inviteEmail = 'sommelier.demo@exemple.fr';
      const inviteDoc: Invite = {
        email: inviteEmail,
        role: 'sommelier',
        token: `demo_invite_${uid()}_${uid()}`,
        createdAt: ctx.now - 86_400_000,
        expiresAt: ctx.now + 7 * 86_400_000,
      };
      extra.push({ op: 'set', path: `orgs/${orgId}/invites/${inviteEmail}`, data: inviteDoc as never });

      return extra;
    },
  });

  return [...memberOps, ...demoOps];
}
