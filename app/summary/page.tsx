"use client";

import { Suspense, useMemo, useState } from "react";
import { MonthPicker } from "@/components/MonthPicker";
import { BUCKET_LABEL, DeliveryBadge, InvoiceStatus, PaymentBadge } from "@/components/StatusBadge";
import { Alert, Card, EmptyState, inputCls, PageHeader, Spinner, Stat } from "@/components/ui";
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
const th = "px-4 py-2.5 text-left text-xs font-medium text-slate-500";
const td = "px-4 py-2.5";

function Summary() {
  const { month, year, setMonthYear, data, loading, error, reload } = useMonthOrders();
  const [payment, setPayment] = useState<"all" | "Prepaid" | "COD">("all");
  const [notInvoicedFilter, setNotInvoicedFilter] = useState<"all" | "pending_cod" | "other_month" | "skipped">("all");
  const orders = useMemo(() => data?.orders ?? [], [data]);
  const invoiceable = useMemo(
    () => orders.filter((o) => o.bucket === "invoiceable" && (payment === "all" || o.paymentType === payment)),
    [orders, payment],
  );
  const notInvoiced = orders.filter(
    (o) => o.bucket !== "invoiceable" && !o.isTest && (notInvoicedFilter === "all" || o.bucket === notInvoicedFilter),
  );
  const { states, codes, all } = useMemo(() => aggregate(invoiceable), [invoiceable]);

  return (
    <>
      <PageHeader title="GST Summary" subtitle={`Figures for GSTR-1 — ${monthLabel(month, year)}`}>
        <MonthPicker month={month} year={year} onChange={setMonthYear} onRefresh={reload} loading={loading} />
      </PageHeader>

      {error && <Alert>Couldn&apos;t load orders: {error}</Alert>}
      {loading && !data && (
        <Card>
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Spinner /> Loading…
          </div>
        </Card>
      )}

      {data && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "Prepaid", "COD"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPayment(p)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  payment === p ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {p === "all" ? "All payments" : p}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Invoices" value={all.count} />
            <Stat label="Taxable value" value={r(all.taxable)} />
            <Stat label="IGST" value={r(all.igst)} hint="other states" />
            <Stat label="CGST + SGST" value={r(all.cgst + all.sgst)} hint={`${r(all.cgst)} + ${r(all.sgst)} · Telangana`} />
            <Stat label="Invoice value" value={r(all.total)} tone="green" />
          </div>

          <Card title="State-wise (place of supply)" subtitle="GSTR-1 B2C, 18%" padded={false}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/70">
                  <tr>
                    <th className={th}>State</th>
                    <th className={th}>Code</th>
                    <th className={`${th} text-right`}>Invoices</th>
                    <th className={`${th} text-right`}>Taxable</th>
                    <th className={`${th} text-right`}>IGST</th>
                    <th className={`${th} text-right`}>CGST</th>
                    <th className={`${th} text-right`}>SGST</th>
                    <th className={`${th} text-right`}>Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {states.map((s) => (
                    <tr key={s.state + s.code} className="hover:bg-slate-50/60">
                      <td className={`${td} font-medium`}>{s.state}</td>
                      <td className={`${td} text-slate-500`}>{s.code}</td>
                      <td className={`${td} text-right`}>{s.count}</td>
                      <td className={`${td} text-right`}>{r(s.taxable)}</td>
                      <td className={`${td} text-right`}>{r(s.igst)}</td>
                      <td className={`${td} text-right`}>{r(s.cgst)}</td>
                      <td className={`${td} text-right`}>{r(s.sgst)}</td>
                      <td className={`${td} text-right font-medium`}>{r(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {states.length === 0 && <EmptyState>No invoiceable orders.</EmptyState>}
            </div>
          </Card>

          <Card title="HSN / SAC summary" subtitle="GSTR-1 Table 12" padded={false}>
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/70">
                <tr>
                  <th className={th}>HSN/SAC</th>
                  <th className={th}>Description</th>
                  <th className={`${th} text-right`}>Qty</th>
                  <th className={`${th} text-right`}>Taxable</th>
                  <th className={`${th} text-right`}>Tax</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {codes.map(([code, h]) => (
                  <tr key={code}>
                    <td className={`${td} font-medium`}>{code}</td>
                    <td className={`${td} text-slate-500`}>{code === "9965" ? "Shipping charges" : "Motor vehicle parts & accessories"}</td>
                    <td className={`${td} text-right`}>{h.qty}</td>
                    <td className={`${td} text-right`}>{r(h.taxable)}</td>
                    <td className={`${td} text-right`}>{r(h.tax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card
            title={`Not invoiced (${notInvoiced.length})`}
            subtitle="Orders from this month that don't get an invoice"
            padded={false}
            actions={
              <select
                className={inputCls}
                value={notInvoicedFilter}
                onChange={(e) => setNotInvoicedFilter(e.target.value as typeof notInvoicedFilter)}
              >
                <option value="all">All reasons</option>
                <option value="pending_cod">{BUCKET_LABEL.pending_cod}</option>
                <option value="other_month">{BUCKET_LABEL.other_month}</option>
                <option value="skipped">{BUCKET_LABEL.skipped}</option>
              </select>
            }
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/70">
                  <tr>
                    <th className={th}>Order</th>
                    <th className={th}>Date</th>
                    <th className={th}>Customer</th>
                    <th className={`${th} text-right`}>Amount</th>
                    <th className={th}>Payment</th>
                    <th className={th}>Delivery</th>
                    <th className={th}>Why</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {notInvoiced.map((o) => (
                    <tr key={o.id}>
                      <td className={`${td} font-medium`}>{o.name}</td>
                      <td className={`${td} whitespace-nowrap text-slate-600`}>{formatDateIST(o.createdAt)}</td>
                      <td className={td}>{o.address?.name ?? "—"}</td>
                      <td className={`${td} text-right tabular-nums`}>₹{formatINR(o.total)}</td>
                      <td className={td}>
                        <PaymentBadge type={o.paymentType} status={o.financialStatus} />
                      </td>
                      <td className={td}>
                        <DeliveryBadge delivery={o.delivery} />
                      </td>
                      <td className={td}>
                        <InvoiceStatus order={o} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {notInvoiced.length === 0 && <EmptyState>Nothing here.</EmptyState>}
            </div>
          </Card>
        </>
      )}
    </>
  );
}

export default function SummaryPage() {
  return (
    <Suspense>
      <Summary />
    </Suspense>
  );
}
