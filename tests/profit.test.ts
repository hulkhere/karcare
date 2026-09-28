import { describe, expect, it } from "vitest";
import { unitCost } from "../lib/costs";
import { normalize } from "../lib/orders";
import { buildProfit } from "../lib/profit";
import type { RawOrder } from "../lib/raw";
import { parseAdSpend, parseDate } from "../lib/sheet";

const m = (a: number) => ({ shopMoney: { amount: String(a) } });
let n = 0;
function order(o: { at: string; cod?: boolean; outcome: "delivered" | "rto" | "cancel" | "transit"; title?: string; variant?: string; total?: number }): RawOrder {
  n++;
  const total = o.total ?? 699;
  const status = o.outcome === "delivered" ? "DELIVERED" : o.outcome === "rto" ? "NOT_DELIVERED" : o.outcome === "transit" ? "IN_TRANSIT" : null;
  return {
    id: `gid://shopify/Order/${n}`, name: `#${n}`, createdAt: o.at, cancelledAt: o.outcome === "cancel" ? o.at : null, test: false,
    displayFinancialStatus: o.cod && o.outcome !== "delivered" ? "PARTIALLY_PAID" : "PAID",
    paymentGatewayNames: o.cod ? ["Cash on Delivery (COD)", "PayU"] : ["PayU"], tags: o.cod ? ["PPCOD"] : [],
    totalPriceSet: m(total), totalTaxSet: m(0), totalReceivedSet: m(o.cod && o.outcome !== "delivered" ? 99 : total),
    shippingAddress: null, billingAddress: null, refunds: [], transactions: [], shippingLines: [],
    lineItems: [{ title: o.title ?? "Door Shock Absorbers", variantTitle: o.variant ?? "16 Piece - Full Car (Recommended)", quantity: 1, sku: null, originalUnitPriceSet: m(total), discountedTotalSet: m(total) }],
    fulfillments: status ? [{ id: `f${n}`, status: "SUCCESS", displayStatus: status, deliveredAt: status === "DELIVERED" ? o.at : null, updatedAt: o.at, createdAt: o.at, trackingInfo: [], events: [] }] : [],
  };
}
const SEP = { month: 9, year: 2026 };
const NOW = new Date("2026-09-28T12:00:00Z");
const noAds: Parameters<typeof buildProfit>[2] = { rows: [], configured: false, error: null };
const run = (raws: RawOrder[], ads = noAds) => buildProfit(raws.map(normalize), SEP, ads, { now: NOW });
const r2 = (x: number) => Math.round(x * 100) / 100;

describe("unit costs", () => {
  it("per variant", () => {
    expect(unitCost("Door Shock Absorbers", "16 Piece - Full Car (Recommended)")).toBe(112);
    expect(unitCost("Door Shock Absorbers", "8 Piece - Half Car")).toBe(56);
    expect(unitCost("Car Door Protector - Latch Cover", "4pcs - For 1 Car")).toBe(55);
    expect(unitCost("Car Door Protector - Latch Cover", "8pcs - For 2 Cars")).toBe(110);
    expect(unitCost("Mystery Item", null)).toBeNull();
  });
});

