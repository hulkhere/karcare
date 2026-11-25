import { NextResponse } from "next/server";
import { fetchAdSpend } from "@/lib/sheet";

export const dynamic = "force-dynamic";

/** Meta ad spend rows from the published Google Sheet */
export async function GET() {
  return NextResponse.json(await fetchAdSpend());
}
