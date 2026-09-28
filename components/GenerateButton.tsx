"use client";

import { useEffect, useState } from "react";
import { formatINR } from "@/lib/invoice";
import type { InvoiceData } from "@/lib/types";

type Result = {
  invoices: InvoiceData[];
  rejected: { id: string; name: string; reason: string }[];
  merged: Blob;
  zip: Blob;
};

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function GenerateButton({
  month,
  year,
  orderIds,
}: {
  month: number;
  year: number;
  orderIds: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  // Any change in selection/numbering invalidates generated files.
  useEffect(() => setResult(null), [month, year, orderIds.join(",")]);

  async function generate() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/generate-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year, orderIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      const invoices: InvoiceData[] = json.invoices;
      if (invoices.length === 0) throw new Error("None of the selected orders qualify for an invoice.");

      const [{ pdf }, { InvoiceDocument }, { default: JSZip }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./InvoicePDF"),
        import("jszip"),
      ]);
      const merged = await pdf(<InvoiceDocument invoices={invoices} draft />).toBlob();
      const zip = new JSZip();
      for (const inv of invoices) {
        zip.file(inv.fileName, await pdf(<InvoiceDocument invoices={[inv]} draft />).toBlob());
      }
      setResult({ invoices, rejected: json.rejected ?? [], merged, zip: await zip.generateAsync({ type: "blob" }) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const tag = `DRAFT-${year}-${String(month).padStart(2, "0")}`;
  const btn = "rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={generate}
          disabled={busy || orderIds.length === 0}
          className={`${btn} bg-green-700 text-white hover:bg-green-800`}
        >
          {busy ? "Generating…" : `Generate Draft Invoices (${orderIds.length})`}
        </button>
        <button
          onClick={() => result && download(result.merged, `KarCare-Invoices-${tag}.pdf`)}
          disabled={!result}
          className={`${btn} border border-slate-300 bg-white hover:bg-slate-50`}
        >
          Download PDF
        </button>
        <button
          onClick={() => result && download(result.zip, `KarCare-Invoices-${tag}.zip`)}
          disabled={!result}
          className={`${btn} border border-slate-300 bg-white hover:bg-slate-50`}
        >
          Download ZIP
        </button>
      </div>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {result && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
          <p className="font-medium text-green-800">
            {result.invoices.length} invoice(s): {result.invoices[0].number} → {result.invoices.at(-1)!.number}
            {" · "}Total ₹{formatINR(result.invoices.reduce((s, i) => s + i.total, 0))}
          </p>
          <p className="mt-1 text-xs text-green-700">
            Drafts only — numbers are provisional. Final invoices are created automatically when the month
            closes and appear in the Archive tab.
          </p>
          {result.rejected.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">
              {result.rejected.map((r) => (
                <li key={r.id}>
                  {r.name}: skipped ({r.reason})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
