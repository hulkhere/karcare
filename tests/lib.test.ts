import { describe, expect, it } from "vitest";
import { financialYear, formatDateIST, monthRangeUTC } from "../lib/dates";
import { allocate, isIntraState, splitCgstSgst, splitInclusive, stateCodeFor } from "../lib/gst";
import { amountInWords, invoiceFileName, invoiceNumber } from "../lib/invoice";
import { buildMonth, normalize } from "../lib/orders";
import { assembleJsonl, type RawOrder } from "../lib/raw";

const m = (a: number) => ({ shopMoney: { amount: String(a) } });
let n = 1000;

type Opts = {
  at: string; // created
  cod?: boolean;
  total?: number;
  delivered?: string;
  failed?: string; // RTO date
  cancelled?: string;
  shipped?: boolean;
  status?: string;
  province?: string;
  ship?: number;
  refunded?: string;
  test?: boolean;
};

function order(o: Opts): RawOrder {
  n++;
  const total = o.total ?? 699;
  const received = o.cod ? (o.delivered ? total : 99) : o.refunded ? 0 : total;
  const status = o.delivered ? "DELIVERED" : o.failed ? "NOT_DELIVERED" : o.status ?? (o.shipped ? "IN_TRANSIT" : null);
  return {
    id: `gid://shopify/Order/${n}`, name: `#${n}`, createdAt: o.at, cancelledAt: o.cancelled ?? null, test: !!o.test,
    displayFinancialStatus: o.refunded ? "REFUNDED" : o.cod && !o.delivered ? "PARTIALLY_PAID" : "PAID",
    paymentGatewayNames: o.cod ? ["Cash on Delivery (COD)", "PayU"] : ["PayU"], tags: o.cod ? ["PPCOD"] : [],
    totalPriceSet: m(total), totalTaxSet: m(0), totalReceivedSet: m(received),
    shippingAddress: { firstName: "Ravi", lastName: "Kumar", city: "Pune", province: o.province === "TS" ? "Telangana" : "Maharashtra", provinceCode: o.province ?? "MH" },
    billingAddress: null,
    refunds: o.refunded ? [{ createdAt: o.refunded }] : [],
    transactions: [{ kind: "SALE", status: "SUCCESS", gateway: "PayU", amountSet: m(o.cod ? 99 : total) }],
    shippingLines: o.ship ? [{ discountedPriceSet: m(o.ship) }] : [],
    lineItems: [{ title: "Door Shock Absorbers", variantTitle: "16 Piece", quantity: 1, sku: null, originalUnitPriceSet: m(total - (o.ship ?? 0)), discountedTotalSet: m(total - (o.ship ?? 0)) }],
    fulfillments: status
      ? [{ id: `gid://shopify/Fulfillment/${n}`, status: "SUCCESS", displayStatus: status, deliveredAt: o.delivered ?? null, updatedAt: o.failed ?? o.delivered ?? o.at, createdAt: o.at, trackingInfo: [], events: o.failed ? [{ status: "FAILURE", happenedAt: o.failed }] : [] }]
      : [],
  };
}

const AUG = { month: 8, year: 2026 };
const SEP = { month: 9, year: 2026 };
const numbers = (md: ReturnType<typeof buildMonth>) => md.invoices.map((i) => [i.orderName, i.number, i.kind]);

describe("helpers", () => {
  it("IST dates and financial year", () => {
    expect(monthRangeUTC(8, 2026).start.toISOString()).toBe("2026-07-31T18:30:00.000Z");
    expect(formatDateIST("2026-07-31T19:00:00Z")).toBe("01 Aug 2026");
    expect(financialYear("2027-03-31T18:30:00Z")).toBe("27-28");
  });
  it("GST maths", () => {
    expect(splitInclusive(69900)).toEqual({ taxable: 59237, tax: 10663, source: "computed" });
    expect(splitCgstSgst(10663)).toEqual({ cgst: 5332, sgst: 5331 });
    expect(isIntraState("TG")).toBe(true);
    expect(stateCodeFor("MH")).toBe("27");
    expect(allocate(10000, [1, 1, 1]).reduce((a, b) => a + b)).toBe(10000);
  });
  it("numbers and words", () => {
    expect(invoiceNumber("2026-08-05T06:00:00Z", 1)).toBe("KC/26-27/0001");
    expect(invoiceFileName("KC/26-27/0001")).toBe("KC-26-27-0001.pdf");
    expect(amountInWords(69900)).toBe("Rupees Six Hundred and Ninety Nine Only");
    expect(amountInWords(9900)).toBe("Rupees Ninety Nine Only");
  });
});

