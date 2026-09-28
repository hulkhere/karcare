import { formatDateIST } from "@/lib/dates";
import type { Delivery, PaymentType } from "@/lib/types";

const STYLES: Record<string, { cls: string; dot: string; label?: string }> = {
  DELIVERED: { cls: "bg-green-100 text-green-800 ring-green-300", dot: "bg-green-500" },
  IN_TRANSIT: { cls: "bg-yellow-100 text-yellow-800 ring-yellow-300", dot: "bg-yellow-500" },
  OUT_FOR_DELIVERY: { cls: "bg-orange-100 text-orange-800 ring-orange-300", dot: "bg-orange-500" },
  ATTEMPTED_DELIVERY: { cls: "bg-red-100 text-red-800 ring-red-300", dot: "bg-red-500" },
  FAILURE: { cls: "bg-red-100 text-red-800 ring-red-300", dot: "bg-red-500" },
  CONFIRMED: { cls: "bg-slate-100 text-slate-700 ring-slate-300", dot: "bg-slate-400" },
  READY_FOR_PICKUP: { cls: "bg-sky-100 text-sky-800 ring-sky-300", dot: "bg-sky-500" },
  PICKED_UP: { cls: "bg-green-100 text-green-800 ring-green-300", dot: "bg-green-500" },
};
const NOT_SHIPPED = { cls: "bg-slate-100 text-slate-500 ring-slate-200", dot: "bg-slate-300", label: "Not Shipped" };

const humanize = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function DeliveryBadge({ delivery }: { delivery: Delivery }) {
  const style = delivery.status ? STYLES[delivery.status] ?? STYLES.CONFIRMED : NOT_SHIPPED;
  const label = delivery.status ? humanize(delivery.status) : NOT_SHIPPED.label;
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
      ? "bg-indigo-100 text-indigo-800"
      : type === "COD"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`} title={status ?? undefined}>
      {type === "Other" ? humanize(status ?? "Unknown") : type}
    </span>
  );
}
