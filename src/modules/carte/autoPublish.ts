import { useEffect, useRef } from 'react';
import { useOrg, useCollection } from '@/app/org';
import { buildListSections, hashPublicDoc, toPublicDoc } from './build';
import { publicPath } from './publish';
import type { PublicListDoc, WineList } from './types';

const DEBOUNCE_MS = 3000;

/**
 * Republie (debounce 3 s) l'instantané public des cartes publiées lorsque vins, stock ou prix changent.
 * À monter une seule fois dans le Layout ; sans effet pour les rôles sans droit d'écriture sur les cartes.
 */
export function useAutoRepublish(): void {
  const { store, orgId, org, wines, stock, can } = useOrg();
  const { rows: lists, loading } = useCollection<WineList>('wineLists');
  const lastHash = useRef(new Map<string, string>());
  const allowed = can('sommelier');

  useEffect(() => {
    if (!allowed || loading || wines.length === 0) return;
    const published = lists.filter((l) => l.published && l.publicId.length >= 16);
    if (!published.length) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      for (const list of published) {
        const sections = buildListSections(list, wines, stock, org);
        const probe = toPublicDoc(list, sections, org, 0);
        const hash = hashPublicDoc(probe);
        let known = lastHash.current.get(list.publicId);
        if (known === undefined) {
          try {
            const existing = await store.getDoc<PublicListDoc>(publicPath(list.publicId));
            known = existing ? hashPublicDoc(existing) : '';
          } catch {
            known = '';
          }
          lastHash.current.set(list.publicId, known);
        }
        if (cancelled) return;
        if (known === hash) continue;
        try {
          await store.commit([{ op: 'set', path: publicPath(list.publicId), data: JSON.parse(JSON.stringify({ ...probe, updatedAt: Date.now() })) }]);
          lastHash.current.set(list.publicId, hash);
        } catch {
          // nouvelle tentative au prochain changement
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [allowed, loading, lists, wines, stock, org, store, orgId]);
}
