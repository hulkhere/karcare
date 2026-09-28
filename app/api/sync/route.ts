import { NextResponse, type NextRequest } from "next/server";
import { monthRangeUTC } from "@/lib/dates";
import { fetchFrom, seriesStartFor } from "@/lib/orders";
import { parseMonthYear } from "@/lib/server";
import { exportStatus, startOrdersExport } from "@/lib/shopify";

export const dynamic = "force-dynamic";

/**
 * POST { month, year } → starts a Shopify bulk export covering the whole invoice series
 * that month belongs to (from 1 April / series start, minus the COD look-back, up to now).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ym = parseMonthYear(body.month, body.year);
    const s = seriesStartFor(ym);
    const fyEnd = monthRangeUTC(4, s.month >= 4 ? s.year + 1 : s.year).start;
    const to = new Date(Math.min(Date.now(), fyEnd.getTime()));
    const id = await startOrdersExport(fetchFrom(ym), to);
    return NextResponse.json({ id, series: `${s.year}-${s.month}` });
  } catch (e) {
    const msg = (e as Error).message;
    const busy = /in progress|already/i.test(msg);
    return NextResponse.json({ error: busy ? "Shopify is still finishing another export — retrying…" : msg, busy }, { status: busy ? 409 : 502 });
  }
}

/** GET ?id= → export progress */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  try {
    const s = await exportStatus(id);
    return NextResponse.json({ status: s.status, objectCount: s.objectCount, errorCode: s.errorCode });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
