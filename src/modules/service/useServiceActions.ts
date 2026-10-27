import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Wine } from '@/types';
import { useOrg } from '@/app/org';
import { useAuth } from '@/app/auth';
import { useT } from '@/i18n';
import { useToast } from '@/ui';
import type { Op } from '@/data/store';
import { qtyAt } from '@/data/stock';
import { wineLabel } from '@/lib/wine';
import {
  buildBottleOutOps,
  buildFinishOps,
  buildLossOps,
  buildOpenBottleOps,
  buildServeOps,
  buildUndoBottleOutOps,
  buildUndoOpenOps,
  glassesRemaining,
} from './logic';
import type { OpenBottle } from './types';

/** Évite les doubles appuis involontaires sur tablette (même action, même cible). */
const TAP_GUARD_MS = 450;

export function useServiceActions(siteId: string, bottles: OpenBottle[]) {
  const t = useT();
  const { toast, confirm } = useToast();
  const { user } = useAuth();
  const { orgId, stock, wines, commit, member } = useOrg();
  const actor = useMemo(() => ({ userId: user?.uid ?? member?.uid ?? '', userName: user?.name ?? member?.name ?? '' }), [user, member]);

  const bottlesRef = useRef(bottles);
  useEffect(() => {
    bottlesRef.current = bottles;
  }, [bottles]);
  const lastTap = useRef<{ key: string; at: number }>({ key: '', at: 0 });

  const run = useCallback(
    (key: string, ops: Op[] | null, onDone?: () => void, onRefused?: () => void) => {
      const now = Date.now();
      if (lastTap.current.key === key && now - lastTap.current.at < TAP_GUARD_MS) return;
      lastTap.current = { key, at: now };
      if (!ops) {
        onRefused?.();
        return;
      }
      commit(ops).then(onDone, (e: Error) => toast(e.message, 'bad'));
    },
    [commit, toast],
  );

  const wineOf = useCallback((id: string) => wines.find((w) => w.id === id), [wines]);

  const bottleOut = useCallback(
    (wine: Wine) => {
      const label = wineLabel(wine);
      run(
        `out:${wine.id}`,
        buildBottleOutOps(orgId, wine, siteId, qtyAt(stock, wine.id, siteId), actor),
        () =>
          toast(t('service.toast.out', { wine: label }), 'ok', {
            label: t('service.undo'),
            onClick: () =>
              commit(buildUndoBottleOutOps(orgId, wine, siteId, actor, t('service.undoNote'))).then(
                () => toast(t('service.toast.outUndone'), 'info'),
                (e: Error) => toast(e.message, 'bad'),
              ),
          }),
        () => toast(t('service.toast.noStock'), 'bad'),
      );
    },
    [run, orgId, siteId, stock, actor, toast, t, commit],
  );

  const openBottle = useCallback(
    (wine: Wine, onOpened?: () => void, preservation: 'standard' | 'coravin' = 'standard') => {
      if (qtyAt(stock, wine.id, siteId) < 1) {
        toast(t('service.toast.noStock'), 'bad');
        return;
      }
      const res = buildOpenBottleOps(orgId, wine, siteId, actor, Date.now(), undefined, preservation);
      const label = wineLabel(wine);
      run(`open:${wine.id}`, res?.ops ?? null, () => {
        onOpened?.();
        toast(t('service.toast.opened', { wine: label }) + (preservation === 'coravin' ? ' (Conservation Coravin / Azote)' : ''), 'ok', {
          label: t('service.undo'),
          onClick: () => {
            const cur = bottlesRef.current.find((b) => b.id === res!.bottle.id) ?? res!.bottle;
            if (cur.glassesServed > 0 || (cur.lostGlasses ?? 0) > 0 || cur.status !== 'open') {
              toast(t('service.toast.cannotUndo'), 'bad');
              return;
            }
            commit(buildUndoOpenOps(orgId, wine, cur, actor, t('service.undoNote'))).then(
              () => toast(t('service.toast.openUndone'), 'info'),
              (e: Error) => toast(e.message, 'bad'),
            );
          },
        });
      });
    },
    [run, orgId, siteId, stock, actor, toast, t, commit],
  );

  const serve = useCallback(
    (b: OpenBottle, delta: 1 | -1) => {
      const ops = buildServeOps(orgId, b, delta);
      if (!ops) {
        if (delta > 0) toast(t('service.toast.empty'), 'info');
        return;
      }
      // Les appuis rapides sur « +1 » sont légitimes : pas de garde anti-rebond ici.
      if (delta > 0) commit(ops).catch((e: Error) => toast(e.message, 'bad'));
      else run(`unserve:${b.id}`, ops);
    },
    [run, commit, orgId, toast, t],
  );

  const finish = useCallback(
    async (b: OpenBottle) => {
      const left = glassesRemaining(b);
      if (left > 0) {
        const ok = await confirm({ title: t('service.finish.title'), message: t('service.finish.message', { n: left }), confirmLabel: t('service.finish') });
        if (!ok) return;
      }
      run(`finish:${b.id}`, buildFinishOps(orgId, b), () => toast(t('service.toast.finished', { wine: b.wineLabel })));
    },
    [run, orgId, confirm, toast, t],
  );

  const loss = useCallback(
    (b: OpenBottle, n: number) => {
      const discarded = n >= glassesRemaining(b);
      run(`loss:${b.id}`, buildLossOps(orgId, b, n), () =>
        toast(discarded ? t('service.toast.discarded', { wine: b.wineLabel }) : t('service.toast.loss', { n }), 'info'),
      );
    },
    [run, orgId, toast, t],
  );

  return { bottleOut, openBottle, serve, finish, loss, wineOf };
}
