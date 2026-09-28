"use client";

import { Suspense, useMemo, useState } from "react";
import { MonthPicker } from "@/components/MonthPicker";
import { OrdersTable } from "@/components/OrdersTable";
import { BUCKET_LABEL, deliveryLabel } from "@/components/StatusBadge";
import { Alert, Card, inputCls, PageHeader, Select, Spinner, Stat } from "@/components/ui";
import { monthLabel } from "@/lib/dates";
import { formatINR } from "@/lib/invoice";
import type { Bucket } from "@/lib/types";
import { useMonthOrders } from "@/lib/useMonthOrders";

const DELIVERY_ORDER = ["DELIVERED", "OUT_FOR_DELIVERY", "IN_TRANSIT", "ATTEMPTED_DELIVERY", "FAILURE", "CONFIRMED", "NONE"];
const DOT: Record<string, string> = {
  DELIVERED: "bg-emerald-500",
  OUT_FOR_DELIVERY: "bg-orange-500",
  IN_TRANSIT: "bg-yellow-400",
  ATTEMPTED_DELIVERY: "bg-rose-500",
  FAILURE: "bg-rose-500",
  CONFIRMED: "bg-slate-400",
  NONE: "bg-slate-300",
};

function Orders() {
  const { month, year, setMonthYear, data, loading, error, reload } = useMonthOrders();
  const [search, setSearch] = useState("");
  const [payment, setPayment] = useState<"all" | "Prepaid" | "COD">("all");
  const [delivery, setDelivery] = useState("all");
  const [state, setState] = useState("all");
  const [bucket, setBucket] = useState<"all" | Bucket>("all");

  const orders = useMemo(() => data?.orders ?? [], [data]);
  const real = orders.filter((o) => !o.isTest);
  const invoiceable = orders.filter((o) => o.bucket === "invoiceable");

  const deliveryCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const o of real) c.set(o.delivery.status ?? "NONE", (c.get(o.delivery.status ?? "NONE") ?? 0) + 1);
    return [...c].sort((a, b) => {
      const ia = DELIVERY_ORDER.indexOf(a[0]), ib = DELIVERY_ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [real]);

  const states = useMemo(
    () => [...new Set(orders.map((o) => o.address?.province).filter(Boolean) as string[])].sort(),
    [orders],
  );

  const filtered = orders.filter((o) => {
    if (payment !== "all" && o.paymentType !== payment) return false;
    if (delivery !== "all" && (o.delivery.status ?? "NONE") !== delivery) return false;
    if (state !== "all" && o.address?.province !== state) return false;
    if (bucket !== "all" && o.bucket !== bucket) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${o.name} ${o.address?.name ?? ""} ${o.address?.city ?? ""} ${o.delivery.tracking?.number ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const filtersOn = payment !== "all" || delivery !== "all" || state !== "all" || bucket !== "all" || search !== "";

  return (
    <>
      <PageHeader title="Orders" subtitle="Delivery status of every order, and whether it gets an invoice this month.">
        <MonthPicker month={month} year={year} onChange={setMonthYear} onRefresh={reload} loading={loading} />
      </PageHeader>

      {error && <Alert>Couldn&apos;t load orders: {error}</Alert>}
      {loading && !data && (
        <Card>
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Spinner /> Loading {monthLabel(month, year)} from Shopify…
          </div>
        </Card>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Orders" value={real.length} hint={monthLabel(month, year)} />
            <Stat label="Invoiceable" value={invoiceable.length} tone="green" hint="prepaid + COD delivered" />
            <Stat label="COD awaiting delivery" value={orders.filter((o) => o.bucket === "pending_cod").length} tone="amber" />
            <Stat label="Invoice value" value={`₹${formatINR(invoiceable.reduce((s, o) => s + o.total, 0))}`} />
            <Stat label="GST" value={`₹${formatINR(invoiceable.reduce((s, o) => s + o.tax, 0))}`} />
          </div>

          <Card title="Delivery status" subtitle="Click a status to filter the table">
            <div className="flex flex-wrap gap-2">
              {deliveryCounts.map(([status, count]) => (
                <button
                  key={status}
                  onClick={() => setDelivery(delivery === status ? "all" : status)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                    delivery === status
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${DOT[status] ?? "bg-slate-400"}`} />
                  {deliveryLabel(status === "NONE" ? null : status)}
                  <span className="font-semibold tabular-nums">{count}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card padded={false}>
            <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
              <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-slate-500">
                Search
                <input
                  className={inputCls}
                  placeholder="Order #, customer, city, AWB…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <Select
                label="Invoice"
                value={bucket}
                onChange={setBucket}
                options={[
                  { value: "all", label: "All" },
                  ...(Object.keys(BUCKET_LABEL) as Bucket[]).map((b) => ({ value: b, label: BUCKET_LABEL[b] })),
                ]}
              />
              <Select
                label="Payment"
                value={payment}
                onChange={setPayment}
                options={[
                  { value: "all", label: "All" },
                  { value: "Prepaid", label: "Prepaid" },
                  { value: "COD", label: "COD" },
                ]}
              />
              <Select
                label="Delivery"
                value={delivery}
                onChange={setDelivery}
                options={[
                  { value: "all", label: "All" },
                  ...deliveryCounts.map(([s]) => ({ value: s, label: deliveryLabel(s === "NONE" ? null : s) })),
                ]}
              />
              <Select
                label="State"
                value={state}
                onChange={setState}
                options={[{ value: "all", label: "All states" }, ...states.map((s) => ({ value: s, label: s }))]}
              />
              {filtersOn && (
                <button
                  className="h-9 px-2 text-sm text-slate-500 underline hover:text-slate-800"
                  onClick={() => {
                    setSearch("");
                    setPayment("all");
                    setDelivery("all");
                    setState("all");
                    setBucket("all");
                  }}
                >
                  Clear
                </button>
              )}
              <span className="ml-auto self-center text-xs text-slate-400">
                {filtered.length} of {orders.length} orders
              </span>
            </div>
            <OrdersTable orders={filtered} />
          </Card>
        </>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Orders />
    </Suspense>
  );
}
