"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { buildCaPackage, download, type CaFiles } from "@/components/caPackage";
import { MonthPicker } from "@/components/MonthPicker";
import { Alert, btn, Card, inputCls, PageHeader, Spinner, Stat } from "@/components/ui";
import { formatDateIST, isMonthComplete, monthLabel } from "@/lib/dates";
import { historyList, saveExport, suggestStart, type ExportRecord } from "@/lib/history";
import { formatINR } from "@/lib/invoice";
import type { InvoiceData, Order } from "@/lib/types";
import { useMonthOrders } from "@/lib/useMonthOrders";

function Rule({ ok, label, count, detail }: { ok: boolean; label: string; count: number; detail?: string }) {
  return (
    <li className="flex items-start gap-3 py-2">
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
      <span className={`text-sm font-semibold tabular-nums ${ok ? "text-emerald-700" : "text-slate-500"}`}>{count}</span>
    </li>
  );
}

function countSkipped(orders: Order[], reason: RegExp) {
  return orders.filter((o) => o.bucket === "skipped" && reason.test(o.reason)).length;
}

function CaExport() {
  const { month, year, setMonthYear, data, loading, error, reload } = useMonthOrders({ defaultToPrevious: true });
  const [startNumber, setStartNumber] = useState(1);
  const [suggestion, setSuggestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [genError, setGenError] = useState<string | null>(null);
  const [result, setResult] = useState<{ invoices: InvoiceData[]; files: CaFiles } | null>(null);
  const [history, setHistory] = useState<ExportRecord[]>([]);

  useEffect(() => {
    const s = suggestStart(month, year);
    setStartNumber(s.number);
    setSuggestion(s.reason);
    setResult(null);
    setGenError(null);
    setHistory(historyList());
  }, [month, year]);

  const orders = useMemo(() => data?.orders ?? [], [data]);
  const included = orders.filter((o) => o.bucket === "invoiceable");
  const prepaid = included.filter((o) => o.paymentType === "Prepaid").length;
  const cod = included.length - prepaid;
  const complete = isMonthComplete(month, year);

  async function prepare() {
    setBusy(true);
    setGenError(null);
    setResult(null);
    try {
      setProgress("Fetching orders and applying filters…");
      const res = await fetch("/api/generate-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year, startNumber }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      const invoices: InvoiceData[] = json.invoices;
      const files = await buildCaPackage(invoices, month, year, setProgress);
      setResult({ invoices, files });
      if (complete) {
        saveExport({
          month,
          year,
          first: startNumber,
          last: startNumber + invoices.length - 1,
          count: invoices.length,
          exportedAt: new Date().toISOString(),
        });
        setHistory(historyList());
      }
      download(files.packageZip, files.names.packageZip);
    } catch (e) {
      setGenError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  const totals = result && {
    taxable: result.invoices.reduce((s, i) => s + i.taxable, 0),
    igst: result.invoices.reduce((s, i) => s + i.igst, 0),
    cgst: result.invoices.reduce((s, i) => s + i.cgst, 0),
    sgst: result.invoices.reduce((s, i) => s + i.sgst, 0),
    total: result.invoices.reduce((s, i) => s + i.total, 0),
  };

  return (
    <>
      <PageHeader
        title="CA Export"
        subtitle="Pick a month. The standard GST filters are applied automatically and you get one ZIP to send to your CA."
      >
        <MonthPicker month={month} year={year} onChange={setMonthYear} onRefresh={reload} loading={loading} />
      </PageHeader>

      {error && <Alert>Couldn&apos;t load orders: {error}</Alert>}
      {!complete && (
        <Alert tone="amber">
          <strong>{monthLabel(month, year)} isn&apos;t over yet.</strong> You can preview, but export after the month ends
          so late deliveries are included and invoice numbers don&apos;t change.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card
          className="lg:col-span-3"
          title="Standard filters (applied automatically)"
          subtitle={`What goes into the ${monthLabel(month, year)} invoices`}
        >
          {loading && !data ? (
            <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
              <Spinner /> Loading orders…
            </div>
          ) : (
            <>
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Included</div>
              <ul className="divide-y divide-slate-100">
                <Rule ok label="Prepaid orders placed this month" count={prepaid} detail="Invoiced on the order date, whatever the delivery status" />
                <Rule ok label="COD orders delivered this month" count={cod} detail="Invoiced on the delivery date, full order amount" />
              </ul>
              <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Left out</div>
              <ul className="divide-y divide-slate-100">
                <Rule ok={false} label="COD not delivered yet" count={orders.filter((o) => o.bucket === "pending_cod").length} detail="In transit, RTO, attempted, not shipped" />
                <Rule ok={false} label="COD delivered in another month" count={orders.filter((o) => o.bucket === "other_month").length} detail="Goes into the month it was delivered" />
                <Rule ok={false} label="Cancelled, refunded or voided" count={countSkipped(orders, /Cancelled|Refunded|Voided/)} />
                <Rule ok={false} label="Test orders" count={countSkipped(orders, /Test/)} detail="Under ₹50 or tagged “test”" />
              </ul>
            </>
          )}
        </Card>

        <Card className="lg:col-span-2" title="Export">
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-xs font-medium text-slate-500">Invoices to create</div>
              <div className="text-3xl font-semibold tabular-nums text-slate-900">{data ? included.length : "—"}</div>
              <div className="text-xs text-slate-500">
                ₹{formatINR(included.reduce((s, o) => s + o.total, 0))} incl. ₹
                {formatINR(included.reduce((s, o) => s + o.tax, 0))} GST
              </div>
            </div>

            <label className="block text-xs font-medium text-slate-500">
              First invoice number
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={startNumber}
                  onChange={(e) => setStartNumber(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                  className={`${inputCls} w-28`}
                />
                {data && included.length > 0 && (
                  <span className="text-xs text-slate-500">
                    → numbers {startNumber} to {startNumber + included.length - 1}
                  </span>
                )}
              </div>
              <span className="mt-1 block text-xs font-normal text-slate-400">{suggestion}</span>
            </label>

            <button onClick={prepare} disabled={busy || !data || loading} className={`${btn.big} w-full`}>
              {busy ? (
                <>
                  <Spinner /> Preparing…
                </>
              ) : (
                "Download CA package"
              )}
            </button>
            {busy && <p className="text-center text-xs text-slate-500">{progress}</p>}
            {genError && <Alert>{genError}</Alert>}
            <p className="text-xs text-slate-400">
              The ZIP has: all invoices in one PDF, each invoice as its own PDF, invoice register, state-wise summary and
              HSN summary (CSV, opens in Excel).
            </p>
          </div>
        </Card>
      </div>

      {result && totals && (
        <Card
          title={`Ready: ${monthLabel(month, year)}`}
          subtitle={
            result.invoices.length
              ? `${result.invoices.length} invoices · ${result.invoices[0].number} → ${result.invoices.at(-1)!.number}`
              : "No invoices this month"
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <button className={btn.primary} onClick={() => download(result.files.packageZip, result.files.names.packageZip)}>
                CA package (ZIP)
              </button>
              {result.invoices.length > 0 && (
                <button className={btn.secondary} onClick={() => download(result.files.mergedPdf, result.files.names.mergedPdf)}>
                  All invoices (PDF)
                </button>
              )}
              <button className={btn.secondary} onClick={() => download(result.files.registerCsv, result.files.names.registerCsv)}>
                Register (CSV)
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Taxable value" value={`₹${formatINR(totals.taxable)}`} />
            <Stat label="IGST" value={`₹${formatINR(totals.igst)}`} />
            <Stat label="CGST" value={`₹${formatINR(totals.cgst)}`} />
            <Stat label="SGST" value={`₹${formatINR(totals.sgst)}`} />
            <Stat label="Invoice value" value={`₹${formatINR(totals.total)}`} tone="green" />
          </div>
          {complete && result.invoices.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              Next month will start from <strong>{startNumber + result.invoices.length}</strong> (remembered in this
              browser).
            </p>
          )}
        </Card>
      )}

      {history.length > 0 && (
        <Card title="Previous exports" subtitle="Saved in this browser" padded={false}>
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-left text-xs text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">Month</th>
                <th className="px-5 py-2 font-medium">Invoices</th>
                <th className="px-5 py-2 font-medium">Numbers</th>
                <th className="px-5 py-2 font-medium">Exported</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((h) => (
                <tr key={`${h.year}-${h.month}`}>
                  <td className="px-5 py-2.5 font-medium">{monthLabel(h.month, h.year)}</td>
                  <td className="px-5 py-2.5 tabular-nums">{h.count}</td>
                  <td className="px-5 py-2.5 tabular-nums text-slate-600">{h.count ? `${h.first} – ${h.last}` : "—"}</td>
                  <td className="px-5 py-2.5 text-slate-500">{formatDateIST(h.exportedAt)}</td>
                  <td className="px-5 py-2.5 text-right">
                    <button className="text-xs text-slate-600 underline hover:text-slate-900" onClick={() => setMonthYear(h.month, h.year)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
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
