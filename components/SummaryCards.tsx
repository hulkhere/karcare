import { formatINR } from "@/lib/invoice";
import type { Order } from "@/lib/types";

export function SummaryCards({ orders }: { orders: Order[] }) {
  const invoiceable = orders.filter((o) => o.bucket === "invoiceable");
  const cards = [
    { label: "Total Orders", value: String(orders.filter((o) => !o.isTest).length) },
    { label: "Invoiceable", value: String(invoiceable.length), accent: "text-green-700" },
    { label: "Pending COD", value: String(orders.filter((o) => o.bucket === "pending_cod").length), accent: "text-amber-700" },
    { label: "Revenue (invoiceable)", value: `₹${formatINR(invoiceable.reduce((s, o) => s + o.total, 0))}` },
    { label: "GST (invoiceable)", value: `₹${formatINR(invoiceable.reduce((s, o) => s + o.tax, 0))}` },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">{c.label}</div>
          <div className={`mt-1 text-2xl font-semibold ${c.accent ?? ""}`}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}
