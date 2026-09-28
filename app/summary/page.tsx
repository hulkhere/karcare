"use client";

import { Suspense, useMemo } from "react";
import { MonthPicker } from "@/components/MonthPicker";
import { DeliveryBadge, PaymentBadge } from "@/components/StatusBadge";
import { formatDateIST, monthLabel } from "@/lib/dates";
import { fromPaise, isIntraState, splitCgstSgst, stateCodeFor, toPaise } from "@/lib/gst";
import { formatINR } from "@/lib/invoice";
import { computeAmounts } from "@/lib/orders";
import type { Order } from "@/lib/types";
import { useMonthOrders } from "@/lib/useMonthOrders";

type Agg = { count: number; taxable: number; igst: number; cgst: number; sgst: number; total: number };
const empty = (): Agg => ({ count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 });

function aggregate(orders: Order[]) {
  const byState = new Map<string, Agg & { state: string; code: string }>();
  const byCode = new Map<string, { qty: number; taxable: number; tax: number }>();
  const all = empty();

  for (const o of orders) {
    const { lines, totalPaise, taxablePaise, taxPaise } = computeAmounts(o);
    const intra = isIntraState(o.address?.provinceCode);
    const { cgst, sgst } = intra ? splitCgstSgst(taxPaise) : { cgst: 0, sgst: 0 };
    const igst = intra ? 0 : taxPaise;

    const key = o.address?.provinceCode || "—";
    const s = byState.get(key) ?? { ...empty(), state: o.address?.province || "Unknown", code: stateCodeFor(key) ?? "—" };
    for (const target of [s, all]) {
      target.count++;
      target.taxable += taxablePaise;
      target.igst += igst;
      target.cgst += cgst;
      target.sgst += sgst;
      target.total += totalPaise;
    }
    byState.set(key, s);

    // HSN/SAC summary: tax per line pro-rated from the line's taxable value
    for (const l of lines) {
      const h = byCode.get(l.code) ?? { qty: 0, taxable: 0, tax: 0 };
      const lineTaxable = toPaise(l.taxable);
      h.qty += l.quantity;
      h.taxable += lineTaxable;
      h.tax += taxablePaise ? Math.round((taxPaise * lineTaxable) / taxablePaise) : 0;
      byCode.set(l.code, h);
    }
  }
  return {
    states: [...byState.values()].sort((a, b) => b.total - a.total),
    codes: [...byCode.entries()],
    all,
  };
}

const r = (paise: number) => `₹${formatINR(fromPaise(paise))}`;
const th = "px-3 py-2 text-left text-xs uppercase tracking-wide text-slate-500";
const td = "px-3 py-2";

function Summary() {
  const { month, year, setMonthYear, data, loading, error, fetchOrders } = useMonthOrders();
  const orders = useMemo(() => data?.orders ?? [], [data]);
  const invoiceable = orders.filter((o) => o.bucket === "invoiceable");
  const notInvoiced = orders.filter((o) => o.bucket !== "invoiceable" && !o.isTest);
  const { states, codes, all } = useMemo(() => aggregate(invoiceable), [invoiceable]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-end gap-3">
        <MonthPicker month={month} year={year} onChange={setMonthYear} />
        <button
          onClick={fetchOrders}
          disabled={loading}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? "Fetching…" : "Fetch Orders"}
        </button>
        {data && <span className="text-sm text-slate-500">GST summary for {monthLabel(data.month, data.year)}</span>}
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ["Invoiced orders", String(all.count)],
              ["Taxable value", r(all.taxable)],
              ["IGST", r(all.igst)],
              ["CGST + SGST", `${r(all.cgst)} + ${r(all.sgst)}`],
              ["Invoice value", r(all.total)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">{k}</div>
                <div className="mt-1 text-lg font-semibold">{v}</div>
              </div>
            ))}
          </div>

          <section className="rounded-xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-200 px-4 py-3 font-medium">State-wise (Place of Supply) — GSTR-1 B2C</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={th}>State</th>
                    <th className={th}>Code</th>
                    <th className={`${th} text-right`}>Orders</th>
                    <th className={`${th} text-right`}>Taxable</th>
                    <th className={`${th} text-right`}>IGST</th>
                    <th className={`${th} text-right`}>CGST</th>
                    <th className={`${th} text-right`}>SGST</th>
                    <th className={`${th} text-right`}>Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {states.map((s) => (
                    <tr key={s.state + s.code}>
                      <td className={td}>{s.state}</td>
                      <td className={td}>{s.code}</td>
                      <td className={`${td} text-right`}>{s.count}</td>
                      <td className={`${td} text-right`}>{r(s.taxable)}</td>
                      <td className={`${td} text-right`}>{r(s.igst)}</td>
                      <td className={`${td} text-right`}>{r(s.cgst)}</td>
                      <td className={`${td} text-right`}>{r(s.sgst)}</td>
                      <td className={`${td} text-right`}>{r(s.total)}</td>
                    </tr>
                  ))}
                  {states.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                        No invoiceable orders.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-200 px-4 py-3 font-medium">HSN / SAC summary (18%)</h2>
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>HSN/SAC</th>
                  <th className={`${th} text-right`}>Qty</th>
                  <th className={`${th} text-right`}>Taxable</th>
                  <th className={`${th} text-right`}>Tax</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {codes.map(([code, h]) => (
                  <tr key={code}>
                    <td className={td}>{code}</td>
                    <td className={`${td} text-right`}>{h.qty}</td>
                    <td className={`${td} text-right`}>{r(h.taxable)}</td>
                    <td className={`${td} text-right`}>{r(h.tax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-200 px-4 py-3 font-medium">Not invoiced ({notInvoiced.length})</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={th}>Order</th>
                    <th className={th}>Date</th>
                    <th className={th}>Customer</th>
                    <th className={`${th} text-right`}>Amount</th>
                    <th className={th}>Payment</th>
                    <th className={th}>Delivery</th>
                    <th className={th}>Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {notInvoiced.map((o) => (
                    <tr key={o.id}>
                      <td className={`${td} font-medium`}>{o.name}</td>
                      <td className={`${td} whitespace-nowrap`}>{formatDateIST(o.createdAt)}</td>
                      <td className={td}>{o.address?.name ?? "—"}</td>
                      <td className={`${td} text-right tabular-nums`}>₹{formatINR(o.total)}</td>
                      <td className={td}>
                        <PaymentBadge type={o.paymentType} status={o.financialStatus} />
                      </td>
                      <td className={td}>
                        <DeliveryBadge delivery={o.delivery} />
                      </td>
                      <td className={`${td} text-xs text-slate-500`}>{o.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export default function SummaryPage() {
  return (
    <Suspense>
      <Summary />
    </Suspense>
  );
}
