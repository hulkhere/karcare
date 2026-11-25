import { cvr, roas, type ProfitRow } from "./profit";

export interface TrendPoint {
  day: string; // YYYY-MM-DD
  revenue: number; // collected, incl. GST
  adSpend: number;
  roas: number | null; // null: no ad spend entered
  orders: number;
  sessions: number | null;
  cvr: number | null; // null: visits not available (or none)
}

/** Today in India, YYYY-MM-DD. */
export const todayIST = (now = Date.now()) => new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);

/**
 * One point per complete day (today is left out — it's still running) for all products or one.
 * Uses the Profit tab's own numbers, so the chart always matches the tables.
 */
export function trendPoints(days: ProfitRow[], product: string | null, today: string): TrendPoint[] {
  return days
    .filter((d) => d.key < today)
    .map((d) => {
      const p = product ? d.byProduct?.[product] : null;
      const revenue = product ? p?.collected ?? 0 : d.collected;
      const adSpend = product ? p?.adSpend ?? 0 : d.adSpend;
      const orders = product ? p?.orders ?? 0 : d.orders;
      // A product with no row that day had no orders; its visits are 0 when visits are known at all
      const sessions = product ? (p ? p.sessions : d.sessions === null ? null : 0) : d.sessions;
      return { day: d.key, revenue, adSpend, roas: roas(revenue, adSpend), orders, sessions, cvr: cvr(orders, sessions) };
    });
}
