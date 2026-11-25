import "server-only";
import { productForPath } from "./costs";
import { monthRangeUTC } from "./dates";
import { fetchFrom, seriesStartFor } from "./orders";
import type { RawOrder } from "./raw";
import {
  downloadOrders,
  exportStatus,
  fetchChangedOrders,
  fetchFulfillmentEvents,
  fetchLandingSessions,
  startOrdersExport,
} from "./shopify";

export function parseMonthYear(month: unknown, year: unknown) {
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error("Invalid month");
  if (!Number.isInteger(y) || y < 2000 || y > 2100) throw new Error("Invalid year");
  return { month: m, year: y };
}

/**
 * The orders one invoice series needs: from its start (1 April or the series start, minus the
 * COD look-back) up to now or the end of that financial year.
 */
export function seriesRange(ym: { month: number; year: number }) {
  const s = seriesStartFor(ym);
  const fyEnd = monthRangeUTC(4, s.month >= 4 ? s.year + 1 : s.year).start;
  return { series: `${s.year}-${s.month}`, from: fetchFrom(ym), to: new Date(Math.min(Date.now(), fyEnd.getTime())) };
}

/**
 * Start a sync. With `since`, first try fetching just the changed orders directly (fast);
 * if there are too many, or for a full load, start a bulk export and return its id.
 */
export async function startSync(ym: { month: number; year: number }, since?: Date) {
  const { series, from, to } = seriesRange(ym);
  if (since) {
    const orders = await fetchChangedOrders(from, to, since);
    if (orders) {
      await attachFailureEvents(orders);
      return { series, orders };
    }
  }
  return { series, id: await startOrdersExport(from, to, since) };
}

/** Orders per response page — keeps each response well under Vercel's 4.5 MB limit. */
export const EXPORT_PAGE_SIZE = 700;

// Parsed exports, kept briefly so the pages of one export don't each re-download it.
const cache = new Map<string, Promise<RawOrder[]>>();

async function loadExport(exportId: string): Promise<RawOrder[]> {
  const status = await exportStatus(exportId);
  if (status.status !== "COMPLETED") throw new Error(`Export is ${status.status.toLowerCase()}`);
  const orders = await downloadOrders(status.url);
  await attachFailureEvents(orders);
  return orders;
}

/** One page of a finished export, with RTO dates attached. */
export async function exportPage(exportId: string, page: number) {
  let p = cache.get(exportId);
  if (!p) {
    p = loadExport(exportId);
    cache.set(exportId, p);
    p.catch(() => cache.delete(exportId));
    if (cache.size > 4) cache.delete(cache.keys().next().value!);
  }
  const orders = await p;
  const pages = Math.max(1, Math.ceil(orders.length / EXPORT_PAGE_SIZE));
  return {
    total: orders.length,
    page,
    pages,
    orders: orders.slice(page * EXPORT_PAGE_SIZE, (page + 1) * EXPORT_PAGE_SIZE),
  };
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

export interface ProductSessions {
  available: boolean;
  /** Set when Shopify refused — usually the app is missing the read_reports permission */
  error: string | null;
  needsPermission: boolean;
  rows: { date: string; product: string; sessions: number }[];
}

/** Store visits per product page per day, for CVR. Never throws — CVR just shows "–" when unavailable. */
export async function productSessions(fromDay: string, toDay: string): Promise<ProductSessions> {
  try {
    const raw = await fetchLandingSessions(fromDay, toDay);
    const sum = new Map<string, number>();
    for (const r of raw) {
      const product = productForPath(r.path);
      if (!product) continue;
      const k = `${r.date}|${product}`;
      sum.set(k, (sum.get(k) ?? 0) + r.sessions);
    }
    return {
      available: true,
      error: null,
      needsPermission: false,
      rows: [...sum].map(([k, sessions]) => {
        const [date, product] = k.split("|");
        return { date, product, sessions };
      }),
    };
  } catch (e) {
    const msg = (e as Error).message;
    return { available: false, error: msg, needsPermission: /access|denied|scope|permission|read_reports/i.test(msg), rows: [] };
  }
}