describe("order economics (cash incl. GST, then GST settled)", () => {
  it("prepaid delivered: GST shown separately; profit in pocket = ex-GST profit", () => {
    const t = run([order({ at: "2026-09-05T06:00:00Z", outcome: "delivered" })]).totals;
    expect(t.collected).toBe(699);
    expect(t.cogs).toBe(112);
    expect(t.shipping).toBe(67.5);
    expect(t.gateway).toBe(5.59); // 0.8% of 699
    expect(t.packaging).toBe(10);
    expect(t.gstOutput).toBe(106.63); // 699 − 699/1.18
    expect(t.gstInput).toBe(r2(67.5 * (18 / 118) + 5.592 * (18 / 118) + 10 * (10 / 110))); // 12.06
    expect(t.netGst).toBe(r2(t.gstOutput - t.gstInput));
    expect(t.profit).toBe(r2(699 - 112 - 67.5 - 5.592 - 10 - (t.gstOutput - t.gstInput)));
    // same as the ex-GST view: 592.37 − 112 − 57.20 − 4.74 − 9.09
    expect(t.profit).toBeCloseTo(409.34, 1);
  });

  it("COD delivered adds the ₹40 COD charge and the 1.2% partial-COD fee", () => {
    const t = run([order({ at: "2026-09-05T06:00:00Z", cod: true, outcome: "delivered" })]).totals;
    expect(t.shipping).toBe(107.5);
    expect(t.gateway).toBe(8.39); // 1.2% of 699
  });

  it("RTO: ₹99 advance kept, goods restocked, freight both ways, packaging and fee lost", () => {
    const t = run([order({ at: "2026-09-05T06:00:00Z", cod: true, outcome: "rto" })]).totals;
    expect(t.collected).toBe(99);
    expect(t.gstOutput).toBe(15.1);
    expect(t.cogs).toBe(0);
    expect(t.shipping).toBe(135);
    expect(t.packaging).toBe(10);
    expect(t.gateway).toBe(8.39);
    expect(t.rto).toBe(1);
    expect(t.profit).toBeLessThan(0);
  });

  it("COD cancelled before shipping: advance kept, only the fee spent", () => {
    const t = run([order({ at: "2026-09-05T06:00:00Z", cod: true, outcome: "cancel" })]).totals;
    expect(t.collected).toBe(99);
    expect(t.shipping).toBe(0);
    expect(t.packaging).toBe(0);
    expect(t.profit).toBe(r2(83.9 - 8.388 / 1.18));
  });

  it("pending COD counted at the recent delivery rate; excluded from confirmed profit", () => {
    const history = [
      ...Array.from({ length: 8 }, () => order({ at: "2026-08-20T06:00:00Z", cod: true, outcome: "delivered" })),
      ...Array.from({ length: 2 }, () => order({ at: "2026-08-21T06:00:00Z", cod: true, outcome: "rto" })),
    ];
    const pending = order({ at: "2026-09-25T06:00:00Z", cod: true, outcome: "transit" });
    const d = run([...history, pending]);
    expect(d.deliveryRate).toBe(0.8);
    const delivered = run([order({ at: "2026-09-25T06:00:00Z", cod: true, outcome: "delivered" })]).totals.profit;
    const rto = run([order({ at: "2026-09-25T06:00:00Z", cod: true, outcome: "rto" })]).totals.profit;
    expect(d.totals.profit).toBeCloseTo(0.8 * delivered + 0.2 * rto, 1);
    expect(d.totals.confirmedProfit).toBe(0);
    expect(d.totals.pending).toBe(1);
  });

  it("every profit figure — final and confirmed — is after paying net GST", () => {
    const history = Array.from({ length: 10 }, () => order({ at: "2026-08-20T06:00:00Z", cod: true, outcome: "delivered" }));
    const settled = [
      order({ at: "2026-09-05T06:00:00Z", outcome: "delivered" }),
      order({ at: "2026-09-05T07:00:00Z", cod: true, outcome: "rto" }),
    ];
    const d = run([...history, ...settled, order({ at: "2026-09-06T06:00:00Z", cod: true, outcome: "transit" })]);
    const s = run([...history, ...settled]).totals; // same month without the pending order
    const afterGst = (r: typeof s) => r2(r.collected - r.cogs - r.shipping - r.gateway - r.packaging - r.ads - r.netGst);
    expect(d.totals.profit).toBe(afterGst(d.totals));
    expect(s.profit).toBe(afterGst(s));
    expect(d.totals.confirmedProfit).toBe(s.profit); // confirmed = settled orders only, after GST
    for (const row of [...d.days, ...d.products]) expect(row.profit).toBeCloseTo(afterGst(row), 1);
  });

  it("ad spend per product per day from the sheet; unknown products flagged", () => {
    const ads = {
      configured: true,
      error: null,
      rows: [
        { date: "2026-09-05", product: "Door Shock Absorbers", spend: 300 },
        { date: "2026-09-05", product: "latch cover", spend: 100 },
        { date: "2026-09-06", product: "Old campaign", spend: 50 },
      ],
    };
    const d = run(
      [order({ at: "2026-09-05T06:00:00Z", outcome: "delivered" }), order({ at: "2026-09-05T07:00:00Z", outcome: "delivered", title: "Car Door Protector - Latch Cover", variant: "4pcs - For 1 Car", total: 599 })],
      ads,
    );
    expect(d.products.find((p) => p.key === "Door Shock Absorbers")!.adSpend).toBe(300);
    expect(d.products.find((p) => p.key.startsWith("Car Door"))!.adSpend).toBe(100);
    expect(d.totals.adSpend).toBe(450);
    expect(d.totals.ads).toBe(531); // paid incl. 18% GST
    expect(d.gst.input.ads).toBe(81);
    expect(d.days.find((x) => x.key === "2026-09-06")!.adSpend).toBe(50);
    // ads reduce profit by the spend only (the GST is credited back)
    const without = run([order({ at: "2026-09-05T06:00:00Z", outcome: "delivered" }), order({ at: "2026-09-05T07:00:00Z", outcome: "delivered", title: "Car Door Protector - Latch Cover", variant: "4pcs - For 1 Car", total: 599 })]);
    expect(r2(without.totals.profit - d.totals.profit)).toBe(450);
    expect(d.ads.unassigned).toEqual([{ product: "Old campaign", spend: 50 }]);
    expect(d.gst.net).toBe(r2(d.gst.output - d.gst.input.total));
  });

  it("orders count on the IST day they were placed", () => {
    const d = run([order({ at: "2026-09-05T19:00:00Z", outcome: "delivered" })]); // 6 Sep 00:30 IST
    expect(d.days.find((x) => x.key === "2026-09-06")!.orders).toBe(1);
  });
});

