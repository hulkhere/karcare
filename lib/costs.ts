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

/** Cost of goods per unit, by product and variant. Returns null if unknown. */
export function unitCost(title: string, variant: string | null): number | null {
  const pieces = Number(/(\d+)\s*(?:pc|pcs|piece|pieces)\b/i.exec(variant ?? "")?.[1] ?? NaN);
  if (/door shock absorber/i.test(title)) return Number.isFinite(pieces) ? pieces * 7 : null;
  if (/door protector|latch cover/i.test(title)) {
    if (pieces === 4) return 55;
    if (pieces === 8) return 110;
    return Number.isFinite(pieces) ? pieces * 13.75 : null;
  }
  return null;
}

export const exGst = (inclusive: number, rate: number) => inclusive / (1 + rate / 100);
