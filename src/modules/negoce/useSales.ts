import { useMemo } from 'react';
import { useCollection } from '@/app/org';
import type { Consignment, Payment, SaleDocument } from './types';

export function useSales() {
  const d = useCollection<SaleDocument>('documents');
  const p = useCollection<Payment>('payments');
  const c = useCollection<Consignment>('consignments');
  const docs = useMemo(() => [...d.rows].sort((a, b) => (b.date === a.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date))), [d.rows]);
  return { docs, payments: p.rows, consignments: c.rows, loading: d.loading || p.loading || c.loading };
}
