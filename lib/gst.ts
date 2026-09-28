import { GST_DIVISOR, GST_RATE, SELLER_PROVINCE_CODES } from "./constants";

export const STATE_CODES: Record<string, string> = {
  AP: "37", AR: "12", AS: "18", BR: "10", CG: "22",
  GA: "30", GJ: "24", HR: "06", HP: "02", JH: "20",
  KA: "29", KL: "32", MP: "23", MH: "27", MN: "14",
  ML: "17", MZ: "15", NL: "13", OR: "21", PB: "03",
  RJ: "08", SK: "11", TN: "33", TS: "36", TR: "16",
  UP: "09", UK: "05", WB: "19", DL: "07", JK: "01",
  LA: "38", CH: "04", DN: "26", DD: "25", AN: "35",
  LD: "31", PY: "34",
  // Alternate codes Shopify / ISO may use
  TG: "36", UT: "05", OD: "21", CT: "22",
};

export function stateCodeFor(provinceCode: string | null | undefined): string | null {
  if (!provinceCode) return null;
  return STATE_CODES[provinceCode.toUpperCase()] ?? null;
}

export function isIntraState(provinceCode: string | null | undefined) {
  return !!provinceCode && SELLER_PROVINCE_CODES.includes(provinceCode.toUpperCase());
}

export const toPaise = (rupees: number | string) => Math.round(Number(rupees) * 100);
export const fromPaise = (paise: number) => paise / 100;

/** Taxable value (paise) contained in a GST-inclusive amount (paise). */
export function taxableFromInclusive(inclusivePaise: number) {
  return Math.round(inclusivePaise / GST_DIVISOR);
}

/**
 * Split an inclusive total into taxable + tax. If Shopify's own tax figure is
 * present and agrees with an 18% back-calculation (within ₹1), it is used;
 * otherwise the tax is computed.
 */
export function splitInclusive(totalPaise: number, shopifyTaxPaise?: number | null) {
  const computedTax = totalPaise - taxableFromInclusive(totalPaise);
  const useShopify =
    shopifyTaxPaise != null && shopifyTaxPaise > 0 && Math.abs(shopifyTaxPaise - computedTax) <= 100;
  const tax = useShopify ? shopifyTaxPaise! : computedTax;
  return { taxable: totalPaise - tax, tax, source: useShopify ? "shopify" : "computed" } as const;
}

/** CGST gets the extra paisa on odd amounts (e.g. 106.63 → 53.32 + 53.31). */
export function splitCgstSgst(taxPaise: number) {
  const cgst = Math.ceil(taxPaise / 2);
  return { cgst, sgst: taxPaise - cgst };
}

export const HALF_RATE = GST_RATE / 2;

/**
 * Distribute `totalPaise` across items proportionally to `weights`,
 * so that the parts always sum exactly to the total.
 */
export function allocate(totalPaise: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  const w = sum > 0 ? weights : weights.map(() => 1);
  const wSum = sum > 0 ? sum : w.length;
  const raw = w.map((x) => (totalPaise * x) / wSum);
  const parts = raw.map(Math.floor);
  let remainder = totalPaise - parts.reduce((a, b) => a + b, 0);
  // Largest-remainder method
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder--) parts[order[k].i]++;
  return parts;
}
