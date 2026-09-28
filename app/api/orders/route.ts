import { NextResponse, type NextRequest } from "next/server";
import { completedMonths, ensureClosed, getSnapshot, isTracked, monthKey, summarize } from "@/lib/archive";
import { archiveDeps } from "@/lib/archiveServer";
import { loadMonth, parseMonthYear } from "@/lib/load";
import type { OrdersResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  let month: number, year: number;
  try {
    ({ month, year } = parseMonthYear(req.nextUrl.searchParams.get("month"), req.nextUrl.searchParams.get("year")));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  try {
    const deps = archiveDeps();
    const ym = { month, year };
    // A completed month is closed (numbered and frozen) the first time anyone looks at it.
    const complete = completedMonths(deps).some((m) => monthKey(m) === monthKey(ym));
    if (complete && isTracked(deps, ym)) await ensureClosed(deps);
    const snap = await getSnapshot(deps.store, ym);

    const { range, orders } = await loadMonth(month, year);
    const body: OrdersResponse = {
      month,
      year,
      range: { start: range.start.toISOString(), end: range.end.toISOString() },
      orders,
      archive: snap ? summarize(snap) : null,
    };
    return NextResponse.json(body);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
