import { useState } from 'react';
import { CheckCircle2, Merge } from 'lucide-react';
import type { Wine } from '@/types';
import { useOrg } from '@/app/org';
import { useAuth } from '@/app/auth';
import { useI18n } from '@/i18n';
import { Badge, Button, Card, EmptyState, useToast } from '@/ui';
import { cleanName, similarity, wineLabel } from '@/lib/wine';
import { buildMovementOps, qtyAt } from '@/data/stock';

export function findDuplicateGroups(wines: Wine[]): Wine[][] {
  const live = wines.filter((w) => !w.isArchived);
  const parent = new Map<string, string>();
  const find = (x: string): string => (parent.get(x) === x || !parent.has(x) ? x : find(parent.get(x)!));
  live.forEach((w) => parent.set(w.id, w.id));
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (a.vintage !== b.vintage || a.formatCl !== b.formatCl) continue;
      const same =
        a.canonicalKey === b.canonicalKey ||
        (similarity(a.producer, b.producer) >= 0.8 && similarity(cleanName(a.name), cleanName(b.name)) >= 0.85 && (a.color === b.color || a.color === 'autre' || b.color === 'autre'));
      if (same) parent.set(find(a.id), find(b.id));
    }
  }
  const groups = new Map<string, Wine[]>();
  for (const w of live) groups.set(find(w.id), [...(groups.get(find(w.id)) ?? []), w]);
  return [...groups.values()].filter((g) => g.length > 1);
}

export function DuplicatesPanel({ groups }: { groups: Wine[][] }) {
  const { t } = useI18n();
  const { toast, confirm } = useToast();
  const { user } = useAuth();
  const { orgId, stock, sites, commit, path } = useOrg();
  const [busy, setBusy] = useState<string | null>(null);

  const merge = async (group: Wine[], keeper: Wine) => {
    if (!user) return;
    const ok = await confirm({ title: t('dup.confirmTitle'), message: t('dup.confirmMsg', { name: wineLabel(keeper) }), confirmLabel: t('dup.merge') });
    if (!ok) return;
    setBusy(keeper.id);
    const moves = group
      .filter((w) => w.id !== keeper.id)
      .flatMap((dup) =>
        sites.flatMap((s) => {
          const q = qtyAt(stock, dup.id, s.id);
          return q
            ? [
                { wine: dup, siteId: s.id, type: 'adjust' as const, qty: -q, reason: 'inventaire' as const, note: `Fusion → ${keeper.id}` },
                { wine: keeper, siteId: s.id, type: 'adjust' as const, qty: q, reason: 'inventaire' as const, note: `Fusion ← ${dup.id}` },
              ]
            : [];
        }),
      );
    const ops = [
      ...buildMovementOps(orgId, moves, { userId: user.uid, userName: user.name }),
      ...group
        .filter((w) => w.id !== keeper.id)
        .map((dup) => ({ op: 'set' as const, path: path('wines', dup.id), data: { isArchived: true, notes: `Fusionné dans ${wineLabel(keeper)}`, updatedAt: Date.now() }, merge: true })),
    ];
    await commit(ops);
    toast(t('dup.done'));
    setBusy(null);
  };

  if (!groups.length) return <EmptyState icon={<CheckCircle2 className="size-8 text-ok" />} title={t('dup.none')} hint={t('dup.noneHint')} />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{t('dup.intro')}</p>
      {groups.map((g) => (
        <Card key={g.map((w) => w.id).join()} className="p-4">
          <div className="space-y-2">
            {g.map((w) => (
              <div key={w.id} className="flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{wineLabel(w)}</span>
                <Badge>{sites.reduce((n, s) => n + qtyAt(stock, w.id, s.id), 0)} {t('common.bottles')}</Badge>
                <Button size="sm" icon={<Merge className="size-4" />} loading={busy === w.id} onClick={() => merge(g, w)}>
                  {t('dup.keepThis')}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