describe("invoice numbering follows when money is received", () => {
  it("COD is skipped until delivery, then numbered on its delivery date", () => {
    n = 1000;
    const orders: RawOrder[] = [];
    for (let d = 1; d <= 9; d++) orders.push(order({ at: `2026-08-${String(d).padStart(2, "0")}T06:00:00Z` }));
    orders.push(order({ at: "2026-08-10T06:00:00Z", cod: true, delivered: "2026-08-20T09:00:00Z" })); // #1010
    for (let d = 11; d <= 25; d++) orders.push(order({ at: `2026-08-${d}T06:00:00Z` }));

    const aug = buildMonth(orders, AUG);
    const inv = aug.invoices;
    expect(inv[0].number).toBe("KC/26-27/0001");
    expect(inv.find((i) => i.orderName === "#1010")!.number).toBe("KC/26-27/0020"); // after the 19 prepaid orders paid before it was delivered
    expect(inv.find((i) => i.orderName === "#1010")!.date).toBe("2026-08-20T09:00:00Z");
    expect(inv.find((i) => i.orderName === "#1011")!.number).toBe("KC/26-27/0010");
    expect(inv.at(-1)!.number).toBe("KC/26-27/0025");
    // gap-free, strictly increasing by date
    inv.forEach((x, i) => expect(x.number).toBe(invoiceNumber(x.date, i + 1)));
    for (let i = 1; i < inv.length; i++) expect(inv[i].date >= inv[i - 1].date).toBe(true);
  });

  it("refused COD: ₹99 advance invoiced on the refusal date, in sequence", () => {
    n = 2000;
    const orders = [
      order({ at: "2026-09-10T06:00:00Z" }),
      order({ at: "2026-09-11T06:00:00Z", cod: true, failed: "2026-09-17T08:00:00Z" }), // paid 99 on 11th, RTO on 17th
      order({ at: "2026-09-15T06:00:00Z" }),
      order({ at: "2026-09-18T06:00:00Z" }),
    ];
    const sep = buildMonth(orders, SEP);
    expect(numbers(sep)).toEqual([
      ["#2001", "KC/26-27/0001", "sale"],
      ["#2003", "KC/26-27/0002", "sale"],
      ["#2002", "KC/26-27/0003", "forfeit"],
      ["#2004", "KC/26-27/0004", "sale"],
    ]);
    const f = sep.invoices[2];
    expect(f.date).toBe("2026-09-17T08:00:00Z");
    expect(f.total).toBe(99);
    expect(f.taxable).toBe(83.9);
    expect(f.igst).toBe(15.1);
    expect(f.lines[0].code).toBe("9997");
    expect(f.lines[0].description).toContain("Non-refundable advance");
    expect(sep.orders.find((o) => o.name === "#2002")!.outcome).toBe("RTO");
  });

  it("COD cancelled before shipping: advance invoiced on cancel date", () => {
    n = 3000;
    const md = buildMonth([order({ at: "2026-08-28T10:00:00Z", cod: true, cancelled: "2026-08-28T19:30:00Z" })], AUG);
    expect(md.invoices).toHaveLength(1);
    expect(md.invoices[0].kind).toBe("forfeit");
    expect(md.invoices[0].date).toBe("2026-08-28T19:30:00Z");
    expect(md.orders[0].outcome).toBe("Cancelled");
  });

  it("COD in transit stays pending; shown in its order month but not numbered", () => {
    n = 4000;
    const md = buildMonth([order({ at: "2026-08-28T10:00:00Z", cod: true, shipped: true }), order({ at: "2026-08-29T10:00:00Z" })], AUG);
    expect(md.orders.find((o) => o.name === "#4001")!.bucket).toBe("pending_cod");
    expect(md.invoices.map((i) => i.number)).toEqual(["KC/26-27/0001"]);
  });

  it("numbers continue across months; placed-in-Aug, delivered-in-Sep belongs to September", () => {
    n = 5000;
    const orders = [
      order({ at: "2026-08-20T06:00:00Z" }),
      order({ at: "2026-08-30T06:00:00Z", cod: true, delivered: "2026-09-03T06:00:00Z" }),
      order({ at: "2026-08-31T06:00:00Z" }),
      order({ at: "2026-09-02T06:00:00Z" }),
    ];
    const aug = buildMonth(orders, AUG);
    const sep = buildMonth(orders, SEP);
    expect(numbers(aug)).toEqual([["#5001", "KC/26-27/0001", "sale"], ["#5003", "KC/26-27/0002", "sale"]]);
    expect(numbers(sep)).toEqual([["#5004", "KC/26-27/0003", "sale"], ["#5002", "KC/26-27/0004", "sale"]]);
    expect(aug.orders.find((o) => o.name === "#5002")!.bucket).toBe("other_month");
    expect(sep.orders.find((o) => o.name === "#5002")!.invoiceNumber).toBe("KC/26-27/0004");
    expect(sep.series).toMatchObject({ firstNumber: 3, lastNumber: 4 });
  });

  it("restarts at 0001 on 1 April", () => {
    n = 6000;
    const orders = [order({ at: "2027-03-30T06:00:00Z" }), order({ at: "2027-04-01T06:00:00Z" })];
    expect(buildMonth(orders, { month: 3, year: 2027 }).invoices[0].number).toBe("KC/26-27/0001");
    expect(buildMonth(orders, { month: 4, year: 2027 }).invoices[0].number).toBe("KC/27-28/0001");
  });

  it("prepaid cancelled in its own month is never invoiced; refunded later keeps its invoice", () => {
    n = 7000;
    const orders = [
      order({ at: "2026-08-05T06:00:00Z", cancelled: "2026-08-06T06:00:00Z", refunded: "2026-08-06T06:00:00Z" }),
      order({ at: "2026-08-07T06:00:00Z", cancelled: "2026-09-10T06:00:00Z", refunded: "2026-09-10T06:00:00Z" }),
      order({ at: "2026-08-08T06:00:00Z", total: 9.98 }),
    ];
    const aug = buildMonth(orders, AUG);
    expect(numbers(aug)).toEqual([["#7002", "KC/26-27/0001", "sale"]]);
    expect(aug.orders.find((o) => o.name === "#7003")!.reason).toBe("Test order");
  });

  it("delivered COD invoice shows the advance / cash split; intra-state splits CGST+SGST", () => {
    n = 8000;
    const inv = buildMonth([order({ at: "2026-08-10T06:00:00Z", cod: true, delivered: "2026-08-12T06:00:00Z", total: 798, ship: 99, province: "TS" })], AUG).invoices[0];
    expect(inv.paymentNote).toBe("₹99.00 advance paid online + ₹699.00 collected on delivery");
    expect(inv.lines.map((l) => l.code)).toEqual(["8708", "9965"]);
    expect(Math.round((inv.taxable + inv.cgst + inv.sgst) * 100)).toBe(79800);
    expect(inv.igst).toBe(0);
  });

  it("uses Shopify's RTO event date, falling back to the fulfillment update", () => {
    n = 9000;
    const r = order({ at: "2026-09-11T06:00:00Z", cod: true, failed: "2026-09-17T08:00:00Z" });
    r.fulfillments[0].events = [];
    expect(normalize(r).event!.date).toBe("2026-09-17T08:00:00Z");
  });
});

