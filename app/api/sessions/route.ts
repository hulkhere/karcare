import { NextResponse, type NextRequest } from "next/server";
import { productSessions } from "@/lib/server";

export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** GET ?from=YYYY-MM-DD&to=YYYY-MM-DD → store visits per product page per day */
export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  if (!DAY.test(from) || !DAY.test(to)) return NextResponse.json({ error: "from/to must be YYYY-MM-DD" }, { status: 400 });
  return NextResponse.json(await productSessions(from, to));
}
