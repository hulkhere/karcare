import { COSTS, exGst, unitCost } from "./costs";
import { istParts, monthRangeUTC } from "./dates";
import { GST_RATE } from "./constants";
import { allocate, fromPaise, toPaise } from "./gst";
import type { normalize } from "./orders";

type Normalized = ReturnType<typeof normalize>;
type YM = { month: number; year: number };

export interface AdRow {
  date: string; // YYYY-MM-DD (IST calendar day)
  product: string;
  spend: number; // ex-GST, as shown in Meta Ads Manager
}

/**
 * Money for a slice of business, as cash: amounts actually collected / paid, including GST.
 * GST is then settled separately (output on sales minus input credit on costs), and what's
 * left is profit in pocket (before income tax).
 */
export interface Pnl {
  collected: number; // from customers, incl. GST
  cogs: number; // product cost (no GST credit)
  shipping: number; // freight + COD charge paid, incl. GST
  gateway: number; // Fastrr fees paid, incl. GST
  packaging: number; // incl. GST
  ads: number; // Meta ads paid, incl. 18% GST
  adSpend: number; // Meta "amount spent" (ex-GST), for ROAS
  gstOutput: number; // GST payable on sales
  gstInput: number; // GST credit on shipping, fees, packaging, ads
  netGst: number; // gstOutput − gstInput
  profit: number; // collected − all costs − netGst
}

export interface Counts {
  orders: number;
  units: number;
  delivered: number;
  rto: number;
  cancelled: number;
  pending: number;
}

export type ProfitStatus = "Delivered" | "Prepaid" | "RTO" | "Cancelled" | "Pending";

export interface ProfitRow extends Pnl, Counts {
  key: string; // day (YYYY-MM-DD) or product title
  /** Profit from orders whose outcome is known (pending COD excluded), after all ads */
  confirmedProfit: number;
}

export interface ProfitData {
  month: number;
  year: number;
  deliveryRate: number; // COD orders that get delivered (0–1), used for pending COD
  deliveryRateSample: number;
  totals: ProfitRow;
  days: ProfitRow[];
  products: ProfitRow[];
  gst: {
    output: number;
    input: { shipping: number; gateway: number; packaging: number; ads: number; total: number };
    net: number;
  };
  ads: { configured: boolean; error: string | null; unassigned: { product: string; spend: number }[] };
  missingCosts: string[];
  syncedAt: string;
}

/** What one scenario of an order costs (GST-inclusive amounts, COGS as-is). */
interface Scenario {
  revenueIncl: number;
  cogs: number[]; // per line
  freightIncl: number;
  codIncl: number;
  gatewayIncl: number;
  packagingIncl: number;
}

function scenarios(o: Normalized) {
  const cod = o.paymentType === "COD";
  const gatewayIncl = o.total * (cod ? COSTS.gatewayPartialCod : COSTS.gatewayPrepaid);
  const unitCosts = o.lineItems.map((l) => (unitCost(l.title, l.variantTitle) ?? 0) * l.quantity);
  const refunded = o.financialStatus === "REFUNDED";
  const zero = o.lineItems.map(() => 0);
  const delivered: Scenario = {
    revenueIncl: refunded ? 0 : o.total,
    cogs: unitCosts,
    freightIncl: COSTS.freight,
    codIncl: cod ? COSTS.codCharge : 0,
    gatewayIncl,
    packagingIncl: COSTS.packaging,
  };
  // Returned to origin: goods come back to stock, but freight is paid both ways.
  const rto: Scenario = {
    revenueIncl: cod ? o.received : refunded ? 0 : o.total,
    cogs: zero,
    freightIncl: COSTS.freight * 2,
    codIncl: 0,
    gatewayIncl,
    packagingIncl: COSTS.packaging,
  };
  // Cancelled before shipping: only the advance kept (COD) and the gateway fee.
  const cancelled: Scenario = {
    revenueIncl: cod ? o.received : 0,
    cogs: zero,
    freightIncl: 0,
    codIncl: 0,
    gatewayIncl,
    packagingIncl: 0,
  };
  return { delivered, rto, cancelled };
}

function statusOf(o: Normalized): ProfitStatus {
  if (o.outcome === "RTO") return "RTO";
  if (o.outcome === "Cancelled") return "Cancelled";
  if (o.paymentType === "COD") return o.outcome === "Delivered" ? "Delivered" : "Pending";
  return o.outcome === "Delivered" ? "Delivered" : "Prepaid"; // prepaid: revenue is certain
}

