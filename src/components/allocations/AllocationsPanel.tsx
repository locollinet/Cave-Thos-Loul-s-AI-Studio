import { useMemo, useState } from 'react';
import { Award, CheckCircle2, Clock, Edit2, PackageCheck, Plus, Search, Sparkles, TrendingUp } from 'lucide-react';
import type { WineAllocation } from '@/types';
import { useCollection, useOrg } from '@/app/org';
import { Badge, Button, Card, EmptyState, cx, useToast } from '@/ui';
import { eur } from '@/lib/utils';
import { formatLabel, norm } from '@/lib/wine';
import { AllocationModal } from './AllocationModal';

const DEMO_ALLOCATIONS: WineAllocation[] = [
  {
    id: 'alloc_drc_1',
    producerName: 'Domaine de la Romanée-Conti',
    cuveeName: 'Romanée-Conti Grand Cru',
    vintage: '2021',
    formatCl: 75,
    campaignYear: 2024,
    quotaBottles: 3,
    orderedBottles: 3,
    receivedBottles: 0,
    unitPriceHT: 4200,
    status: 'confirmed',
    deadlineDate: '2024-03-31',
    notes: 'Allocation historique 3 bouteilles. Livraison automne.',
    createdAt: Date.now() - 60 * 86400000,
  },
  {
    id: 'alloc_drc_2',
    producerName: 'Domaine de la Romanée-Conti',
    cuveeName: 'La Tâche Grand Cru',
    vintage: '2021',
    formatCl: 75,
    campaignYear: 2024,
    quotaBottles: 6,
    orderedBottles: 6,
    receivedBottles: 6,
    unitPriceHT: 1950,
    status: 'delivered',
    notes: 'Reçu en cave voûtée centrale.',
    createdAt: Date.now() - 60 * 86400000,
  },
  {
    id: 'alloc_coche_1',
    producerName: 'Domaine Coche-Dury',
    cuveeName: 'Meursault Les Rougeots',
    vintage: '2021',
    formatCl: 75,
    campaignYear: 2024,
    quotaBottles: 12,
    orderedBottles: 12,
    receivedBottles: 6,
    unitPriceHT: 380,
    status: 'confirmed',
    notes: 'Premier arrivage de 6 btl reçu.',
    createdAt: Date.now() - 45 * 86400000,
  },
  {
    id: 'alloc_roumier_1',
    producerName: 'Domaine Georges Roumier',
    cuveeName: 'Chambolle-Musigny 1er Cru Les Amoureuses',
    vintage: '2022',
    formatCl: 75,
    campaignYear: 2024,
    quotaBottles: 6,
    orderedBottles: 6,
    receivedBottles: 0,
    unitPriceHT: 1100,
    status: 'confirmed',
    notes: 'Souscription primeur confirmée.',
    createdAt: Date.now() - 30 * 86400000,
  },
  {
    id: 'alloc_selosse_1',
    producerName: 'Champagne Jacques Selosse',
    cuveeName: 'Substance Blanc de Blancs Grand Cru',
    vintage: 'NM',
    formatCl: 75,
    campaignYear: 2024,
    quotaBottles: 18,
    orderedBottles: 18,
    receivedBottles: 18,
    unitPriceHT: 320,
    status: 'delivered',
    createdAt: Date.now() - 80 * 86400000,
  },
];

