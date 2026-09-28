import { NextResponse, type NextRequest } from "next/server";
import { loadMonth, parseMonthYear } from "@/lib/load";
import { buildInvoice, sortForInvoicing } from "@/lib/orders";
import type { InvoiceData } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Body: { month, year, orderIds: string[], startNumber?: number }
 * Re-fetches the month from Shopify and re-checks eligibility server-side,
 * so only qualifying orders are ever invoiced.
 */
export async function POST(req: NextRequest) {
  let month: number, year: number, orderIds: string[], startNumber: number;
  try {
    const body = await req.json();
    ({ month, year } = parseMonthYear(body.month, body.year));
    orderIds = Array.isArray(body.orderIds) ? body.orderIds.map(String) : [];
    startNumber = body.startNumber == null ? 1 : Number(body.startNumber);
    if (!Number.isInteger(startNumber) || startNumber < 1) throw new Error("Invalid starting invoice number");
    if (orderIds.length === 0) throw new Error("No orders selected");
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  try {
    const { orders } = await loadMonth(month, year);
    const wanted = new Set(orderIds);
    const selected = orders.filter((o) => wanted.has(o.id));
    const eligible = selected.filter((o) => o.bucket === "invoiceable");
    const rejected = [
      ...selected.filter((o) => o.bucket !== "invoiceable").map((o) => ({ id: o.id, name: o.name, reason: o.reason })),
      ...orderIds
        .filter((id) => !orders.some((o) => o.id === id))
        .map((id) => ({ id, name: id, reason: "Not found in this month" })),
    ];

    const invoices: InvoiceData[] = sortForInvoicing(eligible).map((o, i) => buildInvoice(o, startNumber + i));
    return NextResponse.json({ invoices, rejected });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
