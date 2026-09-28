import { formatDateIST } from "@/lib/dates";
import type { Bucket, Delivery, Order, PaymentType } from "@/lib/types";

const STYLES: Record<string, { cls: string; dot: string; label?: string }> = {
  DELIVERED: { cls: "bg-green-100 text-green-800 ring-green-300", dot: "bg-green-500" },
  IN_TRANSIT: { cls: "bg-yellow-100 text-yellow-800 ring-yellow-300", dot: "bg-yellow-500" },
  OUT_FOR_DELIVERY: { cls: "bg-orange-100 text-orange-800 ring-orange-300", dot: "bg-orange-500" },
  ATTEMPTED_DELIVERY: { cls: "bg-red-100 text-red-800 ring-red-300", dot: "bg-red-500" },
  FAILURE: { cls: "bg-red-100 text-red-800 ring-red-300", dot: "bg-red-500" },
  NOT_DELIVERED: { cls: "bg-red-100 text-red-800 ring-red-300", dot: "bg-red-500", label: "Not delivered (RTO)" },
  CONFIRMED: { cls: "bg-slate-100 text-slate-700 ring-slate-300", dot: "bg-slate-400" },
  READY_FOR_PICKUP: { cls: "bg-sky-100 text-sky-800 ring-sky-300", dot: "bg-sky-500" },
  PICKED_UP: { cls: "bg-green-100 text-green-800 ring-green-300", dot: "bg-green-500" },
};
const NOT_SHIPPED = { cls: "bg-slate-100 text-slate-500 ring-slate-200", dot: "bg-slate-300", label: "Not Shipped" };

export const deliveryLabel = (status: string | null) =>
  status ? STYLES[status]?.label ?? humanize(status) : "Not Shipped";

const humanize = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function DeliveryBadge({ delivery }: { delivery: Delivery }) {
  const style = delivery.status ? STYLES[delivery.status] ?? STYLES.CONFIRMED : NOT_SHIPPED;
  const label = deliveryLabel(delivery.status);
  return (
    <div className="space-y-1">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${style.cls}`}
      >
        <span className={`h-2 w-2 rounded-full ${style.dot}`} />
        {label}
      </span>
      {delivery.status === "DELIVERED" && delivery.deliveredAt && (
        <div className="text-xs text-green-700">{formatDateIST(delivery.deliveredAt)}</div>
      )}
      {delivery.failedAt && <div className="text-xs text-red-700">RTO {formatDateIST(delivery.failedAt)}</div>}
      {delivery.tracking?.number && (
        <div className="text-xs text-slate-500">
          {delivery.tracking.company ? `${delivery.tracking.company} · ` : ""}
          {delivery.tracking.url ? (
            <a href={delivery.tracking.url} target="_blank" rel="noreferrer" className="underline hover:text-slate-800">
              {delivery.tracking.number}
            </a>
          ) : (
            delivery.tracking.number
          )}
        </div>
      )}
    </div>
  );
}

export function PaymentBadge({ type, status }: { type: PaymentType; status: string | null }) {
  const cls =
    type === "Prepaid"
      ? "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200"
      : type === "COD"
        ? "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200"
        : "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`} title={status ?? undefined}>
      {type === "Other" ? humanize(status ?? "Unknown") : type}
    </span>
  );
}

const BUCKET_STYLE: Record<Bucket, string> = {
  invoiceable: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending_cod: "bg-amber-50 text-amber-700 ring-amber-200",
  other_month: "bg-sky-50 text-sky-700 ring-sky-200",
  skipped: "bg-slate-50 text-slate-500 ring-slate-200",
};

export const BUCKET_LABEL: Record<Bucket, string> = {
  invoiceable: "Invoiced this month",
  pending_cod: "Awaiting delivery",
  other_month: "Another month",
  skipped: "No invoice",
};

export function InvoiceStatus({ order }: { order: Order }) {
  const forfeit = order.event?.kind === "forfeit";
  const detail =
    order.bucket === "invoiceable"
      ? forfeit
        ? `₹${order.event!.amount} advance kept`
        : null
      : order.bucket === "pending_cod"
        ? null
        : order.reason;
  return (
    <div className="space-y-0.5">
      {order.invoiceNumber && <div className="font-mono text-xs font-semibold text-slate-800">{order.invoiceNumber}</div>}
      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BUCKET_STYLE[order.bucket]}`}>
        {order.bucket === "invoiceable" && forfeit ? "Advance invoiced" : BUCKET_LABEL[order.bucket]}
      </span>
      {detail && <div className="max-w-56 text-xs text-slate-400">{detail}</div>}
    </div>
  );
}

