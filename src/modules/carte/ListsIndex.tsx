import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Copy, Plus, Trash2 } from 'lucide-react';
import { useCollection, useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, useToast } from '@/ui';
import { dateFr, uid } from '@/lib/utils';
import { buildListSections, countWines, defaultWineList } from './build';
import { normalizeLanguages } from './content';
import { listOp, unpublishOps } from './publish';
import { LIST_KINDS, type ListKind, type WineList } from './types';

export default function ListsIndex() {
  const { t, locale, intl } = useI18n();
  const nav = useNavigate();
  const { toast, confirm } = useToast();
  const { org, orgId, wines, stock, commit } = useOrg();
  const { rows, loading } = useCollection<WineList>('wineLists');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ListKind>('restaurant');
  const lists = useMemo(() => [...rows].sort((a, b) => b.updatedAt - a.updatedAt), [rows]);

  const create = async () => {
    const list: WineList = { ...defaultWineList(org.locale ?? locale, name.trim(), org), id: uid(), kind, updatedAt: Date.now() };
    try {
      await commit([listOp(orgId, list)]);
      nav(list.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    }
  };

  const duplicate = async (l: WineList) => {
    const copy: WineList = { ...l, id: uid(), name: t('carte.copyOf', { name: l.name }), published: false, publicId: '', updatedAt: Date.now() };
    await commit([listOp(orgId, copy)]);
    toast(t('common.saved'));
  };

  const remove = async (l: WineList) => {
    if (!(await confirm({ title: t('carte.deleteTitle', { name: l.name }), message: t('carte.deleteMsg'), confirmLabel: t('common.delete'), danger: true }))) return;
    await commit([...unpublishOps(orgId, l), { op: 'delete', path: `orgs/${orgId}/wineLists/${l.id}` }]);
  };

  return (
    <div>
      <PageHeader
        title={t('carte.title')}
        subtitle={t('carte.subtitle')}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            {t('carte.new')}
          </Button>
        }
      />
      {loading ? (
        <div className="grid min-h-40 place-items-center">
          <Spinner className="size-7" />
        </div>
      ) : lists.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-8" />}
          title={t('carte.empty')}
          hint={t('carte.emptyHint')}
          action={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              {t('carte.new')}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lists.map((l) => {
            const n = countWines(buildListSections(l, wines, stock, org));
            return (
              <Card key={l.id} className="flex flex-col p-4">
                <Link to={l.id} className="group min-w-0 flex-1 focus-visible:outline-2 focus-visible:outline-brand">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate font-display text-lg font-semibold group-hover:text-brand">{l.name || t('carte.untitled')}</h3>
                    <Badge tone={l.published ? 'ok' : 'neutral'}>{l.published ? t('carte.pub.online') : t('carte.pub.offline')}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {t(`carte.kind.${l.kind}`)} · {l.useBrand && org.brand ? t('brand.charter') : l.theme ? t('brand.custom') : t(`carte.tpl.${l.template}`)} · {[l.language, ...normalizeLanguages(l.languages)].join(' ').toUpperCase()}
                  </p>
                  <p className="mt-3 text-sm">{t('carte.count', { n })}</p>
                  <p className="text-xs text-muted">{t('carte.updated', { date: dateFr(l.updatedAt, intl) })}</p>
                </Link>
                <div className="mt-3 flex justify-end gap-1 border-t border-border pt-3">
                  <Button size="sm" variant="ghost" icon={<Copy className="size-4" />} onClick={() => duplicate(l)}>
                    {t('carte.duplicate')}
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} aria-label={t('common.delete')} onClick={() => remove(l)} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('carte.new')}
        size="sm"
        footer={
          <>
            <Button onClick={() => setCreating(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" disabled={!name.trim()} onClick={create}>
              {t('common.create')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('carte.set.name')}>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('carte.namePlaceholder')} onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()} />
          </Field>
          <Field label={t('carte.set.kind')}>
            <Select value={kind} onChange={(e) => setKind(e.target.value as ListKind)}>
              {LIST_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`carte.kind.${k}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
