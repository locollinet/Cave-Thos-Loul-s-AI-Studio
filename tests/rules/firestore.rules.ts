// Règles Firestore exécutées dans l'émulateur : `npm run test:rules` (Java 11+ requis).
// Les écritures passent par le même code que l'application (commitToFirestore, buildMovementOps, démo…).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, increment, serverTimestamp, setDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { commitToFirestore, commitWithSequenceToFirestore } from '../../src/data/store';
import { buildMovementOps } from '../../src/data/stock';
import { buildFullDemoOps } from '../../src/data/demoSetup';
import { buildBottleOutOps } from '../../src/modules/service/logic';
import { buildValidationOps } from '../../src/modules/negoce/ops';
import { newDocument, withTotals } from '../../src/modules/negoce/calc';
import { emptyLegal } from '../../src/app/org';
import { PROFILE_MODULES } from '../../src/registry';
import type { Wine, OrgProfile } from '../../src/types';

let env: RulesTestEnvironment;
const ORG = 'o1';
const W1: Wine = { id: 'w1', producer: 'Domaine Leflaive', name: 'Puligny-Montrachet', vintage: '2020', color: 'blanc', formatCl: 75, alertThreshold: 2, canonicalKey: 'w1', createdAt: 1, updatedAt: 1 };

const MEMBERS = { owner1: 'owner', man1: 'manager', som1: 'sommelier', acc1: 'accountant', staff1: 'staff' } as const;
type Uid = keyof typeof MEMBERS | 'stranger' | 'invitee' | 'admin';

function db(uid: Uid, claims: Record<string, unknown> = {}): Firestore {
  return env.authenticatedContext(uid, { email: `${uid}@palace.example`, email_verified: true, ...claims }).firestore() as unknown as Firestore;
}
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;
const actorOf = (uid: Uid) => ({ userId: uid, userName: uid });

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-cave', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    await setDoc(doc(f, `orgs/${ORG}`), { id: ORG, ownerUid: 'owner1', name: 'Le Grand Palais', modules: ['stock', 'carte'] });
    for (const [uid, role] of Object.entries(MEMBERS)) await setDoc(doc(f, `orgs/${ORG}/members/${uid}`), { uid, role, email: `${uid}@palace.example`, name: uid });
    await setDoc(doc(f, `orgs/${ORG}/sites/s1`), { id: 's1', name: 'Cave', kind: 'cave' });
    await setDoc(doc(f, `orgs/${ORG}/sites/s2`), { id: 's2', name: 'Bar', kind: 'bar' });
    await setDoc(doc(f, `orgs/${ORG}/wines/w1`), W1);
    await setDoc(doc(f, `orgs/${ORG}/wineCosts/w1`), { id: 'w1', buyPriceHT: 48 });
    await setDoc(doc(f, `orgs/${ORG}/stock/w1__s1`), { id: 'w1__s1', wineId: 'w1', siteId: 's1', qty: 10 });
  });
});

