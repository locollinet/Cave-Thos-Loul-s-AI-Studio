import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, Plus, Trash2 } from 'lucide-react';
import type { BrandTheme, Invite, LegalInfo, Locale, Member, ModuleId, OrgProfile, Role, Site, SiteKind } from '@/types';
import { useCollection, useOrg } from '@/app/org';
import { useAuth } from '@/app/auth';
import { useI18n } from '@/i18n';
import { Badge, Button, Card, Checkbox, Field, Input, NumberInput, PageHeader, Select, Table, Tabs, Td, Th, Textarea, useToast, cx } from '@/ui';
import { MODULE_LIST } from '@/registry';
import { dateFr, downloadBlob, toCsv, uid } from '@/lib/utils';
import { resetLocalData, type DataStore } from '@/data/store';
import { PRESETS, sanitizeTheme } from '@/lib/brand';
import { BrandControls } from '@/components/BrandControls';
import { ListView } from '@/modules/carte/ListView';
import type { SheetDoc } from '@/modules/carte/templates';

const ROLES: Role[] = ['owner', 'manager', 'sommelier', 'accountant', 'staff'];
const SITE_KINDS: SiteKind[] = ['cave', 'restaurant', 'bar', 'boutique', 'entrepot', 'chambre'];

type SettingsTab = 'org' | 'identity' | 'modules' | 'sites' | 'producers' | 'team' | 'data';
const SETTINGS_TABS: SettingsTab[] = ['org', 'identity', 'modules', 'sites', 'producers', 'team', 'data'];

export default function SettingsPage() {
  const { t } = useI18n();
  const { can } = useOrg();
  const [params] = useSearchParams();
  const wanted = params.get('tab') as SettingsTab | null;
  const [tab, setTab] = useState<SettingsTab>(wanted && SETTINGS_TABS.includes(wanted) ? wanted : 'org');
  useEffect(() => {
    if (wanted && SETTINGS_TABS.includes(wanted)) setTab(wanted);
  }, [wanted]);
  return (
    <div>
      <PageHeader title={t('nav.settings')} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'org', label: t('settings.org') },
          ...(can('manager') ? [{ value: 'identity' as const, label: t('brand.settingsTab') }] : []),
          { value: 'modules', label: t('settings.modules') },
          { value: 'sites', label: t('settings.sites') },
          { value: 'producers', label: t('settings.producers') },
          ...(can('owner') ? [{ value: 'team' as const, label: t('settings.team') }] : []),
          { value: 'data', label: t('settings.data') },
        ]}
      />
      {tab === 'org' && <OrgTab />}
      {tab === 'identity' && <IdentityTab />}
      {tab === 'modules' && <ModulesTab />}
      {tab === 'sites' && <SitesTab />}
      {tab === 'producers' && <ProducersTab />}
      {tab === 'team' && <TeamTab />}
      {tab === 'data' && <DataTab />}
    </div>
  );
}

