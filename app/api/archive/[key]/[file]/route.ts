import { NextResponse, type NextRequest } from "next/server";
import { getSnapshot, parseMonthKey } from "@/lib/archive";
import { monthTag, registerCsv } from "@/lib/export";
import { caPackage, invoicesZip, mergedPdf } from "@/lib/pdfServer";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string; file: string }> }) {
  const { key, file } = await params;
  const ym = parseMonthKey(key);
  if (!ym) return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  const snap = await getSnapshot(getStore(), ym);
  if (!snap) return NextResponse.json({ error: "Month is not closed yet" }, { status: 404 });

  const tag = monthTag(snap);
  let body: Buffer | string;
  let type: string;
  let name: string;
  switch (file) {
    case "package.zip":
      [body, type, name] = [await caPackage(snap), "application/zip", `KarCare-GST-${tag}.zip`];
      break;
    case "invoices.pdf":
      if (!snap.invoices.length) return NextResponse.json({ error: "No invoices this month" }, { status: 404 });
      [body, type, name] = [await mergedPdf(snap.invoices), "application/pdf", `KarCare-Invoices-${tag}.pdf`];
      break;
    case "invoices.zip":
      [body, type, name] = [await invoicesZip(snap), "application/zip", `KarCare-Invoices-${tag}.zip`];
      break;
    case "register.csv":
      [body, type, name] = [registerCsv(snap.invoices), "text/csv; charset=utf-8", `Invoice-Register-${tag}.csv`];
      break;
    default:
      return NextResponse.json({ error: "Unknown file" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(typeof body === "string" ? Buffer.from(body) : body), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