describe("sheet parsing", () => {
  it("reads Date | Product | Spend with Indian dates and ₹ amounts", () => {
    const csv = 'Date,Product,Spend\n01/09/2026,Door Shock Absorbers,"₹1,250.50"\n2026-09-02,Car Door Protector,800\n3 Sep 2026,Door Shock Absorbers,0\nnot a date,x,1\n';
    expect(parseAdSpend(csv)).toEqual([
      { date: "2026-09-01", product: "Door Shock Absorbers", spend: 1250.5 },
      { date: "2026-09-02", product: "Car Door Protector", spend: 800 },
      { date: "2026-09-03", product: "Door Shock Absorbers", spend: 0 },
    ]);
    expect(parseDate("5-Sep-26")).toBe("2026-09-05");
  });

  it("reads one column per product and ignores the Total column", () => {
    const now = new Date("2026-09-28T00:00:00Z");
    const csv = [
      'Date,Door Shock Absorbers,Car Door Protector,Total',
      '29/08/2026,4700,,4700',
      '05/09/2026,"₹7,455","₹5,533","₹12,988"',
      'Sep-6,10850,5180,16030',
    ].join("\n");
    expect(parseAdSpend(csv, now)).toEqual([
      { date: "2026-08-29", product: "Door Shock Absorbers", spend: 4700 },
      { date: "2026-09-05", product: "Door Shock Absorbers", spend: 7455 },
      { date: "2026-09-05", product: "Car Door Protector", spend: 5533 },
      { date: "2026-09-06", product: "Door Shock Absorbers", spend: 10850 },
      { date: "2026-09-06", product: "Car Door Protector", spend: 5180 },
    ]);
  });

  it("strips 'Ad Spend (ex GST)' from product headers and handles dates without a year", () => {
    const now = new Date("2026-09-28T00:00:00Z");
    const csv = 'Date,"Door Shock Absorbers Ad Spend\n(ex GST)",Car Door Protector Ad Spend (ex GST),Total Spend\n29-Aug,4700,0,4700\n';
    expect(parseAdSpend(csv, now)).toEqual([{ date: "2026-08-29", product: "Door Shock Absorbers", spend: 4700 }]);
    expect(parseDate("15-Jan", new Date("2026-12-20T00:00:00Z"))).toBe("2026-01-15");
    expect(parseDate("25-Dec", new Date("2027-01-05T00:00:00Z"))).toBe("2026-12-25");
  });
});
