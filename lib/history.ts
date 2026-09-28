"use client";

import { monthLabel, previousMonth } from "./dates";

/**
 * Remembers (in this browser) which invoice numbers each exported month used,
 * so the next month's starting number can be suggested and nothing is skipped.
 */
export interface ExportRecord {
  month: number;
  year: number;
  first: number;
  last: number; // equals first - 1 when the month had no invoices
  count: number;
  exportedAt: string;
}

const KEY = "kc:exports";
const key = (m: number, y: number) => `${y}-${String(m).padStart(2, "0")}`;

export function readHistory(): Record<string, ExportRecord> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveExport(r: ExportRecord) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readHistory(), [key(r.month, r.year)]: r }));
  } catch {
    /* storage unavailable — suggestion just won't be remembered */
  }
}

/** Suggested first invoice number for a month, with a short explanation. */
export function suggestStart(month: number, year: number): { number: number; reason: string } {
  if (month === 4) return { number: 1, reason: "April starts a new financial year" };
  const h = readHistory();
  const same = h[key(month, year)];
  if (same) return { number: same.first, reason: `Same numbers as your last export of ${monthLabel(month, year)}` };
  const prev = previousMonth({ month, year });
  const p = h[key(prev.month, prev.year)];
  if (p) return { number: p.last + 1, reason: `Continues from ${monthLabel(prev.month, prev.year)} (ended at ${p.last})` };
  return { number: 1, reason: "No earlier export found in this browser — check your last invoice number" };
}

export function historyList() {
  return Object.values(readHistory()).sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
}
