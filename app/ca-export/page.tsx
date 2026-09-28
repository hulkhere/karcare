"use client";

import { Suspense, useEffect, useState } from "react";
import { buildCaPackage, download, type CaFiles } from "@/components/caPackage";
import { LoadState } from "@/components/LoadState";
import { MonthPicker } from "@/components/MonthPicker";
import { Alert, btn, Card, PageHeader, Spinner, Stat } from "@/components/ui";
import { isMonthComplete, monthLabel, MONTH_NAMES } from "@/lib/dates";
import { totals } from "@/lib/export";
import { formatINR } from "@/lib/invoice";
import type { InvoiceData } from "@/lib/types";
import { useMonthData } from "@/lib/useMonthData";

function Rule({ ok, label, count, amount, detail }: { ok: boolean; label: string; count: number; amount?: number; detail?: string }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          ok ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
        }`}
      >
        {ok ? "✓" : "–"}
      </span>
      <div className="flex-1">
        <div className="text-sm text-slate-800">{label}</div>
        {detail && <div className="text-xs text-slate-400">{detail}</div>}
      </div>
      <div className="text-right">
        <div className={`text-sm font-semibold tabular-nums ${ok ? "text-emerald-700" : "text-slate-500"}`}>{count}</div>
        {amount !== undefined && <div className="text-xs tabular-nums text-slate-400">₹{formatINR(amount)}</div>}
      </div>
    </li>
  );
}

const sum = (list: InvoiceData[]) => list.reduce((s, i) => s + i.total, 0);

function CaExport() {
  const { month, year, setMonthYear, data, phase, progress, loading, error, refresh } = useMonthData({ defaultToPrevious: true });
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [genError, setGenError] = useState<string | null>(null);
  const [files, setFiles] = useState<CaFiles | null>(null);

  useEffect(() => {
    setFiles(null);
    setGenError(null);
  }, [month, year, data?.syncedAt]);

  const invoices = data?.invoices ?? [];
  const orders = data?.orders ?? [];
  const prepaid = invoices.filter((i) => i.kind === "sale" && i.paymentType === "Prepaid");
  const cod = invoices.filter((i) => i.kind === "sale" && i.paymentType === "COD");
  const forfeits = invoices.filter((i) => i.kind === "forfeit");
  const t = totals(invoices);
  const complete = isMonthComplete(month, year);
  const next = month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };

  async function prepare() {
    setBusy(true);
    setGenError(null);
    try {
      const f = await buildCaPackage(invoices, month, year, setStep);
      setFiles(f);
      download(f.packageZip, f.names.packageZip);
    } catch (e) {
      setGenError((e as Error).message);
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  return (
    <>
      <PageHeader
        title="CA Export"
        subtitle="Pick a month. The standard GST rules are applied automatically and you get one ZIP to send to your CA."
      >
        <MonthPicker month={month} year={year} onChange={setMonthYear} onRefresh={refresh} loading={loading} />
      </PageHeader>

      <LoadState phase={phase} progress={progress} error={error} month={month} year={year} onRetry={refresh} hasData={!!data} />

      {data && !complete && (
        <Alert tone="amber">
          <strong>{monthLabel(month, year)} isn&apos;t over yet.</strong> This shows invoices up to now. For the final
          export, come back after 1 {MONTH_NAMES[next.month - 1]} (a couple of days later is safest, so courier updates
          for the last days are in).
        </Alert>
      )}

      {data && (
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3" title="Standard rules (applied automatically)" subtitle="An invoice is created on the day money is received">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Invoiced this month</div>
            <ul className="divide-y divide-slate-100">
              <Rule ok label="Prepaid orders" count={prepaid.length} amount={sum(prepaid)} detail="Dated the order date, whatever the delivery status" />
              <Rule ok label="COD orders delivered" count={cod.length} amount={sum(cod)} detail="Dated the delivery date · full order amount, incl. the ₹99 advance" />
              <Rule ok label="COD cancelled / returned (RTO)" count={forfeits.length} amount={sum(forfeits)} detail="Dated the day it was cancelled or returned · only the non-refundable advance kept" />
            </ul>
            <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Not invoiced this month</div>
            <ul className="divide-y divide-slate-100">
              <Rule ok={false} label="COD still on the way" count={orders.filter((o) => o.bucket === "pending_cod").length} detail="Invoiced later — when delivered or returned" />
              <Rule ok={false} label="Paid in another month" count={orders.filter((o) => o.bucket === "other_month").length} detail="Placed this month, but delivered / returned next month" />
              <Rule ok={false} label="No invoice at all" count={orders.filter((o) => o.bucket === "skipped").length} detail="Test orders, prepaid cancelled & refunded in the same month, nothing received" />
            </ul>
          </Card>

          <Card className="lg:col-span-2" title="Export">
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-xs font-medium text-slate-500">Invoices</div>
                <div className="text-3xl font-semibold tabular-nums text-slate-900">{invoices.length}</div>
                {invoices.length > 0 ? (
                  <div className="mt-1 font-mono text-xs text-slate-600">
                    {invoices[0].number} → {invoices.at(-1)!.number}
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-slate-500">No invoices this month</div>
                )}
                <div className="mt-1 text-xs text-slate-500">
                  ₹{formatINR(t.total)} incl. ₹{formatINR(t.tax)} GST
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Numbers are automatic and continue from the previous month without gaps (restarting at 0001 each April).
                They can&apos;t be edited.
              </p>

              <button onClick={prepare} disabled={busy || loading} className={`${btn.big} w-full`}>
                {busy ? (
                  <>
                    <Spinner /> Preparing…
                  </>
                ) : (
                  "Download CA package"
                )}
              </button>
              {busy && <p className="text-center text-xs text-slate-500">{step}</p>}
              {genError && <Alert>{genError}</Alert>}
              {files && (
                <div className="flex flex-wrap gap-2">
                  <button className={btn.secondary} onClick={() => download(files.packageZip, files.names.packageZip)}>
                    ZIP again
                  </button>
                  {invoices.length > 0 && (
                    <button className={btn.secondary} onClick={() => download(files.mergedPdf, files.names.mergedPdf)}>
                      All invoices (PDF)
                    </button>
                  )}
                  <button className={btn.secondary} onClick={() => download(files.registerCsv, files.names.registerCsv)}>
                    Register (CSV)
                  </button>
                </div>
              )}
              <p className="text-xs text-slate-400">
                The ZIP has all invoices in one PDF, each invoice as its own PDF, the invoice register, state-wise summary
                and HSN summary (CSV, opens in Excel).
              </p>
            </div>
          </Card>
        </div>
      )}

      {data && invoices.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Taxable value" value={`₹${formatINR(t.taxable)}`} />
          <Stat label="IGST" value={`₹${formatINR(t.igst)}`} hint="other states" />
          <Stat label="CGST" value={`₹${formatINR(t.cgst)}`} hint="Telangana" />
          <Stat label="SGST" value={`₹${formatINR(t.sgst)}`} hint="Telangana" />
          <Stat label="Invoice value" value={`₹${formatINR(t.total)}`} tone="green" />
        </div>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <CaExport />
    </Suspense>
  );
}