function OrgTab() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { org, updateOrg } = useOrg();
  const [f, setF] = useState(org);
  const setLegal = <K extends keyof LegalInfo>(k: K, v: LegalInfo[K]) => setF((p) => ({ ...p, legal: { ...p.legal, [k]: v } }));
  const logo = (file?: File) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setLegal('logoDataUrl', String(r.result));
    r.readAsDataURL(file);
  };
  const save = async () => {
    await updateOrg({ name: f.name, legal: JSON.parse(JSON.stringify(f.legal)), invoicePrefix: f.invoicePrefix, quotePrefix: f.quotePrefix, defaultVatRate: f.defaultVatRate, defaultCoefficient: f.defaultCoefficient, locale: f.locale });
    toast(t('common.saved'));
  };
  return (
    <Card className="p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('settings.orgName')}>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label={t('settings.locale')}>
          <Select value={f.locale} onChange={(e) => setF({ ...f, locale: e.target.value as Locale })}>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </Select>
        </Field>
        <Field label={t('settings.defaultVat')}>
          <NumberInput value={f.defaultVatRate} onChange={(v) => setF({ ...f, defaultVatRate: v ?? 20 })} step="0.1" />
        </Field>
        <Field label={t('settings.defaultCoef')} hint={t('settings.defaultCoefHint')}>
          <NumberInput value={f.defaultCoefficient} onChange={(v) => setF({ ...f, defaultCoefficient: v ?? 1.6 })} step="0.05" />
        </Field>
        <Field label={t('settings.invoicePrefix')}>
          <Input value={f.invoicePrefix} onChange={(e) => setF({ ...f, invoicePrefix: e.target.value.toUpperCase() })} />
        </Field>
        <Field label={t('settings.quotePrefix')}>
          <Input value={f.quotePrefix} onChange={(e) => setF({ ...f, quotePrefix: e.target.value.toUpperCase() })} />
        </Field>
        <div className="sm:col-span-2 border-t border-border pt-4 text-sm font-semibold">{t('settings.legal')}</div>
        <Field label={t('settings.legalName')}>
          <Input value={f.legal.legalName} onChange={(e) => setLegal('legalName', e.target.value)} />
        </Field>
        <Field label={t('settings.legalForm')}>
          <Input value={f.legal.legalForm} onChange={(e) => setLegal('legalForm', e.target.value)} placeholder="SAS, SARL…" />
        </Field>
        <Field label={t('common.address')} className="sm:col-span-2">
          <Input value={f.legal.address} onChange={(e) => setLegal('address', e.target.value)} />
        </Field>
        <Field label={t('settings.postalCode')}>
          <Input value={f.legal.postalCode} onChange={(e) => setLegal('postalCode', e.target.value)} />
        </Field>
        <Field label={t('common.city')}>
          <Input value={f.legal.city} onChange={(e) => setLegal('city', e.target.value)} />
        </Field>
        <Field label={t('common.email')}>
          <Input value={f.legal.email} onChange={(e) => setLegal('email', e.target.value)} />
        </Field>
        <Field label={t('common.phone')}>
          <Input value={f.legal.phone} onChange={(e) => setLegal('phone', e.target.value)} />
        </Field>
        <Field label="SIRET">
          <Input value={f.legal.siret} onChange={(e) => setLegal('siret', e.target.value)} />
        </Field>
        <Field label={t('settings.vatNumber')}>
          <Input value={f.legal.vatNumber} onChange={(e) => setLegal('vatNumber', e.target.value)} />
        </Field>
        <Field label={t('settings.exciseNumber')}>
          <Input value={f.legal.exciseNumber} onChange={(e) => setLegal('exciseNumber', e.target.value)} />
        </Field>
        <Field label="IBAN">
          <Input value={f.legal.iban} onChange={(e) => setLegal('iban', e.target.value)} />
        </Field>
        <Field label="BIC">
          <Input value={f.legal.bic} onChange={(e) => setLegal('bic', e.target.value)} />
        </Field>
        <Field label={t('settings.logo')}>
          <input type="file" accept="image/*" onChange={(e) => logo(e.target.files?.[0])} className="text-sm" />
          {f.legal.logoDataUrl && <img src={f.legal.logoDataUrl} alt="" className="mt-2 h-12 object-contain" />}
        </Field>
        <Field label={t('settings.legalMentions')} className="sm:col-span-2">
          <Textarea value={f.legal.legalMentions} onChange={(e) => setLegal('legalMentions', e.target.value)} />
        </Field>
      </div>
      <div className="mt-5 flex justify-end">
        <Button variant="primary" onClick={save}>
          {t('common.save')}
        </Button>
      </div>
    </Card>
  );
}

