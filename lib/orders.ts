import {
  COD_LOOKBACK_DAYS,
  FORFEIT_SAC,
  GST_DIVISOR,
  PRODUCT_HSN,
  SERIES_START,
  SHIPPING_SAC,
  TEST_ORDER_MAX_AMOUNT,
} from "./constants";
import { catalogEntry } from "./costs";
import { formatDateIST, formatDateNumericIST, istParts, monthLabel, monthRangeUTC } from "./dates";
import {
  allocate,
  fromPaise,
  isIntraState,
  splitCgstSgst,
  splitInclusive,
  stateCodeFor,
  taxableFromInclusive,
  toPaise,
} from "./gst";
import { amountInWords, formatINR, invoiceFileName, invoiceNumber } from "./invoice";
import type { RawAddress, RawOrder } from "./raw";
import type { Address, Delivery, InvoiceData, InvoiceEvent, InvoiceLine, MonthData, Order, Outcome, PaymentType } from "./types";

type Base = Omit<Order, "bucket" | "reason" | "invoiceNumber">;

const COD_GATEWAY = /\bcod\b|cash on delivery/i;
/** Tag Shiprocket adds to partial-prepaid COD orders */
export const COD_TAG = "PPCOD";
const FAILED = ["FAILURE", "NOT_DELIVERED"];