describe('cloisonnement des prix d’achat', () => {
  it('l’équipe de salle lit le catalogue mais jamais les coûts', async () => {
    const staff = db('staff1');
    const wine = await assertSucceeds(getDoc(doc(staff, `orgs/${ORG}/wines/w1`)));
    expect(wine.data()?.buyPriceHT).toBeUndefined();
    await assertFails(getDocs(collection(staff, `orgs/${ORG}/wineCosts`)));
    await assertFails(getDocs(collection(staff, `orgs/${ORG}/movementCosts`)));
    await assertFails(getDocs(collection(staff, `orgs/${ORG}/allocations`)));
  });

  it('le back-office lit les coûts', async () => {
    for (const uid of ['owner1', 'man1', 'som1', 'acc1'] as const) await assertSucceeds(getDocs(collection(db(uid), `orgs/${ORG}/wineCosts`)));
  });

  it('une fiche vin enregistrée par l’application range le prix d’achat à part', async () => {
    await assertSucceeds(commitToFirestore(db('som1'), [{ op: 'set', path: `orgs/${ORG}/wines/w2`, data: { ...W1, id: 'w2', buyPriceHT: 31.5, coefficient: 2.2 } }]));
    const main = await getDoc(doc(db('staff1'), `orgs/${ORG}/wines/w2`));
    expect(main.data()).not.toHaveProperty('buyPriceHT');
    expect(main.data()).not.toHaveProperty('coefficient');
    expect((await getDoc(doc(db('som1'), `orgs/${ORG}/wineCosts/w2`))).data()).toMatchObject({ buyPriceHT: 31.5, coefficient: 2.2 });
  });

  it('refuse un prix d’achat écrit directement dans le catalogue partagé', async () => {
    await assertFails(setDoc(doc(db('owner1'), `orgs/${ORG}/wines/w3`), { ...W1, id: 'w3', buyPriceHT: 10 }));
  });

  it('autorise la migration d’une fiche ancienne (prix retiré du catalogue)', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `orgs/${ORG}/wines/old`), { ...W1, id: 'old', buyPriceHT: 22 }));
    const som = db('som1');
    const b = writeBatch(som);
    b.set(doc(som, `orgs/${ORG}/wineCosts/old`), { id: 'old', buyPriceHT: 22 }, { merge: true });
    b.set(doc(som, `orgs/${ORG}/wines/old`), { buyPriceHT: deleteField() }, { merge: true });
    await assertSucceeds(b.commit());
    await assertFails(setDoc(doc(db('staff1'), `orgs/${ORG}/wines/old`), { notes: 'x' }, { merge: true }));
  });

  it('un mouvement ne porte jamais son coût dans le journal partagé', async () => {
    const ops = buildMovementOps(ORG, [{ wine: W1, siteId: 's1', type: 'in', qty: 6, reason: 'achat', unitCostHT: 48 }], actorOf('som1'));
    await assertSucceeds(commitToFirestore(db('som1'), ops));
    const mvs = await getDocs(collection(db('staff1'), `orgs/${ORG}/movements`));
    expect(mvs.docs[0].data()).not.toHaveProperty('unitCostHT');
    const costs = await getDocs(collection(db('acc1'), `orgs/${ORG}/movementCosts`));
    expect(costs.docs[0].data()).toMatchObject({ unitCostHT: 48 });
    await assertFails(setDoc(doc(db('som1'), `orgs/${ORG}/movements/m-cost`), { id: 'm-cost', type: 'in', reason: 'achat', qty: 1, wineId: 'w1', siteId: 's1', userId: 'som1', unitCostHT: 5 }));
  });
});

describe('stock et mouvements', () => {
  it('le service en salle sort une bouteille (mouvement + stock dans le même lot)', async () => {
    const ops = buildBottleOutOps(ORG, W1, 's1', 10, actorOf('staff1'))!;
    await assertSucceeds(commitToFirestore(db('staff1'), ops));
    expect((await getDoc(doc(db('owner1'), `orgs/${ORG}/stock/w1__s1`))).data()?.qty).toBe(9);
  });

  it('l’équipe transfère des bouteilles entre deux sites', async () => {
    const ops = buildMovementOps(ORG, [{ wine: W1, siteId: 's1', toSiteId: 's2', type: 'transfer', qty: 2, reason: 'transfert' }], actorOf('staff1'));
    await assertSucceeds(commitToFirestore(db('staff1'), ops));
    expect((await getDoc(doc(db('owner1'), `orgs/${ORG}/stock/w1__s2`))).data()?.qty).toBe(2);
  });

  it('refuse une quantité modifiée sans mouvement', async () => {
    await assertFails(setDoc(doc(db('staff1'), `orgs/${ORG}/stock/w1__s1`), { qty: 999 }, { merge: true }));
    await assertFails(setDoc(doc(db('staff1'), `orgs/${ORG}/stock/w1__s1`), { qty: increment(-3), mv: ['inexistant'] }, { merge: true }));
  });

  it('refuse une quantité qui ne correspond pas au mouvement', async () => {
    const ops = buildMovementOps(ORG, [{ wine: W1, siteId: 's1', type: 'out', qty: 1, reason: 'casse' }], actorOf('staff1'));
    const forged = ops.map((o) => (o.op === 'inc' ? { ...o, by: -6 } : o));
    await assertFails(commitToFirestore(db('staff1'), forged));
  });

  it('refuse un mouvement signé au nom d’un autre', async () => {
    const ops = buildMovementOps(ORG, [{ wine: W1, siteId: 's1', type: 'out', qty: 1, reason: 'casse' }], actorOf('som1'));
    await assertFails(commitToFirestore(db('staff1'), ops));
  });

  it('l’équipe range une bouteille sans toucher à la quantité', async () => {
    await assertSucceeds(setDoc(doc(db('staff1'), `orgs/${ORG}/stock/w1__s1`), { bin: 'A3', bins: ['A3'], updatedAt: 1 }, { merge: true }));
  });

  it('les mouvements sont immuables et le stock jamais négatif', async () => {
    const ops = buildMovementOps(ORG, [{ wine: W1, siteId: 's1', type: 'out', qty: 1, reason: 'vente' }], actorOf('owner1'));
    await assertSucceeds(commitToFirestore(db('owner1'), ops));
    const mvPath = ops.find((o) => o.path.includes('/movements/'))!.path;
    await assertFails(setDoc(doc(db('owner1'), mvPath), { qty: 50 }, { merge: true }));
    await assertFails(deleteDoc(doc(db('owner1'), mvPath)));
    await assertFails(commitToFirestore(db('owner1'), buildMovementOps(ORG, [{ wine: W1, siteId: 's1', type: 'out', qty: 50, reason: 'vente' }], actorOf('owner1'))));
  });
});

