/**
 * Unit costs used by the Profit tab. Amounts marked "incl. GST" are what you pay;
 * the GST part is claimed back as input credit, so profit uses the ex-GST value.
 */
export const COSTS = {
  /** Shiprocket freight per shipment, each way (RTO return costs the same). Incl. 18% GST. */
  freight: 67.5,
  /** Shiprocket COD charge, on delivered COD orders. Incl. 18% GST. */
  codCharge: 40,
  shippingGstRate: 18,

  /** Packaging per shipped order, any quantity. Incl. ~10% blended GST. */
  packaging: 10,
  packagingGstRate: 10,

  /**
   * Fastrr (PayU) payment fees, incl. 18% GST. Shopify doesn't record UPI vs card,
   * so prepaid uses the UPI rate (most prepaid orders are UPI).
   */
  gatewayPrepaid: 0.008,
  /** Partial COD: charged on the full order value when the advance is paid. */
  gatewayPartialCod: 0.012,
  gatewayGstRate: 18,

  /** GST added on top of Meta ad spend (claimed back). */
  adsGstRate: 18,
};

/**
 * Product catalogue. To add a product: add an entry here with its Shopify name,
 * a pattern that matches that name, its HSN code and its cost per unit sold.
 */
export const CATALOG: {
  name: string;
  match: RegExp;
  hsn: string;
  /** Cost of one unit of the given variant (ex-GST, no input credit). null = unknown variant. */
  cost: (variant: string | null, pieces: number) => number | null;
}[] = [
  {
    name: "Door Shock Absorbers",
    match: /door shock absorber/i,
    hsn: "8708",
    cost: (_v, pieces) => (Number.isFinite(pieces) ? pieces * 7 : null), // ₹7 per piece: 8pc ₹56, 16pc ₹112
  },
  {
    name: "Car Door Protector - Latch Cover",
    match: /door protector|latch cover/i,
    hsn: "8708",
    cost: (_v, pieces) => (pieces === 4 ? 55 : pieces === 8 ? 110 : Number.isFinite(pieces) ? pieces * 13.75 : null),
  },
  {
    name: "Blind Spot Side Mirrors",
    match: /blind spot/i,
    hsn: "7009", // 7009 10 00 — rear-view mirrors for vehicles (18%)
    cost: (variant) => (/frameless/i.test(variant ?? "") ? 25 : /frame/i.test(variant ?? "") ? 50 : null),
  },
];

export const catalogEntry = (title: string) => CATALOG.find((c) => c.match.test(title));

/** Cost of goods per unit, by product and variant. Returns null if unknown. */
export function unitCost(title: string, variant: string | null): number | null {
  const pieces = Number(/(\d+)\s*(?:pc|pcs|piece|pieces)\b/i.exec(variant ?? "")?.[1] ?? NaN);
  return catalogEntry(title)?.cost(variant, pieces) ?? null;
}

export const exGst = (inclusive: number, rate: number) => inclusive / (1 + rate / 100);
