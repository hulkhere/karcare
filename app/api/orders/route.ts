import { NextResponse, type NextRequest } from "next/server";
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
    const { range, orders } = await loadMonth(month, year);
    const body: OrdersResponse = {
      month,
      year,
      range: { start: range.start.toISOString(), end: range.end.toISOString() },
      orders,
    };
    return NextResponse.json(body);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
