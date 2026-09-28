import { NextResponse, type NextRequest } from "next/server";
import { monthFromExport, parseMonthYear } from "@/lib/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET ?id=<export id>&month=&year= → orders, final invoices and numbering for the month */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const id = p.get("id");
  if (!id) return NextResponse.json({ error: "Missing export id" }, { status: 400 });
  try {
    const { month, year } = parseMonthYear(p.get("month"), p.get("year"));
    return NextResponse.json(await monthFromExport(id, month, year));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
