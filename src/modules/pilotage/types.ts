export interface Period {
  from: string;
  to: string;
}

export interface SaleLine {
  date: string;
  wineId: string;
  siteId: string;
  qty: number;
  revenueHT: number;
  costHT: number;
  source: 'document' | 'movement' | 'theoretical';
}

export interface ShrinkLine {
  date: string;
  wineId: string;
  siteId: string;
  qty: number;
  costHT: number;
  reason: 'consommation' | 'casse' | 'degustation' | 'offert';
}

export interface Kpis {
  revenueHT: number;
  servicesHT: number;
  cogs: number;
  grossMargin: number;
  marginRate: number | null; // (PV − PA) / PA
  markRate: number | null; // (PV − PA) / PV
  shrinkCost: number;
  marginAfterShrink: number;
  bottlesSold: number;
  stockCost: number;
  stockSell: number;
  stockBottles: number;
  turnover: number | null;
  coverageDays: number | null;
}

export interface WinePerf {
  wineId: string;
  label: string;
  qty: number;
  revenueHT: number;
  margin: number;
  stock: number;
}

export type AbcClass = 'A' | 'B' | 'C';

export interface AbcRow extends WinePerf {
  cumulPct: number;
  cls: AbcClass;
}

export interface DormantRow {
  wineId: string;
  label: string;
  stock: number;
  costValue: number;
  lastOut: string | null;
  daysSince: number | null;
}

export interface BreakdownRow {
  key: string;
  revenueHT: number;
  margin: number;
  qty: number;
  markRate: number | null;
}

export interface MonthPoint {
  month: string;
  revenueHT: number;
  cogs: number;
  margin: number;
}

export interface SiteRow {
  siteId: string;
  revenueHT: number;
  margin: number;
  stockCost: number;
  stockBottles: number;
}

export interface ReplenishItem {
  wineId: string;
  label: string;
  stock: number;
  threshold: number;
  velocityPerDay: number;
  coverageDays: number | null;
  suggestedQty: number;
  supplier: string;
  unitPriceHT: number;
}
