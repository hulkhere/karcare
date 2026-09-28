import { NextResponse, type NextRequest } from "next/server";
import { loadMonth, parseMonthYear } from "@/lib/load";
import { buildInvoice, sortForInvoicing } from "@/lib/orders";
import type { InvoiceData } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Body: { month, year, startNumber }
 * Re-fetches the month from Shopify and applies the standard invoice rules server-side:
 * every qualifying order is invoiced, numbered by invoice date from `startNumber`.
 */
export async function POST(req: NextRequest) {
  let month: number, year: number, startNumber: number;
  try {
    const body = await req.json();
    ({ month, year } = parseMonthYear(body.month, body.year));
    startNumber = body.startNumber == null ? 1 : Number(body.startNumber);
    if (!Number.isInteger(startNumber) || startNumber < 1) throw new Error("Invalid starting invoice number");
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  try {
    const { orders } = await loadMonth(month, year);
    const eligible = orders.filter((o) => o.bucket === "invoiceable");
    const invoices: InvoiceData[] = sortForInvoicing(eligible).map((o, i) => buildInvoice(o, startNumber + i));
    return NextResponse.json({ invoices });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
