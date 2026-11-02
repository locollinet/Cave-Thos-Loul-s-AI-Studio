import { useEffect, useState } from 'react';
import { Building2, Calendar, Check, Copy, ExternalLink, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useAuth } from '@/app/auth';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Table, Td, Th, useToast } from '@/ui';
import { DEMO_MODELS, type DemoModel } from '@/data/demoSetup';
import { uid } from '@/lib/utils';
import type { Invite, Member, Org, OrgProfile, Site } from '@/types';
import { emptyLegal } from '@/app/org';
import { PROFILE_MODULES } from '@/registry';

interface DeletionRequestRow {
  orgId: string;
  orgName: string;
  requestedByEmail?: string;
  status: 'pending' | 'processing' | 'done';
  createdAt: number;
}

export default function PlatformAdminPage() {
  const { t } = useI18n();
  const { toast, confirm } = useToast();
  const { user } = useAuth();
  const { orgs, switchOrg, orgId: currentOrgId, store } = useOrg();

  const [modalOpen, setModalOpen] = useState(false);
  const [prospectName, setProspectName] = useState('');
  const [profile, setProfile] = useState<OrgProfile>('restaurant');
  const [prospectEmail, setProspectEmail] = useState('');
  const [durationDays, setDurationDays] = useState(30);
  const [accentColor, setAccentColor] = useState('#b8924a');
  const [createdLink, setCreatedLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequestRow[]>([]);

  const canAccess = !!user?.isPlatformAdmin || !!user?.demo;

  useEffect(() => {
    if (!user?.isPlatformAdmin || store.mode === 'local') return;
    return store.subscribeCollection<DeletionRequestRow>('deletionRequests', (rows) => setDeletionRequests(rows.sort((a, b) => b.createdAt - a.createdAt)), undefined, () => undefined);
  }, [store, user?.isPlatformAdmin]);

  const setDeletionStatus = async (orgId: string, status: DeletionRequestRow['status']) => {
    try {
      await store.commit([{ op: 'set', path: `deletionRequests/${orgId}`, data: { status, updatedAt: Date.now(), handledBy: user?.email ?? '' }, merge: true }]);
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  };

  if (!canAccess) {
    return (
      <Card className="p-8 text-center">
        <h2 className="font-display text-xl font-semibold text-bad">Accès réservé</h2>
        <p className="mt-2 text-sm text-muted">Cette console est réservée à l'équipe commerciale et au support Loul's &amp; Thos.</p>
      </Card>
    );
  }

  const handleCreateProspectDemo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prospectName.trim()) return;
    setBusy(true);
    try {
      const newOrgId = uid();
      const mainSiteId = uid();
      const now = Date.now();
      const expiresAt = now + durationDays * 86_400_000;
      const model = DEMO_MODELS[profile];

      const newOrg: Org = {
        id: newOrgId,
        ownerUid: user.uid,
        name: prospectName.trim(),
        profile,
        modules: PROFILE_MODULES[profile],
        locale: 'fr',
        currency: 'EUR',
        legal: { ...emptyLegal(), legalName: prospectName.trim() },
        invoicePrefix: 'FAC',
        quotePrefix: 'DEV',
        defaultVatRate: 20,
        defaultCoefficient: 1.6,
        createdAt: now,
        isDemo: true,
        expiresAt,
        brand: {
          headingFont: 'cormorant',
          bodyFont: 'inter',
          background: '#f7f4ef',
          text: '#1c1517',
          accent: accentColor,
          ornament: 'line',
          align: 'center',
          sectionCase: 'normal',
          density: 'normal',
          priceStyle: 'right',
          titleScale: 'md',
          showLogo: false,
          tagline: model.headline,
          footer: 'Loul’s & Thos — Démonstration prospect',
        },
        brandApp: true,
      };

      const mainSite: Site = {
        id: mainSiteId,
        name: profile === 'restaurant' ? 'Cave du restaurant' : 'Cave principale',
        kind: 'cave',
        createdAt: now,
      };

      const ownerMember: Member = {
        uid: user.uid,
        name: user.name,
        email: user.email,
        role: 'owner',
        createdAt: now,
      };

      const token = uid();
      const email = (prospectEmail.trim() || `contact@${prospectName.toLowerCase().replace(/\W+/g, '')}.example`).toLowerCase();
      const invite: Invite = {
        email,
        role: 'owner',
        token,
        createdAt: now,
        expiresAt: now + 7 * 86_400_000,
      };

      const { buildFullDemoOps } = await import('@/data/demoSetup');
      const demoOps = buildFullDemoOps(newOrgId, mainSiteId, profile, {
        orgName: prospectName.trim(),
        modules: newOrg.modules,
        locale: newOrg.locale,
        defaultVatRate: newOrg.defaultVatRate,
        legal: newOrg.legal,
        now,
        actor: { userId: user.uid, userName: user.name },
        sampleMembers: store.mode === 'local',
      });

      // Organisation et propriétaire d'abord (même lot), puis ce qui exige d'être membre.
      await store.commit([
        { op: 'set', path: `orgs/${newOrgId}`, data: newOrg as never },
        { op: 'set', path: `orgs/${newOrgId}/members/${user.uid}`, data: ownerMember as never },
      ]);
      await store.commit([
        { op: 'set', path: `orgs/${newOrgId}/sites/${mainSiteId}`, data: mainSite as never },
        { op: 'set', path: `orgs/${newOrgId}/invites/${email}`, data: invite as never },
      ]);
      await store.commit(demoOps, { allowChunking: true });
      const prev = (await store.getDoc<{ orgIds?: string[]; activeOrgId?: string }>(`users/${user.uid}`)) ?? {};
      await store.commit([
        { op: 'set', path: `users/${user.uid}`, data: { uid: user.uid, orgIds: [...new Set([...(prev.orgIds ?? []), newOrgId])], activeOrgId: prev.activeOrgId ?? newOrgId } },
      ]);

      const link = `${window.location.origin}/?org=${newOrgId}&invite=${token}&email=${encodeURIComponent(email)}`;
      setCreatedLink(link);
      toast('Démo prospect créée avec succès !');
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const handleExtendOrg = async (orgId: string) => {
    try {
      const o = await store.getDoc<Org>(`orgs/${orgId}`);
      if (o) {
        const curExp = o.expiresAt && o.expiresAt > Date.now() ? o.expiresAt : Date.now();
        const nextExp = curExp + 30 * 86_400_000;
        await store.commit([{ op: 'set', path: `orgs/${orgId}`, data: { expiresAt: nextExp }, merge: true }]);
        toast('Démo prolongée de 30 jours.');
      }
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <PageHeader title="Console Plateforme" />
          <p className="text-sm text-muted">Gestion des organisations, génération de démos prospects personnalisées et suivi commercial.</p>
        </div>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => { setCreatedLink(''); setModalOpen(true); }}>
          Créer une démo prospect
        </Button>
      </div>

      {/* 4 Modèles de démonstration prêts à déployer */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(DEMO_MODELS) as OrgProfile[]).map((p) => {
          const m = DEMO_MODELS[p];
          return (
            <Card key={p} className="flex flex-col justify-between p-4">
              <div>
                <div className="flex items-center gap-2 font-display text-lg font-medium text-brand">
                  <Building2 className="size-4.5" />
                  {m.name}
                </div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-muted">{m.location}</div>
                <p className="mt-2 text-xs text-muted">{m.headline}</p>
                <div className="mt-3 space-y-1">
                  <div className="text-[11px] font-medium text-ink">Personas illustratifs (aucun compte créé) :</div>
                  {m.accounts.map((acc) => (
                    <div key={acc.email} className="truncate text-[11px] text-muted">
                      • {acc.role} : <span className="font-mono">{acc.email}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-border">
                <Button
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => {
                    setProspectName(m.name);
                    setProfile(m.profile);
                    setModalOpen(true);
                  }}
                >
                  Déployer ce modèle
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Liste des organisations */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-semibold text-sm">Organisations actives ({orgs.length})</div>
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Organisation</Th>
              <Th>Identifiant</Th>
              <Th>Statut</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id}>
                <Td className="font-medium">
                  {o.name}
                  {o.id === currentOrgId && <span className="ml-2 text-xs font-normal text-brand">(active)</span>}
                </Td>
                <Td>
                  <code className="text-xs text-muted font-mono">{o.id}</code>
                </Td>
                <Td>
                  <Badge tone="info">Actif</Badge>
                </Td>
                <Td right>
                  <div className="flex items-center justify-end gap-1">
                    {o.id !== currentOrgId && (
                      <Button size="sm" variant="ghost" onClick={() => switchOrg(o.id)} title="Ouvrir cette organisation">
                        <ExternalLink className="size-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => handleExtendOrg(o.id)} title="Prolonger la démo de 30 jours">
                      <Calendar className="size-4" />
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card className="p-4">
        <div className="mb-1 font-semibold text-sm">Demandes de suppression RGPD ({deletionRequests.length})</div>
        <p className="mb-3 text-xs text-muted">À traiter sous 30 jours : export remis au client si demandé, effacement Firestore de l’organisation, puis statut « traitée ».</p>
        {deletionRequests.length === 0 ? (
          <p className="text-sm text-muted">Aucune demande en attente.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Organisation</Th>
                <Th>Demandée par</Th>
                <Th>Date</Th>
                <Th>Statut</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {deletionRequests.map((r) => (
                <tr key={r.orgId}>
                  <Td className="font-medium">{r.orgName}</Td>
                  <Td className="text-muted">{r.requestedByEmail}</Td>
                  <Td className="text-muted">{new Date(r.createdAt).toLocaleDateString('fr-FR')}</Td>
                  <Td>
                    <Badge tone={r.status === 'done' ? 'ok' : 'warn'}>{r.status === 'pending' ? 'À traiter' : r.status === 'processing' ? 'En cours' : 'Traitée'}</Badge>
                  </Td>
                  <Td right>
                    {r.status !== 'done' && (
                      <Button size="sm" variant="ghost" onClick={() => setDeletionStatus(r.orgId, r.status === 'pending' ? 'processing' : 'done')}>
                        {r.status === 'pending' ? 'Prendre en charge' : 'Marquer traitée'}
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Modale de création de démo prospect */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Générer une démo prospect" size="md">
        {createdLink ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-ok">
              <Check className="size-5" />
              Organisation de démo créée avec succès !
            </div>
            <p className="text-sm text-muted">
              Transmettez ce lien d'invitation sécurisé à votre prospect. Il lui permettra de rejoindre directement l'organisation avec le rôle Propriétaire :
            </p>
            <div className="flex items-center gap-2 rounded-lg bg-surface-2 p-3 text-xs">
              <code className="flex-1 select-all break-all font-mono">{createdLink}</code>
              <Button
                size="sm"
                variant="primary"
                icon={<Copy className="size-4" />}
                onClick={() => {
                  navigator.clipboard.writeText(createdLink);
                  toast('Lien copié dans le presse-papier !');
                }}
              >
                Copier
              </Button>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => setModalOpen(false)}>Fermer</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateProspectDemo} className="space-y-4">
            <Field label="Nom de l'établissement ou prospect">
              <Input
                value={prospectName}
                onChange={(e) => setProspectName(e.target.value)}
                placeholder="Ex. Château de Mercuès"
                required
                autoFocus
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Typologie de métier">
                <Select value={profile} onChange={(e) => setProfile(e.target.value as OrgProfile)}>
                  <option value="restaurant">Hôtel / restaurant / palace</option>
                  <option value="negoce">Maison de négoce</option>
                  <option value="independant">Négociant indépendant</option>
                  <option value="chaine">Chaîne / groupe multi-sites</option>
                </Select>
              </Field>
              <Field label="Durée de validité (jours)">
                <Select value={String(durationDays)} onChange={(e) => setDurationDays(Number(e.target.value))}>
                  <option value="14">14 jours</option>
                  <option value="30">30 jours (standard)</option>
                  <option value="60">60 jours</option>
                </Select>
              </Field>
            </div>
            <Field label="Email du prospect (invitation propriétaire)">
              <Input
                type="email"
                value={prospectEmail}
                onChange={(e) => setProspectEmail(e.target.value)}
                placeholder="contact@prospect.example"
              />
            </Field>
            <Field label="Couleur d'accentuation (charte)">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="size-9 cursor-pointer rounded border border-border"
                />
                <Input value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-28 font-mono" />
              </div>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" onClick={() => setModalOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" variant="primary" loading={busy} disabled={!prospectName.trim()}>
                Générer la démo
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
