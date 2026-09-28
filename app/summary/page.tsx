"use client";

import { Suspense, useMemo, useState } from "react";
import { LoadState } from "@/components/LoadState";
import { MonthPicker } from "@/components/MonthPicker";
import { BUCKET_LABEL, DeliveryBadge, InvoiceStatus, PaymentBadge } from "@/components/StatusBadge";
import { Card, EmptyState, inputCls, PageHeader, Stat } from "@/components/ui";
import { formatDateIST, monthLabel } from "@/lib/dates";
import { hsnRows, stateRows, totals } from "@/lib/export";
import { formatINR } from "@/lib/invoice";
import { useMonthData } from "@/lib/useMonthData";

const r = (n: number) => `₹${formatINR(n)}`;
const th = "px-4 py-2.5 text-left text-xs font-medium text-slate-500";
const td = "px-4 py-2.5";

type Kind = "all" | "Prepaid" | "COD" | "forfeit";
const KINDS: { value: Kind; label: string }[] = [
  { value: "all", label: "All invoices" },
  { value: "Prepaid", label: "Prepaid" },
  { value: "COD", label: "COD delivered" },
  { value: "forfeit", label: "Advances retained" },
];

function Summary() {
  const { month, year, setMonthYear, data, phase, progress, loading, error, refresh } = useMonthData();
  const [kind, setKind] = useState<Kind>("all");
  const [why, setWhy] = useState<"all" | "pending_cod" | "other_month" | "skipped">("all");

  const invoices = useMemo(
    () =>
      (data?.invoices ?? []).filter((i) =>
        kind === "all" ? true : kind === "forfeit" ? i.kind === "forfeit" : i.kind === "sale" && i.paymentType === kind,
      ),
    [data, kind],
  );
  const t = totals(invoices);
  const states = useMemo(() => stateRows(invoices), [invoices]);
  const codes = useMemo(() => hsnRows(invoices), [invoices]);
  const notInvoiced = (data?.orders ?? []).filter(
    (o) => o.bucket !== "invoiceable" && !o.isTest && (why === "all" || o.bucket === why),
  );

  return (
    <>
      <PageHeader title="GST Summary" subtitle={`Figures for GSTR-1 — ${monthLabel(month, year)}`}>
        <MonthPicker month={month} year={year} onChange={setMonthYear} onRefresh={refresh} loading={loading} />
      </PageHeader>

      <LoadState phase={phase} progress={progress} error={error} month={month} year={year} onRetry={refresh} hasData={!!data} />

      {data && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {KINDS.map((k) => (
              <button
                key={k.value}
                onClick={() => setKind(k.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  kind === k.value ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Invoices" value={t.count} />
            <Stat label="Taxable value" value={r(t.taxable)} />
            <Stat label="IGST" value={r(t.igst)} hint="other states" />
            <Stat label="CGST + SGST" value={r(t.cgst + t.sgst)} hint={`${r(t.cgst)} + ${r(t.sgst)} · Telangana`} />
            <Stat label="Invoice value" value={r(t.total)} tone="green" />
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
              {states.length === 0 && <EmptyState>No invoices.</EmptyState>}
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
                {codes.map((h) => (
                  <tr key={h.code}>
                    <td className={`${td} font-medium`}>{h.code}</td>
                    <td className={`${td} text-slate-500`}>{h.description}</td>
                    <td className={`${td} text-right`}>{h.qty}</td>
                    <td className={`${td} text-right`}>{r(h.taxable)}</td>
                    <td className={`${td} text-right`}>{r(h.tax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card
            title={`Not invoiced this month (${notInvoiced.length})`}
            padded={false}
            actions={
              <select className={inputCls} value={why} onChange={(e) => setWhy(e.target.value as typeof why)}>
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
                    <th className={th}>Placed</th>
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
