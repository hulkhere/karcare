import { currentMonthIST, monthLabel, monthRangeUTC } from "./dates";
import { buildInvoice, classify, lookbackStart, normalize, sortForInvoicing } from "./orders";
import type { RawOrder } from "./shopify";
import type { KV } from "./store";
import type { ArchiveMonth, ArchiveSnapshot, Order } from "./types";

export interface ArchiveConfig {
  /** First month the archive tracks, and the invoice number it starts from. */
  startMonth: number;
  startYear: number;
  startNumber: number;
}

export interface ArchiveDeps {
  store: KV;
  fetchRaw: (from: Date, to: Date) => Promise<RawOrder[]>;
  config: ArchiveConfig;
  now?: () => Date;
}

type YM = { month: number; year: number };

export const monthKey = ({ month, year }: YM) => `${year}-${String(month).padStart(2, "0")}`;
const storeKey = (ym: YM) => `archive:${monthKey(ym)}`;
const ordinal = ({ month, year }: YM) => year * 12 + (month - 1);
const fromOrdinal = (n: number): YM => ({ year: Math.floor(n / 12), month: (n % 12) + 1 });
export const prevMonth = (ym: YM) => fromOrdinal(ordinal(ym) - 1);

export function parseMonthKey(key: string): YM | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const ym = { year: Number(m[1]), month: Number(m[2]) };
  return ym.month >= 1 && ym.month <= 12 ? ym : null;
}

export function configFromEnv(env: Record<string, string | undefined> = process.env): ArchiveConfig {
  const start = parseMonthKey(env.ARCHIVE_START_MONTH || "2026-08");
  if (!start) throw new Error("ARCHIVE_START_MONTH must look like 2026-08");
  const startNumber = Number(env.ARCHIVE_START_NUMBER || 1);
  if (!Number.isInteger(startNumber) || startNumber < 1) throw new Error("ARCHIVE_START_NUMBER must be a positive integer");
  return { startMonth: start.month, startYear: start.year, startNumber };
}

const startYM = (c: ArchiveConfig): YM => ({ month: c.startMonth, year: c.startYear });

/** Months from the archive start up to (and including) the last fully completed month in IST. */
export function completedMonths(deps: ArchiveDeps): YM[] {
  const now = deps.now?.() ?? new Date();
  const current = currentMonthIST(now);
  const out: YM[] = [];
  for (let n = ordinal(startYM(deps.config)); n < ordinal(current); n++) out.push(fromOrdinal(n));
  return out;
}

export function isTracked(deps: ArchiveDeps, ym: YM) {
  return ordinal(ym) >= ordinal(startYM(deps.config));
}

export const getSnapshot = (store: KV, ym: YM) => store.get<ArchiveSnapshot>(storeKey(ym));

/** First invoice number for a month: continues from the previous month, resetting every April. */
async function firstNumberFor(deps: ArchiveDeps, ym: YM): Promise<number> {
  if (ordinal(ym) === ordinal(startYM(deps.config))) return deps.config.startNumber;
  if (ym.month === 4) return 1;
  const prev = await getSnapshot(deps.store, prevMonth(ym));
  if (!prev) throw new Error(`${monthLabel(prevMonth(ym).month, prevMonth(ym).year)} must be closed first`);
  return prev.nextNumber;
}

/** Order IDs invoiced in the few months before `ym` (enough to cover the COD look-back window). */
async function recentlyInvoicedIds(deps: ArchiveDeps, ym: YM) {
  const ids = new Set<string>();
  const from = Math.max(ordinal(startYM(deps.config)), ordinal(ym) - 4);
  for (let n = from; n < ordinal(ym); n++) {
    const snap = await getSnapshot(deps.store, fromOrdinal(n));
    snap?.invoices.forEach((i) => ids.add(i.orderId));
  }
  return ids;
}

/**
 * Freeze a completed month: every qualifying order gets a final, gap-free invoice number.
 * Idempotent — if the month is already closed, the stored snapshot is returned unchanged.
 */