describe('numérotation légale', () => {
  const invoice = () =>
    withTotals({
      ...newDocument('invoice', { siteId: 's1', vatRate: 20, userId: 'acc1', date: '2026-11-02' }),
      partnerId: 'p1',
      partnerName: 'Hôtel Lutetia',
      lines: [{ id: 'l1', wineId: 'w1', description: 'Puligny', qty: 2, unitPriceHT: 95, discountPct: 0, vatRate: 20 }],
    });

  it('valide des factures numérotées sans trou ni doublon', async () => {
    const acc = db('acc1');
    for (const expected of [1, 2]) {
      const seq = await assertSucceeds(
        commitWithSequenceToFirestore(acc, ORG, 'FAC-2026', (n) => buildValidationOps({ orgId: ORG, doc: invoice(), prefix: 'FAC', seq: n, wines: [W1], actor: actorOf('acc1'), skipCounterOp: true }).ops),
      );
      expect(seq).toBe(expected);
    }
    expect((await getDoc(doc(acc, `orgs/${ORG}/counters/FAC-2026`))).data()?.value).toBe(2);
  });

  it('interdit de remettre un compteur à zéro, de sauter un numéro ou de le supprimer', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `orgs/${ORG}/counters/FAC-2026`), { id: 'FAC-2026', value: 12 }));
    const owner = db('owner1');
    await assertFails(setDoc(doc(owner, `orgs/${ORG}/counters/FAC-2026`), { value: 1 }, { merge: true }));
    await assertFails(setDoc(doc(owner, `orgs/${ORG}/counters/FAC-2026`), { value: 14 }, { merge: true }));
    await assertFails(deleteDoc(doc(owner, `orgs/${ORG}/counters/FAC-2026`)));
    await assertSucceeds(setDoc(doc(owner, `orgs/${ORG}/counters/FAC-2026`), { value: increment(1) }, { merge: true }));
  });

  it('l’équipe de salle n’accède pas aux documents financiers', async () => {
    await assertFails(getDocs(collection(db('staff1'), `orgs/${ORG}/documents`)));
    await assertFails(getDocs(collection(db('staff1'), `orgs/${ORG}/counters`)));
  });
});

