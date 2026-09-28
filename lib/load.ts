import "server-only";
import { monthRangeUTC } from "./dates";
import { classify, lookbackStart, normalize } from "./orders";
import { fetchOrdersCreatedBetween } from "./shopify";
import type { Order } from "./types";

export function parseMonthYear(month: unknown, year: unknown) {
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error("Invalid month");
  if (!Number.isInteger(y) || y < 2000 || y > 2100) throw new Error("Invalid year");
  return { month: m, year: y };
}

/** All orders relevant to a month (created in it, or COD delivered in it), newest first. */
export async function loadMonth(month: number, year: number) {
  const range = monthRangeUTC(month, year);
  const raw = await fetchOrdersCreatedBetween(lookbackStart(range), range.end);
  const orders = raw
    .map((r) => classify(normalize(r), range))
    .filter((o): o is Order => o !== null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { range, orders };
}
