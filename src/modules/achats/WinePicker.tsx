import { useMemo, useState } from 'react';
import type { Wine } from '@/types';
import { useT } from '@/i18n';
import { EmptyState, Modal, SearchInput } from '@/ui';
import { norm, wineLabel } from '@/lib/wine';

export function WinePicker({ wines, onPick, onClose }: { wines: Wine[]; onPick: (w: Wine) => void; onClose: () => void }) {
  const t = useT();
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const nq = norm(q);
    return wines
      .filter((w) => !w.isArchived && (!nq || norm(`${w.producer} ${w.name} ${w.vintage}`).includes(nq)))
      .sort((a, b) => a.producer.localeCompare(b.producer) || a.name.localeCompare(b.name))
      .slice(0, 60);
  }, [wines, q]);
  return (
    <Modal open onClose={onClose} title={t('achats.pick.title')} size="md">
      <div className="space-y-3">
        <SearchInput value={q} onChange={setQ} placeholder={t('common.search')} />
        {rows.length === 0 ? (
          <EmptyState title={t('carte.wines.empty')} />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {rows.map((w) => (
              <li key={w.id}>
                <button type="button" onClick={() => onPick(w)} className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none">
                  {wineLabel(w)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
