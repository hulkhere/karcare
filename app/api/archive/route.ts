import { NextResponse } from "next/server";
import { ensureClosed, summarize } from "@/lib/archive";
import { archiveDeps } from "@/lib/archiveServer";
import { currentMonthIST } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Lists closed months, closing any completed month that isn't closed yet. */
export async function GET() {
  try {
    const deps = archiveDeps();
    const months = (await ensureClosed(deps)).map(summarize);
    return NextResponse.json({ months, current: currentMonthIST(), start: deps.config });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
