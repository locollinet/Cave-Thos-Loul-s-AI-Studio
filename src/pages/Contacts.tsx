import { useMemo, useState } from 'react';
import { Mail, Phone, Plus, Users } from 'lucide-react';
import type { Partner, PartnerKind } from '@/types';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Badge, Button, EmptyState, Field, Input, Modal, NumberInput, PageHeader, SearchInput, Select, Table, Tabs, Td, Th, Textarea } from '@/ui';
import { norm } from '@/lib/wine';
import { uid } from '@/lib/utils';
import Partner360 from '@/modules/negoce/Partner360';

export default function ContactsPage() {
  const { t } = useI18n();
  const { partners, can } = useOrg();
  const [kind, setKind] = useState<PartnerKind>('client');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Partner | 'new' | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const viewed = partners.find((p) => p.id === viewing);

  const list = useMemo(() => {
    const terms = norm(q).split(' ').filter(Boolean);
    return partners
      .filter((p) => p.kind === kind && !p.isArchived)
      .filter((p) => !terms.length || terms.every((x) => norm(`${p.name} ${p.contactName ?? ''} ${p.city ?? ''} ${p.email ?? ''}`).includes(x)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [partners, kind, q]);

  return (
    <div>
      <PageHeader
        title={t('nav.contacts')}
        subtitle={t('contacts.subtitle')}
        actions={
          can('staff') && (
            <Button variant="primary" size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              {t(kind === 'client' ? 'contacts.newClient' : 'contacts.newSupplier')}
            </Button>
          )
        }
      />
      <Tabs
        value={kind}
        onChange={setKind}
        tabs={[
          { value: 'client', label: t('contacts.clients'), count: partners.filter((p) => p.kind === 'client' && !p.isArchived).length },
          { value: 'supplier', label: t('contacts.suppliers'), count: partners.filter((p) => p.kind === 'supplier' && !p.isArchived).length },
        ]}
      />
      <SearchInput value={q} onChange={setQ} placeholder={t('common.search')} className="mb-3 max-w-md" />
      {list.length === 0 ? (
        <EmptyState icon={<Users className="size-8" />} title={t('contacts.empty')} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t('common.name')}</Th>
              <Th>{t('contacts.contact')}</Th>
              <Th>{t('common.city')}</Th>
              <Th>{t('contacts.terms')}</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr
                key={p.id}
                tabIndex={0}
                aria-label={t('c360.open', { name: p.name })}
                onClick={() => setViewing(p.id)}
                onKeyDown={(e) => e.key === 'Enter' && setViewing(p.id)}
                className="cursor-pointer hover:bg-surface-2/60 focus-visible:bg-surface-2/60 focus-visible:outline-none"
              >
                <Td className="font-medium">
                  {p.name} {p.customerType === 'particulier' && <Badge className="ml-1">{t('contacts.private')}</Badge>}
                </Td>
                <Td className="text-muted">
                  <div className="flex flex-col gap-0.5 text-xs">
                    {p.contactName && <span>{p.contactName}</span>}
                    {p.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="size-3" />
                        {p.email}
                      </span>
                    )}
                    {p.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="size-3" />
                        {p.phone}
                      </span>
                    )}
                  </div>
                </Td>
                <Td className="text-muted">{p.city}</Td>
                <Td className="text-muted">{p.paymentTermsDays !== undefined ? `${p.paymentTermsDays} j` : '—'}</Td>
                <Td>{p.discountPct ? <Badge tone="accent">−{p.discountPct} %</Badge> : null}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {viewed && !editing && <Partner360 partner={viewed} onClose={() => setViewing(null)} onEdit={() => setEditing(viewed)} />}
      {editing && <PartnerForm partner={editing === 'new' ? undefined : editing} kind={kind} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PartnerForm({ partner, kind, onClose }: { partner?: Partner; kind: PartnerKind; onClose: () => void }) {
  const { t } = useI18n();
  const { commit, path, can } = useOrg();
  const [f, setF] = useState<Partner>(() => partner ?? { id: uid(), kind, name: '', customerType: 'pro', paymentTermsDays: 30, createdAt: Date.now() });
  const set = <K extends keyof Partner>(k: K, v: Partner[K]) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    await commit([{ op: 'set', path: path('partners', f.id), data: JSON.parse(JSON.stringify(f)) }]);
    onClose();
  };
  const archive = async () => {
    await commit([{ op: 'set', path: path('partners', f.id), data: { isArchived: true }, merge: true }]);
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      side
      title={partner ? partner.name : t(kind === 'client' ? 'contacts.newClient' : 'contacts.newSupplier')}
      footer={
        <>
          {partner && can('manager') && (
            <Button variant="ghost" onClick={archive} className="mr-auto">
              {t('common.archive')}
            </Button>
          )}
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={!f.name.trim()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('common.name')} className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </Field>
        {f.kind === 'client' && (
          <Field label={t('contacts.type')}>
            <Select value={f.customerType} onChange={(e) => set('customerType', e.target.value as Partner['customerType'])}>
              <option value="pro">{t('contacts.pro')}</option>
              <option value="particulier">{t('contacts.private')}</option>
            </Select>
          </Field>
        )}
        <Field label={t('contacts.contact')}>
          <Input value={f.contactName ?? ''} onChange={(e) => set('contactName', e.target.value)} />
        </Field>
        <Field label={t('common.email')}>
          <Input type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label={t('common.phone')}>
          <Input value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label={t('common.address')} className="sm:col-span-2">
          <Input value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label={t('settings.postalCode')}>
          <Input value={f.postalCode ?? ''} onChange={(e) => set('postalCode', e.target.value)} />
        </Field>
        <Field label={t('common.city')}>
          <Input value={f.city ?? ''} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label={t('settings.vatNumber')}>
          <Input value={f.vatNumber ?? ''} onChange={(e) => set('vatNumber', e.target.value)} />
        </Field>
        {f.customerType !== 'particulier' && (
          <Field label="SIREN / SIRET">
            <Input value={f.siret ?? ''} inputMode="numeric" onChange={(e) => set('siret', e.target.value)} placeholder="Requis pour la facture électronique" />
          </Field>
        )}
        <Field label={t('contacts.terms')}>
          <NumberInput value={f.paymentTermsDays} onChange={(v) => set('paymentTermsDays', v)} min={0} />
        </Field>
        {f.kind === 'client' && (
          <Field label={t('contacts.discount')}>
            <NumberInput value={f.discountPct} onChange={(v) => set('discountPct', v)} min={0} max={100} step="0.5" />
          </Field>
        )}
        <Field label={t('common.notes')} className="sm:col-span-2">
          <Textarea value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
