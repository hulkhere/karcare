import "server-only";
import { buildMonth, normalize } from "./orders";
import { buildProfit } from "./profit";
import { fetchAdSpend } from "./sheet";
import type { RawOrder } from "./raw";
import { downloadOrders, exportStatus, fetchFulfillmentEvents } from "./shopify";

export function parseMonthYear(month: unknown, year: unknown) {
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error("Invalid month");
  if (!Number.isInteger(y) || y < 2000 || y > 2100) throw new Error("Invalid year");
  return { month: m, year: y };
}

// Keep the last few downloaded exports in memory so switching months is instant.
const cache = new Map<string, { orders: RawOrder[]; at: string }>();

async function ordersFromExport(exportId: string) {
  let hit = cache.get(exportId);
  if (!hit) {
    const status = await exportStatus(exportId);
    if (status.status !== "COMPLETED") throw new Error(`Export is ${status.status.toLowerCase()}`);
    const orders = await downloadOrders(status.url);
    await attachFailureEvents(orders);
    hit = { orders, at: new Date().toISOString() };
    cache.set(exportId, hit);
    if (cache.size > 3) cache.delete(cache.keys().next().value!);
  }
  return hit;
}

export async function monthFromExport(exportId: string, month: number, year: number) {
  const hit = await ordersFromExport(exportId);
  return buildMonth(hit.orders, { month, year }, { syncedAt: hit.at });
}

export async function profitFromExport(exportId: string, month: number, year: number) {
  const [hit, ads] = await Promise.all([ordersFromExport(exportId), fetchAdSpend()]);
  return buildProfit(hit.orders.map(normalize), { month, year }, ads, { syncedAt: hit.at });
}

const FAILED = ["FAILURE", "NOT_DELIVERED"];

/**
 * An RTO is invoiced on the day the courier reported the failure. That date lives in the
 * fulfillment's events, which the bulk export can't include — fetch them just for failed shipments.
 */
async function attachFailureEvents(orders: RawOrder[]) {
  const failed = orders.flatMap((o) => (o.fulfillments ?? []).filter((f) => FAILED.includes(f.displayStatus ?? "")));
  if (!failed.length) return;
  const events = await fetchFulfillmentEvents(failed.map((f) => f.id));
  for (const f of failed) f.events = events.get(f.id) ?? [];
}
