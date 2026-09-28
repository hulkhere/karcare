import { describe, expect, it } from "vitest";
import { closeMonth, ensureClosed, draftFirstNumber, type ArchiveDeps } from "../lib/archive";
import { hsnSummaryCsv, registerCsv, stateSummaryCsv } from "../lib/export";
import type { RawOrder } from "../lib/shopify";
import type { KV } from "../lib/store";

const money = (a: number) => ({ shopMoney: { amount: String(a), currencyCode: "INR" } });

function memStore(): KV & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (k) => (data.has(k) ? structuredClone(data.get(k)) : null) as never,
    setIfAbsent: async (k, v) => (data.has(k) ? false : (data.set(k, structuredClone(v)), true)),
  };
}

let n = 0;
function order(o: { createdAt: string; cod?: boolean; deliveredAt?: string; status?: string; total?: number }): RawOrder {
  n++;
  return {
    id: `gid://shopify/Order/${n}`, name: `#${1000 + n}`, createdAt: o.createdAt, cancelledAt: null, test: false,
    displayFinancialStatus: o.cod ? "PARTIALLY_PAID" : "PAID", displayFulfillmentStatus: "FULFILLED",
    paymentGatewayNames: [], totalPriceSet: money(o.total ?? 699), totalTaxSet: money(0), subtotalPriceSet: null,
    totalShippingPriceSet: money(0), shippingLines: { edges: [] },
    shippingAddress: { firstName: "A", lastName: "B", address1: "x", address2: null, city: "Pune", province: "Maharashtra", provinceCode: "MH", country: "India", zip: "411001", phone: "999" },
    billingAddress: null,
    lineItems: { edges: [{ node: { title: "Cover", variantTitle: null, quantity: 1, sku: null, originalUnitPriceSet: money(o.total ?? 699), discountedTotalSet: money(o.total ?? 699) } }] },
    fulfillments: o.status ? [{ status: "SUCCESS", displayStatus: o.status, deliveredAt: o.deliveredAt ?? null, inTransitAt: null, createdAt: o.createdAt, trackingInfo: [] }] : [],
    tags: [],
  };
}

function deps(orders: RawOrder[], now: string, store = memStore(), startMonth = 8, startYear = 2026): ArchiveDeps & { store: ReturnType<typeof memStore> } {
  return {
    store,
    now: () => new Date(now),
    config: { startMonth, startYear, startNumber: 1 },
    fetchRaw: async (from, to) =>
      orders.filter((o) => new Date(o.createdAt) >= from && new Date(o.createdAt) < to),
  };
}

describe("archive", () => {
  it("numbers continuously across months with no gaps", async () => {
    const orders = [
      order({ createdAt: "2026-08-03T05:00:00Z" }),
      order({ createdAt: "2026-08-10T05:00:00Z" }),
      order({ createdAt: "2026-08-20T05:00:00Z", cod: true, status: "DELIVERED", deliveredAt: "2026-08-25T05:00:00Z" }),
      order({ createdAt: "2026-08-30T05:00:00Z", cod: true, status: "DELIVERED", deliveredAt: "2026-09-03T05:00:00Z" }),
      order({ createdAt: "2026-09-05T05:00:00Z" }),
    ];
    const d = deps(orders, "2026-10-02T00:00:00Z");
    const [sep, aug] = await ensureClosed(d);
    expect(aug.invoices.map((i) => i.number)).toEqual(["KC/26-27/001", "KC/26-27/002", "KC/26-27/003"]);
    // COD placed Aug 30, delivered Sep 3 → September; prepaid Sep 5 after it
    expect(sep.invoices.map((i) => [i.number, i.orderName])).toEqual([
      ["KC/26-27/004", orders[3].name],
      ["KC/26-27/005", orders[4].name],
    ]);
  });

  it("is frozen once closed, even if Shopify data changes later", async () => {
    const orders = [order({ createdAt: "2026-08-03T05:00:00Z" })];
    const d = deps(orders, "2026-09-01T02:00:00Z");
    const first = await closeMonth(d, { month: 8, year: 2026 });
    orders.push(order({ createdAt: "2026-08-04T05:00:00Z" }));
    orders[0].displayFinancialStatus = "REFUNDED";
    const again = await closeMonth(d, { month: 8, year: 2026 });
    expect(again).toEqual(first);
  });

  it("never closes the current month", async () => {
    const d = deps([], "2026-08-31T12:00:00Z"); // still August in IST
    await expect(closeMonth(d, { month: 8, year: 2026 })).rejects.toThrow("hasn't ended");
    expect(await ensureClosed(d)).toEqual([]);
  });

  it("closes on 1st of the month IST, not UTC", async () => {
    const d = deps([], "2026-08-31T18:45:00Z"); // 1 Sep 00:15 IST
    expect((await ensureClosed(d)).map((s) => s.key)).toEqual(["2026-08"]);
  });

  it("invoices a COD delivery that was recorded after its month closed", async () => {
    const late = order({ createdAt: "2026-08-28T05:00:00Z", cod: true, status: "IN_TRANSIT" });
    const orders = [order({ createdAt: "2026-08-03T05:00:00Z" }), late];
    const store = memStore();
    await ensureClosed(deps(orders, "2026-09-01T02:00:00Z", store));
    // Courier updates later: delivered on Aug 31
    late.fulfillments[0].displayStatus = "DELIVERED";
    late.fulfillments[0].deliveredAt = "2026-08-31T10:00:00Z";
    const [sep] = await ensureClosed(deps(orders, "2026-10-01T02:00:00Z", store));
    expect(sep.invoices.map((i) => i.orderName)).toEqual([late.name]);
    expect(sep.invoices[0].number).toBe("KC/26-27/002");
    expect(sep.invoices[0].date).toBe("2026-08-31T18:30:00.000Z"); // 1 Sep IST
    expect(sep.lateOrders).toEqual([late.name]);
  });

  it("restarts numbering in April (new financial year)", async () => {
    const orders = [order({ createdAt: "2027-03-10T05:00:00Z" }), order({ createdAt: "2027-04-02T05:00:00Z" })];
    const d = deps(orders, "2027-05-01T00:00:00Z", memStore(), 3, 2027);
    const [apr, mar] = await ensureClosed(d);
    expect(mar.invoices[0].number).toBe("KC/26-27/001");
    expect(apr.invoices[0].number).toBe("KC/27-28/001");
  });

  it("drafts for the open month continue from the last closed month", async () => {
    const orders = [order({ createdAt: "2026-08-03T05:00:00Z" }), order({ createdAt: "2026-08-04T05:00:00Z" })];
    expect(await draftFirstNumber(deps(orders, "2026-09-15T00:00:00Z"), { month: 9, year: 2026 })).toBe(3);
  });

  it("exports CA files with matching totals", async () => {
    const orders = [order({ createdAt: "2026-08-03T05:00:00Z" }), order({ createdAt: "2026-08-04T05:00:00Z", total: 1299 })];
    const [aug] = await ensureClosed(deps(orders, "2026-09-02T00:00:00Z"));
    const reg = registerCsv(aug.invoices);
    expect(reg).toContain("KC/26-27/001");
    expect(reg.trim().split("\r\n").at(-1)).toContain("1998.00");
    expect(stateSummaryCsv(aug.invoices)).toContain("Maharashtra,27,18,2");
    expect(hsnSummaryCsv(aug.invoices)).toContain("8708");
    expect(reg).not.toContain("999"); // no phone numbers
  });
});
