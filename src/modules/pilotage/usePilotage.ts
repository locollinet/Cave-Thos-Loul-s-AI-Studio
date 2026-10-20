import { useMemo } from 'react';
import type { Movement, PurchaseInvoice } from '@/types';
import { useCollection, useOrg } from '@/app/org';
import { today } from '@/lib/utils';
import type { SaleDocument } from '../negoce/types';
import { abcAnalysis, bySite, buildSalesData, computeKpis, dormantWines, monthlySeries, rankWines, winePerformance, type PilotageInput } from './kpis';
import { suggestReplenishment } from './replenish';
import type { Period } from './types';

export function usePilotage(period: Period, siteId: string) {
  const { wines, stock, sites, org } = useOrg();
  const movements = useCollection<Movement>('movements');
  const docs = useCollection<SaleDocument>('documents');
  const purchases = useCollection<PurchaseInvoice>('purchaseInvoices');
  const loading = movements.loading || docs.loading || purchases.loading;
  const asOf = today();

  return useMemo(() => {
    const input: PilotageInput = { wines, stock, movements: movements.rows, docs: docs.rows, period, siteId, restaurantMode: org.profile === 'restaurant', vatRate: org.defaultVatRate };
    const data = buildSalesData(input);
    const perfs = winePerformance(data.sales, wines, stock, siteId);
    return {
      loading,
      input,
      data,
      kpis: computeKpis(input, data),
      perfs,
      ranking: rankWines(perfs, 8),
      abc: abcAnalysis(perfs),
      dormant: dormantWines({ wines, stock, movements: movements.rows, siteId, asOf }),
      monthly: monthlySeries(data.sales, period),
      siteRows: bySite(input, sites.map((s) => s.id)),
      replenish: suggestReplenishment({ wines, stock, movements: movements.rows, purchases: purchases.rows, siteId, asOf }),
      hasSales: data.sales.length > 0,
    };
  }, [wines, stock, movements.rows, docs.rows, purchases.rows, period, siteId, org.profile, org.defaultVatRate, sites, loading, asOf]);
}

export type PilotageView = ReturnType<typeof usePilotage>;
