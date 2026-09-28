import { describe, expect, it } from "vitest";
import { financialYear, formatDateIST, monthRangeUTC } from "../lib/dates";
import { allocate, isIntraState, splitCgstSgst, splitInclusive, stateCodeFor } from "../lib/gst";
import { amountInWords, invoiceFileName, invoiceNumber } from "../lib/invoice";
import { buildInvoice, classify, normalize, sortForInvoicing } from "../lib/orders";
import type { RawOrder } from "../lib/shopify";

const money = (a: number | string) => ({ shopMoney: { amount: String(a), currencyCode: "INR" } });

function raw(over: Partial<RawOrder> & { total?: number; shippingAmt?: number; province?: string } = {}): RawOrder {
  const { total = 699, shippingAmt = 0, province = "KA", ...rest } = over;
  return {
    id: "gid://shopify/Order/1",
    name: "#1004",
    createdAt: "2026-08-05T06:00:00Z",
    cancelledAt: null,
    test: false,
    displayFinancialStatus: "PAID",
    displayFulfillmentStatus: "FULFILLED",
    paymentGatewayNames: ["Razorpay"],
    totalPriceSet: money(total),
    totalTaxSet: money(0),
    subtotalPriceSet: money(total - shippingAmt),
    totalShippingPriceSet: money(shippingAmt),
    shippingLines: {
      edges: shippingAmt ? [{ node: { title: "Standard", discountedPriceSet: money(shippingAmt) } }] : [],
    },
    shippingAddress: {
      firstName: "Ravi", lastName: "Kumar", address1: "1 MG Road", address2: null, city: "Bengaluru",
      province: "Karnataka", provinceCode: province, country: "India", zip: "560001", phone: "9999999999",
    },
    billingAddress: null,
    lineItems: {
      edges: [{
        node: {
          title: "Seat Cover", variantTitle: "Black", quantity: 1, sku: "SC1",
          originalUnitPriceSet: money(total - shippingAmt), discountedTotalSet: money(total - shippingAmt),
        },
      }],
    },
    fulfillments: [],
    tags: [],
    ...rest,
  };
}

const AUG = monthRangeUTC(8, 2026);

describe("dates", () => {
  it("converts IST month boundaries to UTC", () => {
    expect(AUG.start.toISOString()).toBe("2026-07-31T18:30:00.000Z");
    expect(AUG.end.toISOString()).toBe("2026-08-31T18:30:00.000Z");
  });
  it("formats in IST and computes financial year", () => {
    expect(formatDateIST("2026-07-31T19:00:00Z")).toBe("01 Aug 2026");
    expect(financialYear("2026-08-10T00:00:00Z")).toBe("26-27");
    expect(financialYear("2027-03-31T18:00:00Z")).toBe("26-27");
    expect(financialYear("2027-03-31T18:30:00Z")).toBe("27-28"); // 1 Apr IST
  });
});

describe("gst", () => {
  it("back-calculates 18% inclusive", () => {
    expect(splitInclusive(69900)).toEqual({ taxable: 59237, tax: 10663, source: "computed" });
    expect(splitInclusive(69900, 10663).source).toBe("shopify");
    expect(splitInclusive(69900, 5000).source).toBe("computed"); // implausible Shopify tax ignored
  });
  it("splits CGST/SGST", () => {
    expect(splitCgstSgst(10663)).toEqual({ cgst: 5332, sgst: 5331 });
  });
  it("handles Telangana codes", () => {
    expect(isIntraState("TS")).toBe(true);
    expect(isIntraState("TG")).toBe(true);
    expect(isIntraState("KA")).toBe(false);
    expect(stateCodeFor("TG")).toBe("36");
    expect(stateCodeFor("MH")).toBe("27");
  });
  it("allocates exactly", () => {
    const parts = allocate(10000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b)).toBe(10000);
  });
});

describe("invoice helpers", () => {
  it("numbers and names invoices", () => {
    expect(invoiceNumber("2026-08-05T06:00:00Z", 1)).toBe("KC/26-27/001");
    expect(invoiceFileName("KC/26-27/001")).toBe("KC-26-27-001.pdf");
  });
  it("writes amounts in words (Indian system)", () => {
    expect(amountInWords(69900)).toBe("Rupees Six Hundred and Ninety Nine Only");
    expect(amountInWords(12345650)).toBe("Rupees One Lakh Twenty Three Thousand Four Hundred and Fifty Six and Fifty Paise Only");
  });
});

