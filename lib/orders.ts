import {
  COD_LOOKBACK_DAYS,
  GST_DIVISOR,
  PRODUCT_HSN,
  SHIPPING_SAC,
  TEST_ORDER_MAX_AMOUNT,
} from "./constants";
import { formatDateIST, isInRange, istParts, monthLabel } from "./dates";
import {
  allocate,
  fromPaise,
  isIntraState,
  splitCgstSgst,
  splitInclusive,
  stateCodeFor,
  toPaise,
} from "./gst";
import { amountInWords, invoiceFileName, invoiceNumber } from "./invoice";
import type { RawOrder } from "./shopify";
import type { Address, Delivery, InvoiceData, InvoiceLine, Order, PaymentType } from "./types";

type Range = { start: Date; end: Date };

const COD_GATEWAY = /\bcod\b|cash on delivery/i;

function paymentTypeOf(raw: RawOrder): PaymentType {
  // COD first: once the courier remits, the order may be marked PAID but it is still COD.
  if (raw.displayFinancialStatus === "PARTIALLY_PAID") return "COD";
  if (raw.paymentGatewayNames?.some((g) => COD_GATEWAY.test(g))) return "COD";
  if (raw.displayFinancialStatus === "PAID") return "Prepaid";
  return "Other";
}

function toAddress(a: RawOrder["shippingAddress"]): Address | null {
  if (!a) return null;
  return {
    name: [a.firstName, a.lastName].filter(Boolean).join(" ").trim(),
    address1: a.address1 ?? "",
    address2: a.address2 ?? "",
    city: a.city ?? "",
    province: a.province ?? "",
    provinceCode: a.provinceCode ?? "",
    country: a.country ?? "",
    zip: a.zip ?? "",
    phone: a.phone ?? "",
  };
}

function toDelivery(raw: RawOrder): Delivery {
  const list = raw.fulfillments ?? [];
  const f = list.find((x) => !["CANCELLED", "ERROR", "FAILURE"].includes(x.status)) ?? list[0];
  if (!f) return { status: null, deliveredAt: null, inTransitAt: null, shippedAt: null, tracking: null };
  return {
    status: f.displayStatus,
    deliveredAt: f.deliveredAt,
    inTransitAt: f.inTransitAt,
    shippedAt: f.createdAt,
    tracking: f.trackingInfo?.[0] ?? null,
  };
}

export function normalize(raw: RawOrder): Omit<Order, "bucket" | "reason" | "invoiceDate" | "tax"> {
  const total = Number(raw.totalPriceSet.shopMoney.amount);
  const shippingFromLines = raw.shippingLines?.edges.reduce(
    (s, e) => s + Number(e.node.discountedPriceSet.shopMoney.amount),
    0,
  );
  const shipping =
    raw.shippingLines?.edges.length ? shippingFromLines : Number(raw.totalShippingPriceSet?.shopMoney.amount ?? 0);
  const tags = raw.tags ?? [];
  return {
    id: raw.id,
    name: raw.name,
    createdAt: raw.createdAt,
    cancelledAt: raw.cancelledAt,
    financialStatus: raw.displayFinancialStatus,
    fulfillmentStatus: raw.displayFulfillmentStatus,
    paymentGateways: raw.paymentGatewayNames ?? [],
    paymentType: paymentTypeOf(raw),
    total,
    shopifyTax: Number(raw.totalTaxSet?.shopMoney.amount ?? 0),
    shipping,
    address: toAddress(raw.shippingAddress) ?? toAddress(raw.billingAddress),
    lineItems: raw.lineItems.edges.map(({ node }) => ({
      title: node.title,
      variantTitle: node.variantTitle,
      quantity: node.quantity,
      sku: node.sku,
      originalUnitPrice: Number(node.originalUnitPriceSet.shopMoney.amount),
      discountedTotal: Number(node.discountedTotalSet.shopMoney.amount),
    })),
    delivery: toDelivery(raw),
    tags,
    isTest: raw.test || total < TEST_ORDER_MAX_AMOUNT || tags.some((t) => /test/i.test(t)),
  };
}

function invoiceMonthLabel(iso: string) {
  const { month, year } = istParts(iso);
  return monthLabel(month, year);
}

/**
 * Decide whether an order belongs to the selected month and whether it
 * qualifies for an invoice. Returns null if the order is irrelevant to the
 * month (e.g. an older order fetched only for the COD look-back).
 */
