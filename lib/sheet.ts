import type { AdRow } from "./profit";

/**
 * Ad spend comes from a Google Sheet published as CSV (File → Share → Publish to web).
 * Expected columns (header row, any order): Date | Product | Spend
 */
export async function fetchAdSpend(url = process.env.GOOGLE_SHEET_CSV_URL) {
  if (!url) return { rows: [] as AdRow[], configured: false, error: null as string | null };
  try {
    const res = await fetch(url, { cache: "no-store", redirect: "follow" });
    if (!res.ok) throw new Error(`Google Sheet returned ${res.status}`);
    return { rows: parseAdSpend(await res.text()), configured: true, error: null };
  } catch (e) {
    return { rows: [], configured: true, error: `Couldn't read the ad spend sheet: ${(e as Error).message}` };
  }
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") row.push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      (row = []), (cell = "");
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim()));
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Year for a date written without one ("29-Aug"): this year, unless that would be well in the future. */
function inferYear(m: number, d: number, now: Date) {
  const y = now.getUTCFullYear();
  return Date.UTC(y, m - 1, d) - now.getTime() > 60 * 864e5 ? y - 1 : y;
}

/**
 * Day-first dates, Indian style: 01/09/2026, 1-9-2026, 2026-09-01, 1 Sep 2026, 01-Sep-2026,
 * and without a year: 29-Aug, Sep-5.
 */
export function parseDate(s: string, now = new Date()): string | null {
  const t = s.trim();
  const mon = (x: string) => MONTHS.indexOf(x.slice(0, 3).toLowerCase()) + 1;
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (r) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t))) [d, m, y] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(\d{1,2})[\s-]([a-z]{3,9})[\s-,]*(\d{2,4})$/i.exec(t))) [d, m, y] = [+r[1], mon(r[2]), +r[3]];
  else if ((r = /^(\d{1,2})[\s-]([a-z]{3,9})$/i.exec(t))) [d, m] = [+r[1], mon(r[2])], (y = inferYear(m, d, now));
  else if ((r = /^([a-z]{3,9})[\s-](\d{1,2})$/i.exec(t))) [m, d] = [mon(r[1]), +r[2]], (y = inferYear(m, d, now));
  else return null;
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const amount = (s: string | undefined) => {
  const v = (s ?? "").replace(/[₹,\s]|rs\.?/gi, "");
  return v === "" || v === "-" ? 0 : Number(v);
};

/** "Door Shock Absorbers Ad Spend (ex GST)" → "Door Shock Absorbers" */
const productFromHeader = (h: string) =>
  h.replace(/\s+/g, " ").replace(/\(.*?\)/g, "").replace(/\b(ad\s*spends?|spends?|ads?)\b/gi, "").trim();

/**
 * Two layouts are accepted (first row = headers):
 * - one column per product: Date | Door Shock Absorbers | Car Door Protector | Total
 *   ("Total" columns are ignored)
 * - one row per product: Date | Product | Spend
 */
export function parseAdSpend(text: string, now = new Date()): AdRow[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.replace(/\s+/g, " ").trim());
  const lower = header.map((h) => h.toLowerCase());
  const find = (re: RegExp) => lower.findIndex((h) => re.test(h));
  const di = Math.max(find(/date|day/), 0);
  const out: AdRow[] = [];

  const pi = find(/^(product|item|campaign)/);
  if (pi >= 0) {
    const si = Math.max(find(/spend|amount|cost/), pi === 1 ? 2 : 1);
    for (const r of rows.slice(1)) {
      const date = parseDate(r[di] ?? "", now);
      const spend = amount(r[si]);
      if (!date || !Number.isFinite(spend)) continue;
      out.push({ date, product: (r[pi] ?? "").trim(), spend });
    }
    return out;
  }

  const productCols = header
    .map((h, i) => ({ i, product: productFromHeader(h) }))
    .filter(({ i, product }) => i !== di && product && !/^(total|sum|overall)/i.test(product));
  for (const r of rows.slice(1)) {
    const date = parseDate(r[di] ?? "", now);
    if (!date) continue;
    for (const { i, product } of productCols) {
      const spend = amount(r[i]);
      if (Number.isFinite(spend) && spend !== 0) out.push({ date, product, spend });
    }
  }
  return out;
}
