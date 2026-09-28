const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const TZ = "Asia/Kolkata";

/** UTC instants for [start of month IST, start of next month IST). */
export function monthRangeUTC(month: number, year: number) {
  const start = new Date(Date.UTC(year, month - 1, 1) - IST_OFFSET_MS);
  const end = new Date(Date.UTC(year, month, 1) - IST_OFFSET_MS);
  return { start, end };
}

export function isInRange(iso: string | null | undefined, range: { start: Date; end: Date }) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= range.start.getTime() && t < range.end.getTime();
}

/** Calendar parts of an instant as seen in IST. */
export function istParts(iso: string) {
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** 05 Aug 2026 */
export function formatDateIST(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/** 05/08/2026 */
export function formatDateNumericIST(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(month: number, year: number) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** Current month/year in IST. */
export function currentMonthIST(now: Date = new Date()) {
  const { month, year } = istParts(now.toISOString());
  return { month, year };
}

/** Indian financial year (April–March) for an instant, e.g. "26-27". */
export function financialYear(iso: string) {
  const { year, month } = istParts(iso);
  const startYear = month >= 4 ? year : year - 1;
  const yy = (n: number) => String(n % 100).padStart(2, "0");
  return `${yy(startYear)}-${yy(startYear + 1)}`;
}