function IdentityTab() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { org, wines, updateOrg } = useOrg();
  const [theme, setTheme] = useState<BrandTheme>(() => sanitizeTheme(org.brand, PRESETS.palace));
  const [applyApp, setApplyApp] = useState(!!org.brandApp);
  const [busy, setBusy] = useState(false);
  const pick = (color: string) => wines.filter((w) => !w.isArchived && w.color === color).slice(0, 3);
  const item = (w: (typeof wines)[number], price: number) => ({ producer: w.producer, name: w.name, vintage: w.vintage, formatCl: w.formatCl, color: w.color, grapes: w.grapes, priceTTC: price });
  const sample: SheetDoc = {
    name: t('brand.sample.title'),
    orgName: org.name,
    template: 'palace',
    theme,
    logoDataUrl: theme.showLogo ? org.legal.logoDataUrl : undefined,
    sections: [
      { title: t('brand.sample.sec1'), items: pick('bulles').map((w, i) => item(w, 140 + i * 45)) },
      { title: t('brand.sample.sec2'), items: pick('rouge').map((w, i) => item(w, 220 + i * 90)) },
    ].filter((s) => s.items.length),
  };
  const save = async () => {
    setBusy(true);
    try {
      await updateOrg({ brand: theme, brandApp: applyApp });
      toast(t('brand.charterSaved'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="space-y-5 p-5">
        <p className="text-sm text-muted">{t('brand.settingsIntro')}</p>
        <div className="rounded-lg bg-surface-2 p-3">
          <Checkbox checked={applyApp} onChange={setApplyApp} label={<span className="font-medium">{t('brand.applyApp')}</span>} />
          <p className="ml-6.5 mt-0.5 text-xs text-muted">{t('brand.applyAppHint')}</p>
        </div>
        <BrandControls value={theme} onChange={setTheme} />
        <div className="flex justify-end border-t border-border pt-4">
          <Button variant="primary" loading={busy} onClick={save}>
            {t('common.save')}
          </Button>
        </div>
      </Card>
      <div className="xl:sticky xl:top-20 xl:self-start">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{t('brand.preview')}</p>
        <div className="overflow-hidden rounded-xl border border-border shadow-sm">
          <ListView doc={sample} columns={false} />
        </div>
      </div>
    </div>
  );
}

function ModulesTab() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { org, updateOrg } = useOrg();
  const toggle = async (id: ModuleId, on: boolean) => {
    if (id === 'stock') {
      toast('Le module Stock & Cave est le socle de l’application.', 'info');
      return;
    }
    await updateOrg({ modules: on ? [...org.modules, id] : org.modules.filter((m) => m !== id) });
    toast(t('common.saved'));
  };

  const PRESETS_LIST: { id: OrgProfile | 'all'; label: string; modules: ModuleId[] }[] = [
    { id: 'all', label: '✨ Tout activer (Full Démo)', modules: ['stock', 'carte', 'achats', 'negoce', 'compta', 'pilotage'] },
    { id: 'restaurant', label: '🍽️ Restaurant / Bar', modules: ['stock', 'carte', 'achats', 'pilotage'] },
    { id: 'negoce', label: '📦 Maison de Négoce', modules: ['stock', 'achats', 'negoce', 'compta', 'pilotage'] },
    { id: 'independant', label: '🍷 Caviste Indépendant', modules: ['stock', 'achats', 'negoce', 'compta', 'pilotage', 'carte'] },
    { id: 'chaine', label: '🏨 Groupe & Chaîne', modules: ['stock', 'carte', 'achats', 'compta', 'pilotage'] },
  ];

  const applyPreset = async (p: (typeof PRESETS_LIST)[number]) => {
    await updateOrg({
      modules: p.modules,
      ...(p.id !== 'all' ? { profile: p.id as OrgProfile } : {}),
    });
    toast(`Configuration « ${p.label} » appliquée (${p.modules.length} modules)`, 'ok');
  };

  return (
    <div className="space-y-4">
      <Card className="border-brand/20 bg-brand-soft/30 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ink">Profils types &amp; raccourcis démo</div>
            <p className="text-xs text-muted mt-0.5">
              Les modules sont 100% modulables : vous pouvez activer ou masquer des menus selon vos besoins de présentation sans perdre aucune donnée.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS_LIST.map((p) => {
            const isMatch =
              p.id === 'all'
                ? p.modules.every((m) => org.modules.includes(m))
                : org.profile === p.id && p.modules.every((m) => org.modules.includes(m));
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition cursor-pointer',
                  isMatch
                    ? 'border-brand bg-brand text-brand-fg shadow-xs'
                    : 'border-border bg-surface text-ink hover:bg-surface-2',
                )}
              >
                <span>{p.label}</span>
                {isMatch && <span className="ml-1 text-[10px] font-bold">✓</span>}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {MODULE_LIST.map((m) => (
          <Card key={m.id} className="p-4">
            <Checkbox
              checked={org.modules.includes(m.id)}
              onChange={(v) => toggle(m.id, v)}
              label={
                <span className="flex items-center gap-2 font-medium">
                  <m.icon className="size-4 text-brand" />
                  {t(m.labelKey)}
                  {m.id === 'stock' && <span className="text-[10px] font-normal text-muted">(Obligatoire)</span>}
                </span>
              }
            />
            <p className="ml-6.5 mt-1 text-sm text-muted">{t(m.descKey)}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SitesTab() {
  const { t } = useI18n();
  const { toast, confirm } = useToast();
  const { sites, commit, path } = useOrg();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<SiteKind>('cave');
  const add = async () => {
    const s: Site = { id: uid(), name: name.trim(), kind, createdAt: Date.now() };
    await commit([{ op: 'set', path: path('sites', s.id), data: s as never }]);
    setName('');
    toast(t('common.saved'));
  };
  const rename = (s: Site, v: string) => commit([{ op: 'set', path: path('sites', s.id), data: { name: v }, merge: true }]);
  const archive = async (s: Site) => {
    if (sites.length <= 1) return toast(t('settings.lastSite'), 'bad');
    if (await confirm({ title: t('common.archive'), message: t('settings.archiveSite', { name: s.name }), confirmLabel: t('common.archive'), danger: true }))
      await commit([{ op: 'set', path: path('sites', s.id), data: { isArchived: true }, merge: true }]);
  };
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Field label={t('settings.siteName')} className="min-w-52 flex-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('settings.siteKind')}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as SiteKind)}>
            {SITE_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`site.${k}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={add} disabled={!name.trim()}>
          {t('common.add')}
        </Button>
      </Card>
      <Table>
        <thead>
          <tr>
            <Th>{t('common.name')}</Th>
            <Th>{t('settings.siteKind')}</Th>
            <Th>{t('stock.racks')}</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {sites.map((s) => (
            <tr key={s.id}>
              <Td>
                <Input defaultValue={s.name} onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && rename(s, e.target.value.trim())} className="h-9" />
              </Td>
              <Td className="text-muted">{t(`site.${s.kind}`)}</Td>
              <Td className="text-xs text-muted font-mono">
                {s.layout?.racks?.length ? `${s.layout.racks.length} configuré(s)` : '—'}
              </Td>
              <Td right>
                <Button variant="ghost" size="sm" onClick={() => archive(s)} aria-label={t('common.archive')}>
                  <Trash2 className="size-4" />
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function ProducersTab() {
  const { t } = useI18n();
  const { producers, org, commit, path } = useOrg();
  const set = (id: string, coefficient: number | undefined) => commit([{ op: 'set', path: path('producers', id), data: { coefficient: coefficient ?? null }, merge: true }]);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{t('settings.producersHint', { n: org.defaultCoefficient })}</p>
      <Table>
        <thead>
          <tr>
            <Th>{t('common.name')}</Th>
            <Th>{t('wines.region')}</Th>
            <Th>{t('wines.coefficient')}</Th>
          </tr>
        </thead>
        <tbody>
          {[...producers].filter((p) => !p.isArchived).sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
            <tr key={p.id}>
              <Td className="font-medium">{p.name}</Td>
              <Td className="text-muted">{p.region}</Td>
              <Td>
                <NumberInput value={p.coefficient ?? undefined} onChange={(v) => set(p.id, v)} step="0.05" placeholder={String(org.defaultCoefficient)} className="h-9 w-28" />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function TeamTab() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { user } = useAuth();
  const { orgId, members, commit, path } = useOrg();
  const { rows: invites } = useCollection<Invite>('invites');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const owners = members.filter((m) => m.role === 'owner').length;

  const invite = async () => {
    const e = email.trim().toLowerCase();
    const now = Date.now();
    const token = uid();
    const inv: Invite = {
      email: e,
      role,
      token,
      createdAt: now,
      expiresAt: now + 7 * 86_400_000,
    };
    await commit([{ op: 'set', path: path('invites', e), data: inv as never }]);
    setEmail('');
    const link = `${window.location.origin}/?org=${orgId}&invite=${token}&email=${encodeURIComponent(e)}`;
    await navigator.clipboard.writeText(link).catch(() => undefined);
    toast(`${t('settings.invited')} — ${t('settings.inviteLinkCopied')}`);
  };
  const changeRole = async (m: Member, r: Role) => {
    if (m.role === 'owner' && r !== 'owner' && owners <= 1) return toast(t('settings.lastOwner'), 'bad');
    await commit([{ op: 'set', path: path('members', m.uid), data: { role: r }, merge: true }]);
  };
  const remove = async (m: Member) => {
    if (m.uid === user?.uid || (m.role === 'owner' && owners <= 1)) return toast(t('settings.cannotRemove'), 'bad');
    await commit([{ op: 'delete', path: path('members', m.uid) }]);
  };
  const copyInvite = (i: Invite) => {
    const link = `${window.location.origin}/?org=${orgId}&invite=${i.token ?? 'token'}&email=${encodeURIComponent(i.email)}`;
    navigator.clipboard.writeText(link).then(() => toast(t('settings.inviteLinkCopied')));
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-2 text-sm font-semibold">{t('settings.inviteTitle')}</div>
        <p className="mb-3 text-sm text-muted">{t('settings.inviteHint')}</p>
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <span className="text-muted">{t('settings.orgId')}</span>
          <code className="flex-1 truncate font-mono">{orgId}</code>
          <button onClick={() => navigator.clipboard.writeText(orgId).then(() => toast(t('settings.copied')))} aria-label="Copier">
            <Copy className="size-4 text-muted" />
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('common.email')} className="min-w-52 flex-1">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t('common.role')}>
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.filter((r) => r !== 'owner').map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="primary" onClick={invite} disabled={!email.includes('@')}>
            {t('settings.invite')}
          </Button>
        </div>
      </Card>
      <Table>
        <thead>
          <tr>
            <Th>{t('common.name')}</Th>
            <Th>{t('common.email')}</Th>
            <Th>{t('common.role')}</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.uid}>
              <Td className="font-medium">{m.name}</Td>
              <Td className="text-muted">{m.email}</Td>
              <Td>
                <Select value={m.role} onChange={(e) => changeRole(m, e.target.value as Role)} className="h-9 w-40">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(`role.${r}`)}
                    </option>
                  ))}
                </Select>
              </Td>
              <Td right>
                <Button variant="ghost" size="sm" onClick={() => remove(m)} aria-label={t('common.delete')}>
                  <Trash2 className="size-4" />
                </Button>
              </Td>
            </tr>
          ))}
          {invites.map((i) => (
            <tr key={i.email}>
              <Td className="text-muted">—</Td>
              <Td className="text-muted">{i.email}</Td>
              <Td>
                <div className="flex items-center gap-2">
                  <Badge tone="warn">{t('settings.pending')} · {t(`role.${i.role}`)}</Badge>
                  <span className="text-[11px] text-muted">{t('settings.inviteExpires')}</span>
                </div>
              </Td>
              <Td right>
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => copyInvite(i)} aria-label={t('settings.copyInviteLink')} title={t('settings.copyInviteLink')}>
                    <Copy className="size-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => commit([{ op: 'delete', path: path('invites', i.email) }])}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

// Collections exportées (portabilité RGPD) ; celles que le rôle ne peut pas lire sont ignorées.
const EXPORT_COLLECTIONS = [
  'sites', 'producers', 'wines', 'wineCosts', 'stock', 'movements', 'movementCosts', 'inventories', 'partners', 'openBottles',
  'racks', 'bottles', 'allocations', 'wineLists', 'purchaseInvoices', 'documents', 'payments', 'consignments', 'counters',
  'expenses', 'expenseCategories', 'assets', 'drmReports', 'accountingSettings', 'offers', 'members', 'invites', 'posImports', 'wineImages',
];

function readOnce<T>(store: DataStore, path: string): Promise<T[] | null> {
  return new Promise((resolve) => {
    let settled = false;
    let unsub: () => void = () => undefined;
    const finish = (rows: T[] | null) => {
      if (settled) return;
      settled = true;
      queueMicrotask(() => unsub());
      resolve(rows);
    };
    unsub = store.subscribeCollection<T>(path, (rows) => finish(rows), undefined, () => finish(null));
  });
}

interface DeletionRequest {
  status: 'pending' | 'processing' | 'done';
  createdAt: number;
  requestedByEmail?: string;
}

function DataTab() {
  const { t, intl } = useI18n();
  const { toast, confirm } = useToast();
  const { demo, user } = useAuth();
  const { org, wines, stock, store, path, role, canSeeCosts } = useOrg();
  const [busy, setBusy] = useState(false);
  const [deletion, setDeletion] = useState<DeletionRequest | null>(null);

  useEffect(() => {
    if (role !== 'owner' || store.mode === 'local') return;
    store.getDoc<DeletionRequest>(`deletionRequests/${org.id}`).then(setDeletion).catch(() => undefined);
  }, [store, org.id, role]);

  const exportAllJson = async () => {
    setBusy(true);
    try {
      const data: Record<string, unknown> = { exportedAt: new Date().toISOString(), org };
      for (const c of EXPORT_COLLECTIONS) {
        const rows = await readOnce<Record<string, unknown>>(store, path(c));
        if (rows) data[c] = rows;
      }
      downloadBlob(`${org.name.replace(/\W+/g, '-').toLowerCase()}-export.json`, JSON.stringify(data, null, 2), 'application/json');
      toast(t('settings.exported'));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const headers = ['Domaine/Producteur', 'Cuvée/Nom', 'Millésime', 'Couleur', 'Format (cl)', 'Région', ...(canSeeCosts ? ['Prix achat HT'] : []), 'Prix vente HT', 'Stock total'];
    const rows = wines.map((w) => [
      w.producer || '',
      w.name || '',
      w.vintage ?? '',
      w.color ?? '',
      w.formatCl ?? 75,
      w.region || '',
      ...(canSeeCosts ? [w.buyPriceHT ?? ''] : []),
      w.sellPriceHT ?? '',
      stock.filter((s) => s.wineId === w.id).reduce((sum, s) => sum + s.qty, 0),
    ]);
    downloadBlob(`${org.name.replace(/\W+/g, '-').toLowerCase()}-catalogue-stock.csv`, toCsv([headers, ...rows]), 'text/csv;charset=utf-8');
    toast(t('settings.exported'));
  };

  const requestDeletion = async () => {
    if (!user) return;
    const confirmed = await confirm({
      title: t('settings.rgpdDelete'),
      message: t('settings.rgpdConfirmMsg'),
      confirmLabel: t('settings.rgpdDelete'),
      danger: true,
    });
    if (!confirmed) return;
    const request = { orgId: org.id, orgName: org.name, requestedBy: user.uid, requestedByEmail: user.email, status: 'pending' as const, createdAt: Date.now() };
    try {
      await store.commit([{ op: 'set', path: `deletionRequests/${org.id}`, data: request }]);
      setDeletion(request);
      toast(t('settings.rgpdRequested'), 'ok');
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  };

  const reset = async () => {
    if (await confirm({ title: t('settings.resetDemo'), message: t('settings.resetDemoMsg'), confirmLabel: t('settings.resetDemo'), danger: true })) {
      resetLocalData();
      localStorage.removeItem('lt-active-site');
      location.reload();
    }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="p-5">
        <div className="font-medium">{t('settings.exportTitle')}</div>
        <p className="mb-3 mt-1 text-sm text-muted">{t('settings.exportHint')}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportAllJson} loading={busy}>{t('common.export')} JSON</Button>
          <Button variant="secondary" onClick={exportCsv}>{t('settings.exportCsv')}</Button>
        </div>
      </Card>

      <Card className="p-5">
        <div className="font-medium text-bad">{t('settings.rgpdTitle')}</div>
        <p className="mb-3 mt-1 text-sm text-muted">{t('settings.rgpdHint')}</p>
        {deletion ? (
          <p className="text-sm">
            Demande de suppression enregistrée le {dateFr(deletion.createdAt, intl)} ({deletion.status === 'pending' ? 'en attente de traitement' : deletion.status === 'processing' ? 'en cours' : 'traitée'}).
          </p>
        ) : role === 'owner' ? (
          <Button variant="danger" onClick={requestDeletion} disabled={store.mode === 'local'}>
            {t('settings.rgpdDelete')}
          </Button>
        ) : (
          <p className="text-sm text-muted">Seul le propriétaire de l’organisation peut demander sa suppression.</p>
        )}
      </Card>

      {demo && (
        <Card className="p-5 sm:col-span-2">
          <div className="font-medium">{t('settings.resetDemo')}</div>
          <p className="mb-3 mt-1 text-sm text-muted">{t('settings.resetDemoHint')}</p>
          <Button variant="danger" onClick={reset}>
            {t('settings.resetDemo')}
          </Button>
        </Card>
      )}
    </div>
  );
}