describe('invitations', () => {
  const invite = (over: Record<string, unknown> = {}) => ({ email: 'invitee@palace.example', role: 'sommelier', token: 'tok_0123456789abcdef', createdAt: Date.now(), expiresAt: Date.now() + 7 * 86_400_000, ...over });
  const seedInvite = (over: Record<string, unknown> = {}) =>
    env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `orgs/${ORG}/invites/invitee@palace.example`), invite(over)));
  const join = (f: Firestore, token: string, role = 'sommelier') => {
    const b = writeBatch(f);
    b.set(doc(f, `orgs/${ORG}/members/invitee`), { uid: 'invitee', email: 'invitee@palace.example', name: 'Invité', role, createdAt: 1, inviteToken: token });
    b.delete(doc(f, `orgs/${ORG}/invites/invitee@palace.example`));
    return b.commit();
  };

  it('seul le propriétaire invite, avec un jeton et une échéance', async () => {
    await assertSucceeds(setDoc(doc(db('owner1'), `orgs/${ORG}/invites/invitee@palace.example`), invite()));
    await assertFails(setDoc(doc(db('man1'), `orgs/${ORG}/invites/x@palace.example`), invite({ email: 'x@palace.example' })));
    await assertFails(setDoc(doc(db('owner1'), `orgs/${ORG}/invites/y@palace.example`), invite({ token: 'court' })));
    await assertFails(setDoc(doc(db('owner1'), `orgs/${ORG}/invites/z@palace.example`), invite({ role: 'owner' })));
  });

  it('l’invité rejoint avec le bon jeton et consomme son invitation', async () => {
    await seedInvite();
    await assertSucceeds(join(db('invitee'), 'tok_0123456789abcdef'));
  });

  it('refuse un mauvais jeton, un email non vérifié, une invitation expirée ou un autre rôle', async () => {
    await seedInvite();
    await assertFails(join(db('invitee'), 'tok_devine'));
    await assertFails(join(db('invitee', { email_verified: false }), 'tok_0123456789abcdef'));
    await assertFails(join(db('invitee'), 'tok_0123456789abcdef', 'owner'));
    await seedInvite({ expiresAt: Date.now() - 1000 });
    await assertFails(join(db('invitee'), 'tok_0123456789abcdef'));
  });

  it('personne ne s’ajoute seul à une organisation', async () => {
    await assertFails(setDoc(doc(db('stranger'), `orgs/${ORG}/members/stranger`), { uid: 'stranger', role: 'staff' }));
  });
});

describe('organisations et démos', () => {
  const create = async (f: Firestore, uid: string, orgId: string, profile: OrgProfile) => {
    const now = Date.now();
    await commitToFirestore(f, [
      { op: 'set', path: `orgs/${orgId}`, data: { id: orgId, ownerUid: uid, name: 'Maison Démo', profile, modules: PROFILE_MODULES[profile], locale: 'fr', currency: 'EUR', legal: emptyLegal(), invoicePrefix: 'FAC', quotePrefix: 'DEV', defaultVatRate: 20, defaultCoefficient: 1.6, createdAt: now } },
      { op: 'set', path: `orgs/${orgId}/members/${uid}`, data: { uid, email: `${uid}@palace.example`, name: uid, role: 'owner', createdAt: now } },
    ]);
    await commitToFirestore(f, [{ op: 'set', path: `orgs/${orgId}/sites/main`, data: { id: 'main', name: 'Cave principale', kind: 'cave', createdAt: now } }]);
  };

  it('crée une organisation en un seul lot (organisation + propriétaire)', async () => {
    await assertSucceeds(create(db('stranger'), 'stranger', 'neworg', 'restaurant'));
  });

  it.each(['restaurant', 'negoce', 'independant', 'chaine'] as OrgProfile[])('génère la démo complète « %s » sur Firebase', async (profile) => {
    const f = db('stranger');
    await create(f, 'stranger', `demo-${profile}`, profile);
    const ops = buildFullDemoOps(`demo-${profile}`, 'main', profile, {
      orgName: 'Maison Démo',
      modules: PROFILE_MODULES[profile],
      locale: 'fr',
      defaultVatRate: 20,
      legal: emptyLegal(),
      actor: actorOf('stranger'),
      sampleMembers: false,
    });
    await assertSucceeds(commitToFirestore(f, ops, { allowChunking: true }));
  });

  it('la console plateforme prépare une démo prospect et invite son propriétaire', async () => {
    const admin = db('admin', { platformAdmin: true });
    await assertSucceeds(create(admin, 'admin', 'prospect', 'restaurant'));
    await assertSucceeds(setDoc(doc(admin, 'orgs/prospect/invites/dir@prospect.example'), invite2()));
    function invite2() {
      return { email: 'dir@prospect.example', role: 'owner', token: 'tok_prospect_0123456', createdAt: Date.now(), expiresAt: Date.now() + 86_400_000 };
    }
  });

  it('l’équipe de salle ne modifie pas les modules de l’organisation', async () => {
    await assertFails(setDoc(doc(db('staff1'), `orgs/${ORG}`), { modules: ['stock'] }, { merge: true }));
    await assertSucceeds(setDoc(doc(db('man1'), `orgs/${ORG}`), { modules: ['stock', 'carte', 'achats'] }, { merge: true }));
  });

  it('le propriétaire dépose une demande de suppression RGPD suivie par la plateforme', async () => {
    const req = { orgId: ORG, requestedBy: 'owner1', requestedByEmail: 'owner1@palace.example', status: 'pending', createdAt: Date.now() };
    await assertFails(setDoc(doc(db('man1'), `deletionRequests/${ORG}`), { ...req, requestedBy: 'man1' }));
    await assertSucceeds(setDoc(doc(db('owner1'), `deletionRequests/${ORG}`), req));
    await assertSucceeds(getDocs(collection(db('admin', { platformAdmin: true }), 'deletionRequests')));
  });

  it('un rapport de caisse ne peut être importé qu’une fois', async () => {
    await assertSucceeds(setDoc(doc(db('som1'), `orgs/${ORG}/posImports/sha-abc`), { id: 'sha-abc', lines: 4, createdAt: 1 }));
    await assertFails(setDoc(doc(db('som1'), `orgs/${ORG}/posImports/sha-abc`), { id: 'sha-abc', lines: 4, createdAt: 2 }));
    await assertFails(setDoc(doc(db('staff1'), `orgs/${ORG}/posImports/sha-def`), { id: 'sha-def', lines: 1, createdAt: 1 }));
  });
});