const MONEY = ["collected", "cogs", "shipping", "gateway", "packaging", "ads", "adSpend", "gstOutput", "gstInput", "netGst", "profit", "confirmedProfit"] as const;

const emptyRow = (key: string): ProfitRow => ({
  key, collected: 0, cogs: 0, shipping: 0, gateway: 0, packaging: 0, ads: 0, adSpend: 0,
  gstOutput: 0, gstInput: 0, netGst: 0, profit: 0, confirmedProfit: 0,
  orders: 0, units: 0, delivered: 0, rto: 0, cancelled: 0, pending: 0,
});

const dayOf = (iso: string) => {
  const { year, month, day } = istParts(iso);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Share of settled COD orders (delivered vs returned) from the last `days` days. */
export function codDeliveryRate(orders: Normalized[], now: Date, days = 75) {
  const from = new Date(now.getTime() - days * 864e5).toISOString();
  const settled = orders.filter(
    (o) => o.paymentType === "COD" && !o.isTest && o.createdAt >= from && (o.outcome === "Delivered" || o.outcome === "RTO"),
  );
  const delivered = settled.filter((o) => o.outcome === "Delivered").length;
  return { rate: settled.length >= 10 ? delivered / settled.length : 0.75, sample: settled.length };
}

/**
 * Profit for orders placed in the month, day by day and product by product.
 * Orders count on the day they were placed (when the ad money was spent).
 * Pending COD orders are counted at the recent delivery rate.
 */
export function buildProfit(
  all: Normalized[],
  ym: YM,
  ads: { rows: AdRow[]; configured: boolean; error: string | null },
  opts: { now?: Date; syncedAt?: string } = {},
): ProfitData {
  const now = opts.now ?? new Date();
  const range = monthRangeUTC(ym.month, ym.year);
  const start = range.start.toISOString();
  const end = range.end.toISOString();
  const { rate: p, sample } = codDeliveryRate(all, now);

  const days = new Map<string, ProfitRow>();
  const products = new Map<string, ProfitRow>();
  const totals = emptyRow("total");
  const gstIn = { shipping: 0, gateway: 0, packaging: 0, ads: 0 };
  const missing = new Set<string>();
  const row = (map: Map<string, ProfitRow>, key: string) => {
    if (!map.has(key)) map.set(key, emptyRow(key));
    return map.get(key)!;
  };

  // Every day of the month up to today, so days with only ad spend still show
  for (let t = range.start.getTime(); t < Math.min(range.end.getTime(), now.getTime()); t += 864e5) {
    row(days, dayOf(new Date(t).toISOString()));
  }

  for (const o of all) {
    if (o.isTest || o.createdAt < start || o.createdAt >= end || o.lineItems.length === 0) continue;
    const status = statusOf(o);
    const s = scenarios(o);
    const mix: [Scenario, number][] =
      status === "Delivered" || status === "Prepaid" ? [[s.delivered, 1]]
      : status === "RTO" ? [[s.rto, 1]]
      : status === "Cancelled" ? [[s.cancelled, 1]]
      : [[s.delivered, p], [s.rto, 1 - p]];

    o.lineItems.forEach((l) => {
      if (unitCost(l.title, l.variantTitle) === null) missing.add(`${l.title}${l.variantTitle ? ` (${l.variantTitle})` : ""}`);
    });

    // Split order-level amounts across its products by line value
    const weights = o.lineItems.map((l) => toPaise(l.discountedTotal || l.originalUnitPrice * l.quantity));
    const share = (amount: number) => allocate(toPaise(amount), weights).map(fromPaise);

    const gstPart = (incl: number, rate: number) => incl - exGst(incl, rate);
    const lines = o.lineItems.map(() => ({ collected: 0, cogs: 0, shipping: 0, gateway: 0, packaging: 0, gstOutput: 0, gstInput: 0 }));
    for (const [sc, w] of mix) {
      const shipIncl = sc.freightIncl + sc.codIncl;
      const col = share(sc.revenueIncl * w);
      const out = share(gstPart(sc.revenueIncl, GST_RATE) * w);
      const ship = share(shipIncl * w);
      const gw = share(sc.gatewayIncl * w);
      const pack = share(sc.packagingIncl * w);
      const inShip = gstPart(shipIncl, COSTS.shippingGstRate) * w;
      const inGw = gstPart(sc.gatewayIncl, COSTS.gatewayGstRate) * w;
      const inPack = gstPart(sc.packagingIncl, COSTS.packagingGstRate) * w;
      const inp = share(inShip + inGw + inPack);
      lines.forEach((ln, i) => {
        ln.collected += col[i];
        ln.cogs += sc.cogs[i] * w;
        ln.shipping += ship[i];
        ln.gateway += gw[i];
        ln.packaging += pack[i];
        ln.gstOutput += out[i];
        ln.gstInput += inp[i];
      });
      gstIn.shipping += inShip;
      gstIn.gateway += inGw;
      gstIn.packaging += inPack;
    }

    const day = row(days, dayOf(o.createdAt));
    const counted = new Set<ProfitRow>();
    const addCounts = (r: ProfitRow, units: number) => {
      r.units += units;
      if (counted.has(r)) return;
      counted.add(r);
      r.orders++;
      if (status === "Delivered" || status === "Prepaid") r.delivered++;
      else if (status === "RTO") r.rto++;
      else if (status === "Cancelled") r.cancelled++;
      else r.pending++;
    };
    o.lineItems.forEach((l, i) => {
      const ln = lines[i];
      const netGst = ln.gstOutput - ln.gstInput;
      const profit = ln.collected - ln.cogs - ln.shipping - ln.gateway - ln.packaging - netGst;
      for (const r of [day, row(products, l.title), totals]) {
        r.collected += ln.collected;
        r.cogs += ln.cogs;
        r.shipping += ln.shipping;
        r.gateway += ln.gateway;
        r.packaging += ln.packaging;
        r.gstOutput += ln.gstOutput;
        r.gstInput += ln.gstInput;
        r.netGst += netGst;
        r.profit += profit;
        if (status !== "Pending") r.confirmedProfit += profit;
        addCounts(r, l.quantity);
      }
    });
  }

  // Ad spend: per product per day from the sheet, matched to Shopify product titles
  const titles = [...products.keys()];
  const unassigned = new Map<string, number>();
  for (const a of ads.rows) {
    if (a.date < dayOf(start) || a.date >= dayOf(end) || !a.spend) continue;
    const key = norm(a.product);
    const title = titles.find((t) => key && (norm(t).includes(key) || key.includes(norm(t))));
    // You pay spend + 18% GST; the GST comes back as input credit, so profit drops by the spend.
    const gst = a.spend * (COSTS.adsGstRate / 100);
    for (const r of [row(days, a.date), title ? products.get(title)! : null, totals]) {
      if (!r) continue;
      r.adSpend += a.spend;
      r.ads += a.spend + gst;
      r.gstInput += gst;
      r.netGst -= gst;
      r.profit -= a.spend;
      r.confirmedProfit -= a.spend;
    }
    if (!title) unassigned.set(a.product || "(blank)", (unassigned.get(a.product || "(blank)") ?? 0) + a.spend);
    gstIn.ads += gst;
  }

  const round = (r: ProfitRow): ProfitRow => {
    const out = { ...r };
    for (const k of MONEY) {
      out[k] = Math.round(r[k] * 100) / 100;
    }
    return out;
  };
  const r2 = (n: number) => Math.round(n * 100) / 100;

  return {
    month: ym.month,
    year: ym.year,
    deliveryRate: p,
    deliveryRateSample: sample,
    totals: round(totals),
    days: [...days.values()].sort((a, b) => a.key.localeCompare(b.key)).map(round),
    products: [...products.values()].sort((a, b) => b.collected - a.collected).map(round),
    gst: {
      output: r2(totals.gstOutput),
      input: {
        shipping: r2(gstIn.shipping),
        gateway: r2(gstIn.gateway),
        packaging: r2(gstIn.packaging),
        ads: r2(gstIn.ads),
        total: r2(totals.gstInput),
      },
      net: r2(totals.netGst),
    },
    ads: {
      configured: ads.configured,
      error: ads.error,
      unassigned: [...unassigned].map(([product, spend]) => ({ product, spend })),
    },
    missingCosts: [...missing],
    syncedAt: opts.syncedAt ?? now.toISOString(),
  };
}