describe("HSN per product", () => {
  it("mirrors use 7009, other products 8708", () => {
    n = 9500;
    const r = order({ at: "2026-10-02T06:00:00Z" });
    r.lineItems[0].title = "Blind Spot Side Mirrors";
    r.lineItems[0].variantTitle = "Frameless";
    const inv = buildMonth([r, order({ at: "2026-10-02T07:00:00Z" })], { month: 10, year: 2026 }).invoices;
    expect(inv.map((i) => i.lines[0].code)).toEqual(["7009", "8708"]);
  });
});

describe("bulk export parsing", () => {
  it("puts child rows back under their parents", () => {
    const jsonl = [
      JSON.stringify({ id: "gid://shopify/Order/1", name: "#1", fulfillments: [{ id: "gid://shopify/Fulfillment/9", displayStatus: "DELIVERED" }] }),
      JSON.stringify({ id: "gid://shopify/LineItem/5", title: "Cover", __parentId: "gid://shopify/Order/1" }),
      JSON.stringify({ id: "gid://shopify/ShippingLine/6", __parentId: "gid://shopify/Order/1" }),
      JSON.stringify({ id: "gid://shopify/FulfillmentEvent/7", status: "DELIVERED", __parentId: "gid://shopify/Fulfillment/9" }),
    ].join("\n");
    const [o] = assembleJsonl(jsonl);
    expect(o.lineItems).toHaveLength(1);
    expect(o.shippingLines).toHaveLength(1);
    expect(o.fulfillments[0].events[0].status).toBe("DELIVERED");
  });
});
