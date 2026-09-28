import { formatDateIST } from "@/lib/dates";
import { formatINR } from "@/lib/invoice";
import type { Order } from "@/lib/types";
import { DeliveryBadge, InvoiceStatus, PaymentBadge } from "./StatusBadge";
import { EmptyState } from "./ui";

const th = "px-4 py-2.5 text-left text-xs font-medium text-slate-500";

export function OrdersTable({ orders }: { orders: Order[] }) {
  if (orders.length === 0) return <EmptyState>No orders match these filters.</EmptyState>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-100 bg-slate-50/70">
          <tr>
            <th className={th}>Order</th>
            <th className={th}>Placed (IST)</th>
            <th className={th}>Customer</th>
            <th className={th}>Location</th>
            <th className={`${th} text-right`}>Amount</th>
            <th className={th}>Payment</th>
            <th className={`${th} bg-slate-100/70 text-slate-700`}>Delivery status</th>
            <th className={th}>Invoice</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {orders.map((o) => (
            <tr key={o.id} className={`hover:bg-slate-50/60 ${o.bucket === "skipped" ? "opacity-60" : ""}`}>
              <td className="px-4 py-3 font-medium text-slate-900">{o.name}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateIST(o.createdAt)}</td>
              <td className="px-4 py-3">{o.address?.name || <span className="text-slate-400">—</span>}</td>
              <td className="px-4 py-3 text-slate-600">
                {o.address ? (
                  <>
                    <div>{o.address.city}</div>
                    <div className="text-xs text-slate-400">{o.address.province}</div>
                  </>
                ) : (
                  "—"
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">₹{formatINR(o.total)}</td>
              <td className="px-4 py-3">
                <PaymentBadge type={o.paymentType} status={o.financialStatus} />
              </td>
              <td className="bg-slate-50/50 px-4 py-3">
                <DeliveryBadge delivery={o.delivery} />
              </td>
              <td className="px-4 py-3">
                <InvoiceStatus order={o} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
