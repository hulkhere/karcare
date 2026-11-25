import { NextResponse, type NextRequest } from "next/server";
import { parseMonthYear, startSync } from "@/lib/server";
import { exportStatus } from "@/lib/shopify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST { month, year, since? } → syncs the whole invoice series that month belongs to.
 * Without `since`: starts a bulk export → { id }. With `since` (ISO): orders changed since then,
 * straight away → { orders } (or { id } of a bulk export when too many changed).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ym = parseMonthYear(body.month, body.year);
    const since = body.since ? new Date(body.since) : undefined;
    if (since && Number.isNaN(since.getTime())) throw new Error("Invalid since");
    return NextResponse.json(await startSync(ym, since));
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
