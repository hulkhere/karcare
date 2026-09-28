import { NextResponse, type NextRequest } from "next/server";
import { draftFirstNumber, getSnapshot } from "@/lib/archive";
import { archiveDeps } from "@/lib/archiveServer";
import { loadMonth, parseMonthYear } from "@/lib/load";
import { buildInvoice, sortForInvoicing } from "@/lib/orders";
import type { InvoiceData } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Draft invoices for a month that is still open.
 * Body: { month, year, orderIds: string[] }
 * Numbers continue from the last closed month but are provisional until the month closes.
 * Closed months are served from the archive instead.
 */
export async function POST(req: NextRequest) {
  let month: number, year: number, orderIds: string[];
  try {
    const body = await req.json();
    ({ month, year } = parseMonthYear(body.month, body.year));
    orderIds = Array.isArray(body.orderIds) ? body.orderIds.map(String) : [];
    if (orderIds.length === 0) throw new Error("No orders selected");
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  try {
    const deps = archiveDeps();
    if (await getSnapshot(deps.store, { month, year })) {
      return NextResponse.json({ error: "This month is closed. Download its final invoices from the Archive tab." }, { status: 409 });
    }
    const firstNumber = await draftFirstNumber(deps, { month, year });
    const { orders } = await loadMonth(month, year);
    const wanted = new Set(orderIds);
    const selected = orders.filter((o) => wanted.has(o.id));
    const eligible = selected.filter((o) => o.bucket === "invoiceable");
    const rejected = selected
      .filter((o) => o.bucket !== "invoiceable")
      .map((o) => ({ id: o.id, name: o.name, reason: o.reason }));

    const invoices: InvoiceData[] = sortForInvoicing(eligible).map((o, i) => buildInvoice(o, firstNumber + i));
    return NextResponse.json({ invoices, rejected, draft: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