export function AllocationsPanel() {
  const { toast } = useToast();
  const { commit, path } = useOrg();
  const { rows: savedAllocations } = useCollection<WineAllocation>('allocations');

  const [campaignYear, setCampaignYear] = useState<string>('2024');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAlloc, setEditingAlloc] = useState<WineAllocation | undefined>();

  // Utiliser les allocations enregistrées ou les démos pour un affichage palace immédiat
  const allocations = useMemo(() => {
    return savedAllocations.length > 0 ? savedAllocations : DEMO_ALLOCATIONS;
  }, [savedAllocations]);

  const years = useMemo(() => {
    const set = new Set<number>();
    allocations.forEach((a) => set.add(a.campaignYear));
    return Array.from(set).sort((a, b) => b - a);
  }, [allocations]);

  const filtered = useMemo(() => {
    return allocations.filter((a) => {
      if (campaignYear !== 'all' && String(a.campaignYear) !== campaignYear) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (query.trim()) {
        const q = norm(query);
        const haystack = norm(`${a.producerName} ${a.cuveeName} ${a.vintage}`);
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [allocations, campaignYear, statusFilter, query]);

  // Statistiques KPIs des allocations
  const stats = useMemo(() => {
    let totalQuota = 0;
    let totalOrdered = 0;
    let totalReceived = 0;
    let totalValue = 0;

    for (const a of filtered) {
      totalQuota += a.quotaBottles;
      totalOrdered += a.orderedBottles;
      totalReceived += a.receivedBottles;
      totalValue += (a.orderedBottles || a.quotaBottles) * (a.unitPriceHT || 0);
    }

    return {
      domainCount: new Set(filtered.map((a) => a.producerName)).size,
      totalQuota,
      totalOrdered,
      totalReceived,
      pendingDelivery: Math.max(0, totalOrdered - totalReceived),
      totalValue,
    };
  }, [filtered]);

  const quickDeliver = async (alloc: WineAllocation) => {
    const toReceive = alloc.orderedBottles - alloc.receivedBottles;
    if (toReceive <= 0) return;

    const nextReceived = alloc.receivedBottles + toReceive;
    const updated: WineAllocation = {
      ...alloc,
      receivedBottles: nextReceived,
      status: 'delivered',
      updatedAt: Date.now(),
    };

    try {
      await commit([
        {
          op: 'set',
          path: path('allocations', alloc.id),
          data: JSON.parse(JSON.stringify(updated)),
        },
      ]);
      toast(`Solde de ${toReceive} btl réceptionné pour ${alloc.producerName}`);
    } catch {
      toast('Erreur lors de la mise à jour', 'bad');
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête et filtres */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="campaign-filter" className="text-xs font-semibold uppercase tracking-wider text-muted">
            Campagne :
          </label>
          <select
            id="campaign-filter"
            value={campaignYear}
            onChange={(e) => setCampaignYear(e.target.value)}
            className="rounded-xl border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink focus:border-brand focus:outline-none"
          >
            <option value="all">Toutes les campagnes</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                Campagne {y}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink focus:border-brand focus:outline-none"
          >
            <option value="all">Tous les statuts</option>
            <option value="confirmed">Confirmées / Réservées</option>
            <option value="pending">En attente de confirmation</option>
            <option value="delivered">Entièrement livrées</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Chercher domaine ou cuvée..."
              className="h-9 w-52 rounded-xl border border-border bg-surface-2 pl-9 pr-3 text-xs placeholder:text-muted focus:border-brand focus:outline-none focus:w-64 transition-all"
            />
          </div>

          <Button
            size="sm"
            variant="primary"
            icon={<Plus className="size-4" />}
            onClick={() => {
              setEditingAlloc(undefined);
              setModalOpen(true);
            }}
          >
            Nouvelle allocation
          </Button>
        </div>
      </div>

      {/* Cartes KPI de pilotage prestige */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
            <Award className="size-3.5 text-amber-500" /> Domaines sous contrat
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-ink">{stats.domainCount}</div>
          <div className="text-[11px] text-muted mt-0.5">Allocations réservées</div>
        </Card>

        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-brand" /> Quota alloué
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-ink">{stats.totalQuota} btl</div>
          <div className="text-[11px] text-muted mt-0.5">{stats.totalOrdered} commandées</div>
        </Card>

        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
            <Clock className="size-3.5 text-amber-600" /> Solde en attente
          </div>
          <div className="mt-2 font-display text-3xl font-bold text-amber-600 dark:text-amber-400">
            {stats.pendingDelivery} btl
          </div>
          <div className="text-[11px] text-muted mt-0.5">{stats.totalReceived} déjà en cave</div>
        </Card>

        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
            <TrendingUp className="size-3.5 text-emerald-500" /> Valeur engagée
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-ink">{eur(stats.totalValue)} HT</div>
          <div className="text-[11px] text-muted mt-0.5">Budget d'allocation</div>
        </Card>
      </div>

      {/* Liste des contrats d'allocations */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Award className="size-8" />}
          title="Aucune allocation trouvée"
          hint="Enregistrez vos quotas et contrats d'allocation négociés auprès des vignerons d'élite."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const pctReceived =
              a.orderedBottles > 0 ? Math.round((a.receivedBottles / a.orderedBottles) * 100) : 0;
            const remaining = Math.max(0, a.orderedBottles - a.receivedBottles);

            return (
              <div
                key={a.id}
                className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm transition-all hover:border-border/80"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-lg font-bold text-brand">
                        {a.producerName}
                      </span>
                      <Badge
                        tone={
                          a.status === 'delivered'
                            ? 'ok'
                            : a.status === 'confirmed'
                              ? 'brand'
                              : a.status === 'pending'
                                ? 'warn'
                                : 'neutral'
                        }
                      >
                        {a.status === 'delivered'
                          ? 'Entièrement livrée'
                          : a.status === 'confirmed'
                            ? 'Confirmée'
                            : a.status === 'pending'
                              ? 'En attente'
                              : 'Annulée'}
                      </Badge>
                      <span className="text-xs font-mono text-muted">Campagne {a.campaignYear}</span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold text-ink">{a.cuveeName}</span>
                      <span className="text-muted">·</span>
                      <span className="font-bold text-amber-500">{a.vintage}</span>
                      <span className="text-muted">·</span>
                      <span className="text-muted">{formatLabel(a.formatCl ?? 75)}</span>
                    </div>

                    {a.notes && <p className="mt-1.5 text-xs text-muted line-clamp-1">{a.notes}</p>}
                  </div>

                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <div className="font-mono text-xs text-muted">Quota / Commandé</div>
                      <div className="font-display text-lg font-semibold text-ink">
                        {a.receivedBottles} / {a.orderedBottles}{' '}
                        <span className="text-xs font-sans text-muted font-normal">
                          ({a.quotaBottles} allouées)
                        </span>
                      </div>
                    </div>

                    {a.unitPriceHT && (
                      <div className="hidden sm:block">
                        <div className="font-mono text-xs text-muted">Montant total</div>
                        <div className="font-display text-lg font-bold text-ink">
                          {eur((a.orderedBottles || a.quotaBottles) * a.unitPriceHT)} HT
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5">
                      {remaining > 0 && (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<PackageCheck className="size-3.5 text-emerald-500" />}
                          onClick={() => quickDeliver(a)}
                        >
                          Réceptionner {remaining} btl
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Edit2 className="size-3.5" />}
                        onClick={() => {
                          setEditingAlloc(a);
                          setModalOpen(true);
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Barre de progression des livraisons */}
                <div className="mt-3 flex items-center gap-3 text-xs text-muted">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2 border border-border/50">
                    <div
                      className={cx(
                        'h-full transition-all duration-500',
                        pctReceived === 100
                          ? 'bg-emerald-500'
                          : 'bg-gradient-to-r from-amber-600 to-amber-400',
                      )}
                      style={{ width: `${Math.min(100, pctReceived)}%` }}
                    />
                  </div>
                  <span className="shrink-0 font-mono text-[11px] font-medium">
                    {pctReceived}% livré ({remaining} restant)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <AllocationModal
          allocation={editingAlloc}
          onClose={() => {
            setModalOpen(false);
            setEditingAlloc(undefined);
          }}
        />
      )}
    </div>
  );
}
