export const SELLER = {
  legalName: "AMUDA VISHNU BHUPATHI",
  tradeName: "Colossal Brands",
  brandName: "KarCare",
  gstin: "36CGRPV1014Q1ZN",
  address: "H.No.13-212/G, Nagarjuna Colony",
  city: "Tupran",
  district: "Medak",
  state: "Telangana",
  stateCode: "36",
  pin: "502334",
  phone: "7674937893",
} as const;

export const GST_RATE = 18;
export const GST_DIVISOR = 1 + GST_RATE / 100;
/** HSN for motor vehicle parts & accessories */
export const PRODUCT_HSN = "8708";
/** SAC for goods transport / courier services charged as shipping */
export const SHIPPING_SAC = "9965";

export const INVOICE_PREFIX = "KC";

/** Province codes Shopify may return for Telangana (TS, and ISO's newer TG). */
export const SELLER_PROVINCE_CODES = ["TS", "TG"];

/** Orders below this total (₹) are treated as test orders. */
export const TEST_ORDER_MAX_AMOUNT = 50;

/**
 * How far back (days) to look for COD orders that were placed before the
 * selected month but delivered during it.
 */
export const COD_LOOKBACK_DAYS = 90;
