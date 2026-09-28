"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { GenerateButton } from "@/components/GenerateButton";
import { MonthPicker } from "@/components/MonthPicker";
import { OrdersTable } from "@/components/OrdersTable";
import { SummaryCards } from "@/components/SummaryCards";
import { monthLabel } from "@/lib/dates";
import { useMonthOrders } from "@/lib/useMonthOrders";

function Dashboard() {
  const { month, year, setMonthYear, data, loading, error, fetchOrders } = useMonthOrders();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const orders = useMemo(() => data?.orders ?? [], [data]);
  const invoiceableIds = useMemo(() => orders.filter((o) => o.bucket === "invoiceable").map((o) => o.id), [orders]);

  // Auto-check every qualifying order whenever new data arrives.
  useEffect(() => setSelected(new Set(invoiceableIds)), [invoiceableIds]);

  // Selected IDs in table order (the server assigns numbers by invoice date).
  const selectedIds = invoiceableIds.filter((id) => selected.has(id));

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
        {data && (
          <span className="text-sm text-slate-500">
            Showing {monthLabel(data.month, data.year)} ·{" "}
            <Link href={`/summary?month=${data.month}&year=${data.year}`} className="underline">
              GST summary
            </Link>
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <strong>Couldn&apos;t load orders:</strong> {error}
        </div>
      )}

      {data && (
        <>
          <SummaryCards orders={orders} />
          {orders.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">
              No orders found for {monthLabel(data.month, data.year)}.
            </div>
          ) : (
            <OrdersTable
              orders={orders}
              selected={selected}
              onToggle={(id) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onToggleAll={(checked) => setSelected(checked ? new Set(invoiceableIds) : new Set())}
            />
          )}
          {data.archive ? (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
              <strong>{monthLabel(data.month, data.year)} is closed.</strong>{" "}
              {data.archive.count > 0
                ? `${data.archive.count} final invoice(s): ${data.archive.firstInvoice} → ${data.archive.lastInvoice}.`
                : "No invoices this month."}{" "}
              <Link href="/archive" className="font-medium underline">
                Download from Archive
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <GenerateButton month={data.month} year={data.year} orderIds={selectedIds} />
            </div>
          )}
        </>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}
