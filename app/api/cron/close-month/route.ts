import { NextResponse, type NextRequest } from "next/server";
import { ensureClosed, summarize } from "@/lib/archive";
import { archiveDeps } from "@/lib/archiveServer";
import { safeEqual } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called by Vercel Cron on the 1st of every month (see vercel.json). */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const months = (await ensureClosed(archiveDeps())).map(summarize);
    return NextResponse.json({ ok: true, latest: months[0] ?? null });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