export function classify(o: ReturnType<typeof normalize>, range: Range): Order | null {
  const createdInMonth = isInRange(o.createdAt, range);
  const deliveredInMonth = isInRange(o.delivery.deliveredAt, range);
  const isCod = o.paymentType === "COD";
  if (!createdInMonth && !(isCod && deliveredInMonth)) return null;

  const base = { ...o, invoiceDate: null, tax: 0 };
  const skip = (reason: string): Order => ({ ...base, bucket: "skipped", reason });

  if (o.cancelledAt) return skip("Cancelled");
  if (o.financialStatus === "VOIDED") return skip("Voided");
  if (o.financialStatus === "REFUNDED") return skip("Refunded");
  if (o.isTest) return skip("Test order");

  if (isCod) {
    const delivered = o.delivery.status === "DELIVERED";
    if (!delivered) {
      return { ...base, bucket: "pending_cod", reason: "COD — awaiting delivery" };
    }
    if (!o.delivery.deliveredAt) {
      // Delivered but no timestamp from the courier: fall back to order date.
      return withTax({ ...base, bucket: "invoiceable", reason: "COD delivered (no delivery date; using order date)", invoiceDate: o.createdAt });
    }
    if (!deliveredInMonth) {
      return {
        ...base,
        bucket: "other_month",
        reason: `Delivered ${formatDateIST(o.delivery.deliveredAt)} — invoice in ${invoiceMonthLabel(o.delivery.deliveredAt)}`,
      };
    }
    return withTax({ ...base, bucket: "invoiceable", reason: "COD delivered", invoiceDate: o.delivery.deliveredAt });
  }

  if (o.paymentType === "Prepaid") {
    return withTax({ ...base, bucket: "invoiceable", reason: "Prepaid", invoiceDate: o.createdAt });
  }

  return skip(`Payment status: ${o.financialStatus ?? "unknown"}`);
}

function withTax(o: Order): Order {
  return { ...o, tax: fromPaise(computeAmounts(o).taxPaise) };
}

/** Line-by-line taxable values and tax for an order, all GST-inclusive → exclusive. */
export function computeAmounts(o: Pick<Order, "total" | "shipping" | "shopifyTax" | "lineItems">) {
  const totalPaise = toPaise(o.total);
  const shippingPaise = Math.min(Math.max(toPaise(o.shipping), 0), totalPaise);
  const productsPaise = totalPaise - shippingPaise;

  const weights = o.lineItems.map((li) => toPaise(li.discountedTotal || li.originalUnitPrice * li.quantity));
  const productGross = allocate(productsPaise, weights);

  const rows: { gross: number; taxable: number; line: Omit<InvoiceLine, "rate" | "taxable"> }[] =
    o.lineItems.map((li, i) => ({
      gross: productGross[i],
      taxable: Math.round(productGross[i] / GST_DIVISOR),
      line: { description: li.title, variant: li.variantTitle, code: PRODUCT_HSN, quantity: li.quantity },
    }));
  if (shippingPaise > 0) {
    rows.push({
      gross: shippingPaise,
      taxable: Math.round(shippingPaise / GST_DIVISOR),
      line: { description: "Shipping Charges", variant: null, code: SHIPPING_SAC, quantity: 1 },
    });
  }

  const { taxable, tax } = splitInclusive(totalPaise, toPaise(o.shopifyTax));
  // Absorb any paisa rounding into the largest row so rows sum to the invoice taxable value.
  const diff = taxable - rows.reduce((s, r) => s + r.taxable, 0);
  if (rows.length && diff !== 0) {
    const biggest = rows.reduce((a, b) => (b.gross > a.gross ? b : a));
    biggest.taxable += diff;
  }

  const lines: InvoiceLine[] = rows.map((r) => ({
    ...r.line,
    rate: fromPaise(Math.round(r.gross / Math.max(r.line.quantity, 1))),
    taxable: fromPaise(r.taxable),
  }));
  return { lines, totalPaise, taxablePaise: taxable, taxPaise: tax };
}

export function buildInvoice(o: Order, seq: number): InvoiceData {
  if (!o.invoiceDate) throw new Error(`Order ${o.name} has no invoice date`);
  const { lines, totalPaise, taxablePaise, taxPaise } = computeAmounts(o);
  const intra = isIntraState(o.address?.provinceCode);
  const split = intra ? splitCgstSgst(taxPaise) : { cgst: 0, sgst: 0 };
  const number = invoiceNumber(o.invoiceDate, seq);
  return {
    number,
    fileName: invoiceFileName(number),
    date: o.invoiceDate,
    orderId: o.id,
    orderName: o.name,
    paymentType: o.paymentType,
    buyerName: o.address?.name || "Customer",
    placeOfSupply: {
      state: o.address?.province || "—",
      code: stateCodeFor(o.address?.provinceCode),
    },
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

/** Invoice numbering order: by invoice date, then order number. */
export function sortForInvoicing(orders: Order[]) {
  const num = (name: string) => Number(name.replace(/\D/g, "")) || 0;
  return [...orders].sort(
    (a, b) =>
      new Date(a.invoiceDate!).getTime() - new Date(b.invoiceDate!).getTime() || num(a.name) - num(b.name),
  );
}

export function lookbackStart(range: Range) {
  return new Date(range.start.getTime() - COD_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
}
