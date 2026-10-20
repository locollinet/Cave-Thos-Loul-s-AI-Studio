import { useMemo } from 'react';
import { useCollection } from '@/app/org';
import type { Offer } from './types';

export function useOffers() {
  const { rows, loading } = useCollection<Offer>('offers');
  const offers = useMemo(() => [...rows].sort((a, b) => b.createdAt - a.createdAt), [rows]);
  return { offers, loading };
}
