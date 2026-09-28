"use client";

import { useState } from "react";
import { formatDateIST } from "@/lib/dates";
import { formatINR } from "@/lib/invoice";
import type { Bucket, Order } from "@/lib/types";
import { DeliveryBadge, PaymentBadge } from "./StatusBadge";

const FILTERS: { key: "all" | Bucket; label: string }[] = [
  { key: "all", label: "All" },
  { key: "invoiceable", label: "Invoiceable" },
  { key: "pending_cod", label: "Pending COD" },
  { key: "other_month", label: "Other month" },
  { key: "skipped", label: "Skipped" },
];

export function OrdersTable({
  orders,
  selected,
  onToggle,
  onToggleAll,
}: {
  orders: Order[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
}) {
  const [filter, setFilter] = useState<"all" | Bucket>("all");
  const rows = filter === "all" ? orders : orders.filter((o) => o.bucket === filter);
  const invoiceable = orders.filter((o) => o.bucket === "invoiceable");
  const allChecked = invoiceable.length > 0 && invoiceable.every((o) => selected.has(o.id));

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 p-3">
        {FILTERS.map((f) => {
          const count = f.key === "all" ? orders.length : orders.filter((o) => o.bucket === f.key).length;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filter === f.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Date (IST)</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">City, State</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Payment</th>
              <th className="bg-slate-100 px-3 py-2 text-slate-700">Delivery Status</th>
              <th className="px-3 py-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={allChecked} onChange={(e) => onToggleAll(e.target.checked)} />
                  Invoice
                </label>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((o, i) => {
              const canInvoice = o.bucket === "invoiceable";
              return (
                <tr key={o.id} className={o.bucket === "skipped" ? "text-slate-400" : ""}>
                  <td className="px-3 py-3 text-slate-400">{i + 1}</td>
                  <td className="px-3 py-3 font-medium">{o.name}</td>
                  <td className="whitespace-nowrap px-3 py-3">{formatDateIST(o.createdAt)}</td>
                  <td className="px-3 py-3">{o.address?.name || <span className="text-slate-400">No address</span>}</td>
                  <td className="px-3 py-3">
                    {o.address ? [o.address.city, o.address.province].filter(Boolean).join(", ") : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">₹{formatINR(o.total)}</td>
                  <td className="px-3 py-3">
                    <PaymentBadge type={o.paymentType} status={o.financialStatus} />
                  </td>
                  <td className="bg-slate-50/60 px-3 py-3">
                    <DeliveryBadge delivery={o.delivery} />
                  </td>
                  <td className="px-3 py-3">
                    <label className="flex items-start gap-2" title={o.reason}>
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        disabled={!canInvoice}
                        checked={canInvoice && selected.has(o.id)}
                        onChange={() => onToggle(o.id)}
                      />
                      <span className={`text-xs ${canInvoice ? "text-slate-500" : "text-slate-400"}`}>{o.reason}</span>
                    </label>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-slate-400">
                  No orders in this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
