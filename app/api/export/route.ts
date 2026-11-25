import { NextResponse, type NextRequest } from "next/server";
import { exportPage } from "@/lib/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET ?id=<export id>&page=<n> → one page of the finished export's orders */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const page = Number(req.nextUrl.searchParams.get("page") ?? 0);
  if (!id || !Number.isInteger(page) || page < 0) return NextResponse.json({ error: "Missing id or page" }, { status: 400 });
  try {
    return NextResponse.json(await exportPage(id, page));
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
