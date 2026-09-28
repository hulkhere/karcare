import "server-only";
import { buildMonth } from "./orders";
import type { RawOrder } from "./raw";
import { downloadOrders, exportStatus } from "./shopify";

export function parseMonthYear(month: unknown, year: unknown) {
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error("Invalid month");
  if (!Number.isInteger(y) || y < 2000 || y > 2100) throw new Error("Invalid year");
  return { month: m, year: y };
}

// Keep the last few downloaded exports in memory so switching months is instant.
const cache = new Map<string, { orders: RawOrder[]; at: string }>();

export async function monthFromExport(exportId: string, month: number, year: number) {
  let hit = cache.get(exportId);
  if (!hit) {
    const status = await exportStatus(exportId);
    if (status.status !== "COMPLETED") throw new Error(`Export is ${status.status.toLowerCase()}`);
    hit = { orders: await downloadOrders(status.url), at: new Date().toISOString() };
    cache.set(exportId, hit);
    if (cache.size > 3) cache.delete(cache.keys().next().value!);
  }
  return buildMonth(hit.orders, { month, year }, { syncedAt: hit.at });
}