function paymentTypeOf(raw: RawOrder): PaymentType {
  // COD first: once delivered, Shopify marks the order PAID but it is still COD.
  if (raw.displayFinancialStatus === "PARTIALLY_PAID") return "COD";
  if (raw.paymentGatewayNames?.some((g) => COD_GATEWAY.test(g))) return "COD";
  if (raw.tags?.includes(COD_TAG)) return "COD";
  if (["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(raw.displayFinancialStatus ?? "")) return "Prepaid";
  return "Other";
}

function toAddress(a: RawAddress | null): Address | null {
  if (!a) return null;
  return {
    name: [a.firstName, a.lastName].filter(Boolean).join(" ").replace(/\s+\.$/, "").trim(),
    city: a.city ?? "",
    province: a.province ?? "",
    provinceCode: a.provinceCode ?? "",
  };
}

function toDelivery(raw: RawOrder): Delivery {
  const list = raw.fulfillments ?? [];
  const f = list.find((x) => !["CANCELLED", "ERROR"].includes(x.status)) ?? list[0];
  if (!f) return { status: null, deliveredAt: null, failedAt: null, shippedAt: null, tracking: null };
  const failEvent = f.events
    ?.filter((e) => FAILED.includes(e.status))
    .sort((a, b) => a.happenedAt.localeCompare(b.happenedAt))[0];
  return {
    status: f.displayStatus,
    deliveredAt: f.deliveredAt,
    failedAt: failEvent?.happenedAt ?? (FAILED.includes(f.displayStatus ?? "") ? f.updatedAt : null),
    shippedAt: f.createdAt,
    tracking: f.trackingInfo?.[0] ?? null,
  };
}

const money = (m: { shopMoney: { amount: string } } | null | undefined) => Number(m?.shopMoney.amount ?? 0);
const earliest = (...d: (string | null | undefined)[]) =>
  d.filter((x): x is string => !!x).sort()[0] ?? null;

/**
 * The single "money received" moment for an order, which decides its invoice date and number:
 * - Prepaid → order date, full amount
 * - COD delivered → delivery date, full amount
 * - COD cancelled / returned → date it failed, only the advance received (non-refundable)
 */
function decide(
  o: Omit<Base, "outcome" | "event">,
  refunds: { createdAt: string }[],
): { outcome: Outcome; event: InvoiceEvent | null; skip?: string } {
  const d = o.delivery;
  const shipped = d.status !== null;
  const baseOutcome: Outcome =
    d.status === "DELIVERED" ? "Delivered" : FAILED.includes(d.status ?? "") ? "RTO" : shipped ? "In transit" : "Not shipped";

  if (o.isTest) return { outcome: "Test", event: null, skip: "Test order" };

  if (o.paymentType === "COD") {
    if (d.status === "DELIVERED" && d.deliveredAt) {
      return { outcome: "Delivered", event: { kind: "sale", date: d.deliveredAt, amount: o.total, why: "COD delivered" } };
    }
    const failed = !!o.cancelledAt || FAILED.includes(d.status ?? "");
    if (failed) {
      const outcome: Outcome = FAILED.includes(d.status ?? "") || shipped ? "RTO" : "Cancelled";
      const date = earliest(o.cancelledAt, d.failedAt) ?? o.createdAt;
      if (o.received <= 0) return { outcome, event: null, skip: `${outcome === "RTO" ? "RTO" : "Cancelled"} — nothing received` };
      return {
        outcome,
        event: { kind: "forfeit", date, amount: o.received, why: outcome === "RTO" ? "RTO — advance kept" : "Cancelled — advance kept" },
      };
    }
    return { outcome: baseOutcome, event: null };
  }

  if (o.paymentType === "Prepaid") {
    // Cancelled/refunded within the month it was placed → never invoiced.
    // Later refunds don't touch the invoice (the CA issues a credit note), so numbers never shift.
    const { month, year } = istParts(o.createdAt);
    const cutoff = monthRangeUTC(month, year).end.toISOString();
    const cancelledEarly = !!o.cancelledAt && o.cancelledAt < cutoff;
    const refundedEarly = o.financialStatus === "REFUNDED" && refunds.some((r) => r.createdAt < cutoff);
    if (cancelledEarly || refundedEarly) return { outcome: "Cancelled", event: null, skip: "Cancelled / refunded" };
    return { outcome: baseOutcome, event: { kind: "sale", date: o.createdAt, amount: o.total, why: "Prepaid" } };
  }

  return { outcome: o.cancelledAt ? "Cancelled" : baseOutcome, event: null, skip: `Payment ${(o.financialStatus ?? "unknown").toLowerCase()}` };
}

export function normalize(raw: RawOrder): Base & { skip?: string } {
  const total = money(raw.totalPriceSet);
  const tags = raw.tags ?? [];
  const paidOnline = (raw.transactions ?? [])
    .filter((t) => t.status === "SUCCESS" && ["SALE", "CAPTURE"].includes(t.kind) && !COD_GATEWAY.test(t.gateway ?? ""))
    .reduce((s, t) => s + money(t.amountSet), 0);
  const o = {
    id: raw.id,
    name: raw.name,
    createdAt: raw.createdAt,
    cancelledAt: raw.cancelledAt,
    financialStatus: raw.displayFinancialStatus,
    paymentType: paymentTypeOf(raw),
    total,
    received: money(raw.totalReceivedSet),
    paidOnline,
    shopifyTax: money(raw.totalTaxSet),
    shipping: (raw.shippingLines ?? []).reduce((s, l) => s + money(l.discountedPriceSet), 0),
    address: toAddress(raw.shippingAddress) ?? toAddress(raw.billingAddress),
    lineItems: (raw.lineItems ?? []).map((li) => ({
      title: li.title,
      variantTitle: li.variantTitle,
      quantity: li.quantity,
      sku: li.sku,
      originalUnitPrice: money(li.originalUnitPriceSet),
      discountedTotal: money(li.discountedTotalSet),
    })),
    delivery: toDelivery(raw),
    tags,
    isTest: raw.test || total < TEST_ORDER_MAX_AMOUNT || tags.some((t) => /test/i.test(t)),
  };
  return { ...o, ...decide(o, raw.refunds ?? []) };
}

/** Line-by-line taxable values for a sale, GST-inclusive → exclusive. */
export function computeAmounts(o: Pick<Order, "total" | "shipping" | "shopifyTax" | "lineItems">) {
  const totalPaise = toPaise(o.total);
  const shippingPaise = Math.min(Math.max(toPaise(o.shipping), 0), totalPaise);
  const productsPaise = totalPaise - shippingPaise;

  const weights = o.lineItems.map((li) => toPaise(li.discountedTotal || li.originalUnitPrice * li.quantity));
  const productGross = allocate(productsPaise, weights);

  const rows: { gross: number; taxable: number; line: Omit<InvoiceLine, "rate" | "taxable"> }[] = o.lineItems.map(
    (li, i) => ({
      gross: productGross[i],
      taxable: Math.round(productGross[i] / GST_DIVISOR),
      line: { description: li.title, variant: li.variantTitle, code: catalogEntry(li.title)?.hsn ?? PRODUCT_HSN, quantity: li.quantity },
    }),
  );
  if (shippingPaise > 0) {
    rows.push({
      gross: shippingPaise,
      taxable: Math.round(shippingPaise / GST_DIVISOR),
      line: { description: "Shipping Charges", variant: null, code: SHIPPING_SAC, quantity: 1 },
    });
  }

  const { taxable, tax } = splitInclusive(totalPaise, toPaise(o.shopifyTax));
  // Absorb paisa rounding into the largest row so rows sum to the invoice taxable value.
  const diff = taxable - rows.reduce((s, r) => s + r.taxable, 0);
  if (rows.length && diff !== 0) rows.reduce((a, b) => (b.gross > a.gross ? b : a)).taxable += diff;

  const lines: InvoiceLine[] = rows.map((r) => ({
    ...r.line,
    rate: fromPaise(Math.round(r.gross / Math.max(r.line.quantity, 1))),
    taxable: fromPaise(r.taxable),
  }));
  return { lines, totalPaise, taxablePaise: taxable, taxPaise: tax };
}

function forfeitAmounts(o: Order, event: InvoiceEvent) {
  const totalPaise = toPaise(event.amount);
  const taxablePaise = taxableFromInclusive(totalPaise);
  const what = o.outcome === "RTO" ? "not delivered (returned)" : "cancelled";
  const lines: InvoiceLine[] = [
    {
      description: `Non-refundable advance retained — order ${o.name} ${what}`,
      variant: null,
      code: FORFEIT_SAC,
      quantity: 1,
      rate: event.amount,
      taxable: fromPaise(taxablePaise),
    },
  ];
  return { lines, totalPaise, taxablePaise, taxPaise: totalPaise - taxablePaise };
}

function paymentNote(o: Order, event: InvoiceEvent) {
  if (event.kind === "forfeit") {
    return `₹${formatINR(event.amount)} advance paid online on ${formatDateNumericIST(o.createdAt)}. Order ${
      o.outcome === "RTO" ? "not delivered" : "cancelled"
    }; the advance is non-refundable.`;
  }
  if (o.paymentType === "COD") {
    const adv = Math.min(o.paidOnline, o.total);
    return adv > 0
      ? `₹${formatINR(adv)} advance paid online + ₹${formatINR(o.total - adv)} collected on delivery`
      : "Collected on delivery";
  }
  return "Paid online";
}

export function buildInvoice(o: Order, seq: number): InvoiceData {
  const event = o.event;
  if (!event) throw new Error(`Order ${o.name} has no invoice event`);
  const { lines, totalPaise, taxablePaise, taxPaise } = event.kind === "sale" ? computeAmounts(o) : forfeitAmounts(o, event);
  const intra = isIntraState(o.address?.provinceCode);
  const split = intra ? splitCgstSgst(taxPaise) : { cgst: 0, sgst: 0 };
  const number = invoiceNumber(event.date, seq);
  return {
    number,
    fileName: invoiceFileName(number),
    kind: event.kind,
    date: event.date,
    orderId: o.id,
    orderName: o.name,
    orderDate: o.createdAt,
    paymentType: o.paymentType,
    paymentNote: paymentNote(o, event),
    buyerName: o.address?.name || "Customer",
    placeOfSupply: { state: o.address?.province || "—", code: stateCodeFor(o.address?.provinceCode) },
    intraState: intra,
    lines,
    taxable: fromPaise(taxablePaise),
    igst: intra ? 0 : fromPaise(taxPaise),
    cgst: fromPaise(split.cgst),
    sgst: fromPaise(split.sgst),
    total: fromPaise(totalPaise),
    amountInWords: amountInWords(totalPaise),
  };
}

type YM = { month: number; year: number };
const ord = ({ month, year }: YM) => year * 12 + month - 1;

/** First month of the number series that `ym` belongs to: April of its financial year, or SERIES_START. */
export function seriesStartFor(ym: YM, seriesStart: YM = SERIES_START): YM {
  const fyStart = { month: 4, year: ym.month >= 4 ? ym.year : ym.year - 1 };
  return ord(fyStart) > ord(seriesStart) ? fyStart : seriesStart;
}

/** Orders must be fetched from here to number `ym` correctly. */
export function fetchFrom(ym: YM, seriesStart: YM = SERIES_START) {
  const s = seriesStartFor(ym, seriesStart);
  return new Date(monthRangeUTC(s.month, s.year).start.getTime() - COD_LOOKBACK_DAYS * 864e5);
}

const orderNo = (name: string) => Number(name.replace(/\D/g, "")) || 0;

/**
 * Number every money event from the start of the series, in date order, and return
 * the selected month's orders and invoices. Pure — the same input always gives the same numbers.
 */
export function buildMonth(raws: RawOrder[], ym: YM, opts: { seriesStart?: YM; syncedAt?: string } = {}): MonthData {
  const all = raws.map(normalize);
  const range = monthRangeUTC(ym.month, ym.year);
  const s = seriesStartFor(ym, opts.seriesStart);
  const from = monthRangeUTC(s.month, s.year).start.toISOString();
  const start = range.start.toISOString();
  const end = range.end.toISOString();

  const numbered = all
    .filter((o) => o.event && o.event.date >= from && o.event.date < end)
    .sort((a, b) => a.event!.date.localeCompare(b.event!.date) || orderNo(a.name) - orderNo(b.name));
  const numberOf = new Map(numbered.map((o, i) => [o.id, i + 1]));

  const inMonth = (iso: string | null | undefined) => !!iso && iso >= start && iso < end;
  const orders: Order[] = [];
  const invoices: InvoiceData[] = [];

  for (const o of all) {
    const ev = o.event;
    if (!inMonth(o.createdAt) && !inMonth(ev?.date)) continue;
    let bucket: Order["bucket"];
    let reason: string;
    let invoiceNo: string | null = null;
    if (ev && inMonth(ev.date)) {
      bucket = "invoiceable";
      reason = ev.why;
      const seq = numberOf.get(o.id)!;
      const order = { ...o, bucket, reason, invoiceNumber: null };
      const inv = buildInvoice(order, seq);
      invoices.push(inv);
      invoiceNo = inv.number;
    } else if (ev && ev.date < from) {
      bucket = "skipped";
      reason = "Before the invoice series started";
    } else if (ev) {
      const { month, year } = istParts(ev.date);
      bucket = "other_month";
      reason = `${ev.why} ${formatDateIST(ev.date)} — invoiced in ${monthLabel(month, year)}`;
    } else if (o.skip) {
      bucket = "skipped";
      reason = o.skip;
    } else {
      bucket = o.paymentType === "COD" ? "pending_cod" : "skipped";
      reason = o.paymentType === "COD" ? "COD — no money event yet" : "Not invoiceable";
    }
    const { skip: _skip, ...rest } = o;
    orders.push({ ...rest, bucket, reason, invoiceNumber: invoiceNo });
  }

  invoices.sort((a, b) => a.number.localeCompare(b.number));
  orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const seqs = invoices.map((i) => numberOf.get(i.orderId)!);
  return {
    month: ym.month,
    year: ym.year,
    orders,
    invoices,
    series: {
      start: from,
      firstNumber: seqs.length ? Math.min(...seqs) : null,
      lastNumber: seqs.length ? Math.max(...seqs) : null,
    },
    syncedAt: opts.syncedAt ?? new Date().toISOString(),
  };
}