describe("classification", () => {
  it("prepaid orders are always invoiceable, dated at order creation", () => {
    const o = classify(normalize(raw()), AUG)!;
    expect(o.bucket).toBe("invoiceable");
    expect(o.invoiceDate).toBe("2026-08-05T06:00:00Z");
  });

  it("COD needs DELIVERED, and is invoiced in the delivery month", () => {
    const cod = (status: string | null, deliveredAt: string | null, createdAt = "2026-08-30T06:00:00Z") =>
      raw({
        createdAt,
        displayFinancialStatus: "PARTIALLY_PAID",
        fulfillments: status
          ? [{ status: "SUCCESS", displayStatus: status, deliveredAt, inTransitAt: null, createdAt, trackingInfo: [] }]
          : [],
      });

    expect(classify(normalize(cod("IN_TRANSIT", null)), AUG)!.bucket).toBe("pending_cod");
    expect(classify(normalize(cod(null, null)), AUG)!.bucket).toBe("pending_cod");

    // Placed Aug 30, delivered Sep 3 → not August's invoice
    const lateDelivery = normalize(cod("DELIVERED", "2026-09-03T06:00:00Z"));
    expect(classify(lateDelivery, AUG)!.bucket).toBe("other_month");
    const sep = classify(lateDelivery, monthRangeUTC(9, 2026))!;
    expect(sep.bucket).toBe("invoiceable");
    expect(sep.invoiceDate).toBe("2026-09-03T06:00:00Z");

    // Placed in July, not delivered in August → irrelevant to August
    expect(classify(normalize(cod("IN_TRANSIT", null, "2026-07-20T06:00:00Z")), AUG)).toBeNull();
  });

  it("COD marked PAID after remittance is still COD", () => {
    const o = normalize(raw({ paymentGatewayNames: ["Razorpay", "Cash on Delivery (COD)"] }));
    expect(o.paymentType).toBe("COD");
  });

  it("skips test, cancelled, refunded and voided orders", () => {
    expect(classify(normalize(raw({ total: 9.98 })), AUG)!.reason).toBe("Test order");
    expect(classify(normalize(raw({ tags: ["Test-Order"] })), AUG)!.bucket).toBe("skipped");
    expect(classify(normalize(raw({ displayFinancialStatus: "REFUNDED" })), AUG)!.bucket).toBe("skipped");
    expect(classify(normalize(raw({ displayFinancialStatus: "VOIDED" })), AUG)!.bucket).toBe("skipped");
    expect(classify(normalize(raw({ cancelledAt: "2026-08-06T00:00:00Z" })), AUG)!.bucket).toBe("skipped");
  });
});

describe("buildInvoice", () => {
  it("inter-state: IGST, totals match", () => {
    const inv = buildInvoice(classify(normalize(raw()), AUG)!, 1);
    expect(inv.intraState).toBe(false);
    expect(inv.taxable).toBe(592.37);
    expect(inv.igst).toBe(106.63);
    expect(inv.total).toBe(699);
    expect(inv.placeOfSupply).toEqual({ state: "Karnataka", code: "29" });
  });

  it("intra-state with shipping line: CGST+SGST and rows sum to taxable", () => {
    const inv = buildInvoice(classify(normalize(raw({ total: 798, shippingAmt: 99, province: "TS" })), AUG)!, 2);
    expect(inv.intraState).toBe(true);
    expect(inv.lines.map((l) => l.code)).toEqual(["8708", "9965"]);
    const rowSum = Math.round(inv.lines.reduce((s, l) => s + l.taxable, 0) * 100);
    expect(rowSum).toBe(Math.round(inv.taxable * 100));
    expect(Math.round((inv.taxable + inv.cgst + inv.sgst) * 100)).toBe(79800);
    expect(inv.igst).toBe(0);
  });

  it("uses the discounted total, not the original price", () => {
    const r = raw({ total: 599 });
    r.lineItems.edges[0].node.originalUnitPriceSet = money(699);
    const inv = buildInvoice(classify(normalize(r), AUG)!, 1);
    expect(inv.total).toBe(599);
    expect(inv.lines[0].rate).toBe(599);
  });

  it("sorts by invoice date then order number", () => {
    const a = classify(normalize(raw({ name: "#1010", createdAt: "2026-08-02T00:00:00Z" })), AUG)!;
    const b = classify(normalize(raw({ name: "#1005", createdAt: "2026-08-09T00:00:00Z" })), AUG)!;
    expect(sortForInvoicing([b, a]).map((o) => o.name)).toEqual(["#1010", "#1005"]);
  });
});
