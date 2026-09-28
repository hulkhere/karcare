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

/** Accepts 01/09/2026, 1-9-2026, 2026-09-01, 1 Sep 2026, 01-Sep-2026 (day first, Indian style). */
export function parseDate(s: string): string | null {
  const t = s.trim();
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (r) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t))) [d, m, y] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(\d{1,2})[\s-]([a-z]{3})[a-z]*[\s-,]*(\d{2,4})$/i.exec(t))) {
    [d, m, y] = [+r[1], MONTHS.indexOf(r[2].toLowerCase()) + 1, +r[3]];
  } else return null;
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseAdSpend(text: string): AdRow[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (re: RegExp, fallback: number) => {
    const i = header.findIndex((h) => re.test(h));
    return i >= 0 ? i : fallback;
  };
  const di = col(/date|day/, 0);
  const pi = col(/product|item|campaign/, 1);
  const si = col(/spend|amount|cost/, 2);
  const out: AdRow[] = [];
  for (const r of rows.slice(1)) {
    const date = parseDate(r[di] ?? "");
    const spend = Number((r[si] ?? "").replace(/[₹,\s]|rs\.?/gi, ""));
    if (!date || !Number.isFinite(spend)) continue;
    out.push({ date, product: (r[pi] ?? "").trim(), spend });
  }
  return out;
}
