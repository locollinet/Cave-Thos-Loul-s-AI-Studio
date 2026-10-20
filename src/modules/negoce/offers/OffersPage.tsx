import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useOrg } from '@/app/org';
import { useI18n } from '@/i18n';
import { dateFr, today } from '@/lib/utils';
import { norm } from '@/lib/wine';
import { Badge, Button, EmptyState, PageHeader, SearchInput, Segmented, Spinner, Table, Td, Th, useToast } from '@/ui';
import { effectiveStatus } from './calc';
import { deleteOfferOps } from './ops';
import OfferStatusBadge from './OfferStatusBadge';
import type { Offer, OfferStatus } from './types';
import { useOffers } from './useOffers';

type Filter = 'all' | 'open' | 'accepted' | 'closed';

export default function OffersPage() {
  const { t, intl } = useI18n();
  const { orgId, commit } = useOrg();
  const { offers, loading } = useOffers();
  const { toast, confirm } = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const asOf = today();

  const rows = useMemo(() => {
    const n = norm(q);
    const keep = (s: OfferStatus) =>
      filter === 'all' || (filter === 'open' && (s === 'draft' || s === 'sent')) || (filter === 'accepted' && s === 'accepted') || (filter === 'closed' && (s === 'declined' || s === 'expired'));
    return offers.filter((o) => keep(effectiveStatus(o, asOf)) && (!n || norm(`${o.number} ${o.title} ${o.partnerName ?? ''}`).includes(n)));
  }, [offers, q, filter, asOf]);

  const remove = async (o: Offer) => {
    if (!(await confirm({ title: t('common.confirmDelete'), message: o.published ? t('offer.deletePublished') : undefined, danger: true, confirmLabel: t('common.delete') }))) return;
    try {
      await commit(deleteOfferOps(orgId, o));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    }
  };

  return (
    <>
      <PageHeader
        title={t('offer.title')}
        subtitle={t('offer.subtitle')}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate('/negoce/offres/new')}>
            {t('offer.new')}
          </Button>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('common.all') },
            { value: 'open', label: t('offer.filter.open') },
            { value: 'accepted', label: t('offer.status.accepted') },
            { value: 'closed', label: t('offer.filter.closed') },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder={t('offer.search')} className="min-w-48 flex-1 sm:max-w-xs" />
      </div>
      {loading ? (
        <Spinner className="mx-auto mt-12" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="size-8" />}
          title={t('offer.empty')}
          hint={t('offer.emptyHint')}
          action={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate('/negoce/offres/new')}>
              {t('offer.new')}
            </Button>
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t('offer.titleField')}</Th>
              <Th>{t('negoce.client')}</Th>
              <Th right>{t('offer.wines')}</Th>
              <Th>{t('negoce.validUntil')}</Th>
              <Th>{t('common.status')}</Th>
              <Th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const go = () => navigate(`/negoce/offres/${o.id}`);
              return (
                <tr key={o.id} tabIndex={0} onClick={go} onKeyDown={(e) => e.key === 'Enter' && go()} className="cursor-pointer hover:bg-surface-2/60 focus-visible:bg-surface-2/60 focus-visible:outline-none">
                  <Td>
                    <div className="font-medium">{o.title || t('offer.untitled')}</div>
                    <div className="text-xs text-muted">{o.number || t('negoce.status.draft')}</div>
                  </Td>
                  <Td>{o.partnerName || <span className="text-muted">{t('offer.noClient')}</span>}</Td>
                  <Td right>{o.items.length}</Td>
                  <Td>{dateFr(o.validUntil, intl)}</Td>
                  <Td>
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <OfferStatusBadge status={effectiveStatus(o, asOf)} />
                      {o.published && (
                        <Badge tone="info">
                          <Globe className="size-3" aria-hidden />
                          {t('offer.online')}
                        </Badge>
                      )}
                    </span>
                  </Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    {o.status !== 'accepted' && (
                      <button type="button" aria-label={t('common.delete')} onClick={() => remove(o)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-bad">
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
