import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { ChevronsUpDown, Plus } from 'lucide-react';
import type { Partner } from '@/types';
import { useOrg } from '@/app/org';
import { useT } from '@/i18n';
import { uid } from '@/lib/utils';
import { norm } from '@/lib/wine';
import { Button, Field, Input, Modal, Select, cx, useToast } from '@/ui';

interface Props {
  value: string;
  onChange: (p: Partner) => void;
  disabled?: boolean;
}

const blank = (): Partner => ({ id: uid(), kind: 'client', name: '', customerType: 'pro', paymentTermsDays: 30, createdAt: Date.now() });

export default function PartnerPicker({ value, onChange, disabled }: Props) {
  const { partners, commit, path } = useOrg();
  const { toast } = useToast();
  const t = useT();
  const [draft, setDraft] = useState<Partner | null>(null);
  const clients = partners.filter((p) => p.kind === 'client' && (!p.isArchived || p.id === value)).sort((a, b) => a.name.localeCompare(b.name));

  const create = async () => {
    if (!draft || !draft.name.trim()) return;
    const clean = Object.fromEntries(Object.entries({ ...draft, name: draft.name.trim() }).filter(([, v]) => v !== undefined && v !== ''));
    try {
      await commit([{ op: 'set', path: path('partners', draft.id), data: clean }]);
      onChange(draft);
      setDraft(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    }
  };

  const set = (patch: Partial<Partner>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <div className="flex gap-2">
      <ClientCombobox value={value} clients={clients} disabled={disabled} onPick={onChange} />
      {!disabled && (
        <Button icon={<Plus className="size-4" />} onClick={() => setDraft(blank())} aria-label={t('negoce.newClient')}>
          <span className="hidden sm:inline">{t('negoce.newClient')}</span>
        </Button>
      )}
      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={t('negoce.newClient')}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={create} disabled={!draft?.name.trim()}>
              {t('common.create')}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('common.name')} className="sm:col-span-2">
              <Input autoFocus value={draft.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label={t('negoce.clientType')}>
              <Select value={draft.customerType} onChange={(e) => set({ customerType: e.target.value as Partner['customerType'] })}>
                <option value="pro">{t('negoce.type.pro')}</option>
                <option value="particulier">{t('negoce.type.particulier')}</option>
              </Select>
            </Field>
            <Field label={t('negoce.paymentTerms')}>
              <Input type="number" min={0} value={draft.paymentTermsDays ?? 0} onChange={(e) => set({ paymentTermsDays: Number(e.target.value) })} />
            </Field>
            <Field label={t('common.email')}>
              <Input type="email" value={draft.email ?? ''} onChange={(e) => set({ email: e.target.value })} />
            </Field>
            <Field label={t('negoce.vatNumber')}>
              <Input value={draft.vatNumber ?? ''} onChange={(e) => set({ vatNumber: e.target.value })} />
            </Field>
            <Field label={t('common.address')} className="sm:col-span-2">
              <Input value={draft.address ?? ''} onChange={(e) => set({ address: e.target.value })} />
            </Field>
            <Field label={t('negoce.postalCode')}>
              <Input value={draft.postalCode ?? ''} onChange={(e) => set({ postalCode: e.target.value })} />
            </Field>
            <Field label={t('common.city')}>
              <Input value={draft.city ?? ''} onChange={(e) => set({ city: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Liste déroulante filtrable au clavier (motif ARIA « combobox »). */
function ClientCombobox({ value, clients, disabled, onPick }: { value: string; clients: Partner[]; disabled?: boolean; onPick: (p: Partner) => void }) {
  const t = useT();
  const listId = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = clients.find((c) => c.id === value);

  const filtered = useMemo(() => {
    const terms = norm(q).split(' ').filter(Boolean);
    return clients.filter((c) => !terms.length || terms.every((x) => norm(`${c.name} ${c.contactName ?? ''} ${c.city ?? ''} ${c.email ?? ''}`).includes(x))).slice(0, 50);
  }, [clients, q]);

  const close = () => {
    setOpen(false);
    setQ('');
  };
  const pick = (p: Partner) => {
    onPick(p);
    close();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      const n = filtered.length;
      if (n) setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % n : (a - 1 + n) % n));
    } else if (e.key === 'Enter') {
      if (open && filtered[active]) {
        e.preventDefault();
        pick(filtered[active]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    } else if (e.key === 'Home' && open) {
      setActive(0);
    } else if (e.key === 'End' && open) {
      setActive(Math.max(0, filtered.length - 1));
    }
  };

  return (
    <div className="relative min-w-0 flex-1">
      <Input
        role="combobox"
        aria-label={t('negoce.client')}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? `${listId}-${filtered[active].id}` : undefined}
        disabled={disabled}
        autoComplete="off"
        value={open ? q : (selected?.name ?? '')}
        placeholder={selected?.name || t('negoce.searchClient')}
        onFocus={() => {
          setOpen(true);
          setActive(Math.max(0, clients.findIndex((c) => c.id === value)));
        }}
        onBlur={close}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKey}
        className="pr-9"
      />
      <ChevronsUpDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      {open && (
        <ul id={listId} role="listbox" aria-label={t('negoce.client')} className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-lg">
          {filtered.length === 0 && <li className="px-3 py-2.5 text-sm text-muted">{t('negoce.noClient')}</li>}
          {filtered.map((c, i) => (
            <li
              key={c.id}
              id={`${listId}-${c.id}`}
              role="option"
              aria-selected={c.id === value}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(c)}
              className={cx('flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm', i === active && 'bg-surface-2', c.id === value && 'font-medium text-brand')}
            >
              <span className="min-w-0 truncate">{c.name}</span>
              <span className="shrink-0 text-xs text-muted">
                {[c.city, c.discountPct ? `−${c.discountPct} %` : ''].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