describe('liens publics', () => {
  const offer = (over: Record<string, unknown> = {}) => ({
    publicId: 'offrepublique0123456789',
    orgId: ORG,
    orgName: 'Le Grand Palais',
    number: 'OFF-2026-0001',
    title: 'Sélection Bourgogne',
    intro: '',
    language: 'fr',
    validUntil: '2026-12-31',
    vatRate: 20,
    theme: {},
    items: [],
    updatedAt: 1,
    expiresAt: Date.now() + 86_400_000,
    ...over,
  });

  it('une offre publiée ne transporte aucun champ hors liste', async () => {
    await assertSucceeds(setDoc(doc(db('man1'), 'public_offers/offrepublique0123456789'), offer()));
    await assertFails(setDoc(doc(db('man1'), 'public_offers/offrepublique0123456789'), offer({ buyPriceHT: 12 })));
  });

  it('une offre expirée n’est plus lisible ; la liste des offres est fermée', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'public_offers/active0123456789abcdef'), offer({ publicId: 'active0123456789abcdef' }));
      await setDoc(doc(ctx.firestore(), 'public_offers/expired0123456789abcde'), offer({ publicId: 'expired0123456789abcde', expiresAt: Date.now() - 1000 }));
    });
    await assertSucceeds(getDoc(doc(anon(), 'public_offers/active0123456789abcdef')));
    await assertFails(getDoc(doc(anon(), 'public_offers/expired0123456789abcde')));
    await assertSucceeds(getDoc(doc(anon(), 'public_offers/inexistante0123456789')));
    await assertFails(getDocs(collection(anon(), 'public_offers')));
    await assertFails(getDocs(collection(anon(), 'public_lists')));
  });

  it('les horodatages serveur des mouvements sont exigés exacts', async () => {
    const f = db('staff1');
    await assertFails(setDoc(doc(f, `orgs/${ORG}/movements/m1`), { id: 'm1', type: 'out', reason: 'casse', qty: 1, wineId: 'w1', siteId: 's1', userId: 'staff1', at: 12 }));
    await assertSucceeds(setDoc(doc(f, `orgs/${ORG}/movements/m2`), { id: 'm2', type: 'out', reason: 'casse', qty: 1, wineId: 'w1', siteId: 's1', userId: 'staff1', at: serverTimestamp() }));
  });
});