export async function closeMonth(deps: ArchiveDeps, ym: YM): Promise<ArchiveSnapshot> {
  const existing = await getSnapshot(deps.store, ym);
  if (existing) return existing;

  const now = deps.now?.() ?? new Date();
  const range = monthRangeUTC(ym.month, ym.year);
  if (range.end.getTime() > now.getTime()) throw new Error(`${monthLabel(ym.month, ym.year)} hasn't ended yet`);
  if (!isTracked(deps, ym)) throw new Error(`${monthLabel(ym.month, ym.year)} is before the archive start month`);

  const firstNumber = await firstNumberFor(deps, ym);
  const alreadyInvoiced = await recentlyInvoicedIds(deps, ym);
  const archiveStart = monthRangeUTC(deps.config.startMonth, deps.config.startYear).start;

  const orders = (await deps.fetchRaw(lookbackStart(range), range.end)).map(normalize);

  const eligible = orders
    .map((o) => classify(o, range))
    .filter((o): o is Order => o?.bucket === "invoiceable" && !alreadyInvoiced.has(o.id));

  // COD orders delivered before this month whose delivery was recorded only after that month
  // was closed. They are invoiced now (dated the 1st of this month) so nothing is ever missed.
  const late: Order[] = orders
    .filter((o) => {
      const d = o.delivery.deliveredAt ? new Date(o.delivery.deliveredAt) : null;
      return (
        o.paymentType === "COD" &&
        o.delivery.status === "DELIVERED" &&
        d !== null &&
        d < range.start &&
        d >= archiveStart &&
        !alreadyInvoiced.has(o.id) &&
        !o.cancelledAt &&
        !o.isTest &&
        o.financialStatus !== "VOIDED" &&
        o.financialStatus !== "REFUNDED"
      );
    })
    .map((o) => ({
      ...o,
      bucket: "invoiceable",
      reason: "COD delivered (recorded late)",
      invoiceDate: range.start.toISOString(),
      tax: 0,
    }));

  const invoices = sortForInvoicing([...eligible, ...late]).map((o, i) => buildInvoice(o, firstNumber + i));
  const snapshot: ArchiveSnapshot = {
    key: monthKey(ym),
    month: ym.month,
    year: ym.year,
    closedAt: now.toISOString(),
    firstNumber,
    nextNumber: firstNumber + invoices.length,
    invoices,
    lateOrders: late.map((o) => o.name),
  };

  const written = await deps.store.setIfAbsent(storeKey(ym), snapshot);
  if (!written) return (await getSnapshot(deps.store, ym))!; // closed concurrently by another request
  return snapshot;
}

/** Close every completed month that isn't closed yet, oldest first. Returns all snapshots, newest first. */
export async function ensureClosed(deps: ArchiveDeps): Promise<ArchiveSnapshot[]> {
  const snaps: ArchiveSnapshot[] = [];
  for (const ym of completedMonths(deps)) snaps.push(await closeMonth(deps, ym));
  return snaps.reverse();
}

/** Provisional first number for a month that is still open (used for draft PDFs). */
export async function draftFirstNumber(deps: ArchiveDeps, ym: YM): Promise<number> {
  if (!isTracked(deps, ym)) return 1;
  await ensureClosed(deps);
  return firstNumberFor(deps, ym);
}

export function summarize(s: ArchiveSnapshot): ArchiveMonth {
  const sum = (f: (i: ArchiveSnapshot["invoices"][number]) => number) =>
    Math.round(s.invoices.reduce((a, i) => a + f(i) * 100, 0)) / 100;
  return {
    key: s.key,
    month: s.month,
    year: s.year,
    closedAt: s.closedAt,
    count: s.invoices.length,
    firstInvoice: s.invoices[0]?.number ?? null,
    lastInvoice: s.invoices.at(-1)?.number ?? null,
    taxable: sum((i) => i.taxable),
    tax: sum((i) => i.igst + i.cgst + i.sgst),
    total: sum((i) => i.total),
    lateOrders: s.lateOrders,
  };
}
