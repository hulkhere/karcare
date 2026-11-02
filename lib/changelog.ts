/**
 * Business change log — shown on the Changes tab for the monthly review.
 * Add an entry whenever a cost, price, product, packaging rule, GST code or calculation rule changes.
 * Newest entries can go anywhere; the page sorts by date.
 */

export type ChangeCategory = "product" | "cost" | "price" | "packaging" | "fees" | "gst" | "invoicing" | "ads";
export type Affects = "Profit" | "Invoices" | "GST" | "Ad sheet";

export interface Change {
  /** Effective date (IST), YYYY-MM-DD */
  date: string;
  category: ChangeCategory;
  title: string;
  detail?: string;
  /** Before → after values. Omit `from` for something new. */
  changes?: { label: string; from?: string; to: string }[];
  affects: Affects[];
  /** e.g. when the exact date wasn't recorded */
  note?: string;
}

export const CATEGORY_LABEL: Record<ChangeCategory, string> = {
  product: "New product",
  cost: "Product cost",
  price: "Selling price",
  packaging: "Packaging",
  fees: "Shipping & fees",
  gst: "GST / HSN",
  invoicing: "Invoicing rule",
  ads: "Ad spend",
};

export const CHANGES: Change[] = [
  {
    date: "2026-08-01",
    category: "invoicing",
    title: "GST invoice series starts",
    detail:
      "Invoices are dated and numbered on the day money is received: prepaid on the order date, COD on the delivery date, and the non-refundable ₹99 COD advance on the cancellation / RTO date. One continuous series, restarting every 1 April.",
    changes: [
      { label: "First invoice", to: "KC/26-27/0001" },
      { label: "Retained COD advance", to: "Invoiced at 18%, SAC 9997" },
    ],
    affects: ["Invoices", "GST"],
  },
  {
    date: "2026-08-01",
    category: "fees",
    title: "Base shipping, fees and packaging",
    detail: "Standard costs used for every order. RTO pays freight both ways; the COD charge applies to delivered COD orders only.",
    changes: [
      { label: "Shiprocket freight (each way)", to: "₹67.50 incl. GST" },
      { label: "COD charge", to: "₹40 incl. GST" },
      { label: "Fastrr fee — prepaid (UPI)", to: "0.8% incl. GST" },
      { label: "Fastrr fee — partial COD", to: "1.2% of order value" },
      { label: "Packaging", to: "₹10 per order" },
      { label: "Meta ads", to: "Spend + 18% GST (credited back)" },
    ],
    affects: ["Profit"],
  },
  {
    date: "2026-08-20",
    category: "product",
    title: "Door Shock Absorbers launched",
    changes: [
      { label: "8 Piece cost", to: "₹56 (₹7 per piece)" },
      { label: "16 Piece cost", to: "₹112" },
      { label: "HSN", to: "8708 — motor vehicle parts" },
    ],
    affects: ["Profit", "Invoices"],
  },
  {
    date: "2026-09-04",
    category: "product",
    title: "Car Door Protector – Latch Cover launched",
    changes: [
      { label: "4pcs cost", to: "₹55" },
      { label: "8pcs cost", to: "₹110" },
      { label: "HSN", to: "8708" },
    ],
    affects: ["Profit", "Invoices", "Ad sheet"],
  },
  {
    date: "2026-09-24",
    category: "product",
    title: "Blind Spot Side Mirrors launched",
    changes: [
      { label: "Frameless cost", to: "₹25" },
      { label: "Black Frame (pair) cost", to: "₹50" },
      { label: "HSN", to: "7009 — rear-view mirrors for vehicles" },
    ],
    affects: ["Profit", "Invoices", "Ad sheet"],
  },
  {
    date: "2026-10-22",
    category: "product",
    title: "Car Seat Headrest Double Hook launched",
    changes: [
      { label: "Pack of 2 cost", to: "₹50" },
      { label: "Pack of 4 cost", to: "₹100" },
      { label: "HSN", to: "3924 — household articles of plastics" },
    ],
    affects: ["Profit", "Invoices"],
  },
  {
    date: "2026-10-22",
    category: "packaging",
    title: "Bigger packaging for headrest hooks",
    detail: "An order pays the larger of ₹10 and its hooks' packaging. Every other order stays at ₹10.",
    changes: [
      { label: "Hook Pack of 2", to: "₹10" },
      { label: "Hook Pack of 4", from: "₹10", to: "₹20" },
      { label: "2 × Pack of 2, or Pack of 4 + another product", to: "₹20" },
    ],
    affects: ["Profit"],
  },
  {
    date: "2026-10-26",
    category: "cost",
    title: "Blind Spot Side Mirrors: framed only, sold in packs",
    detail: "From order #3411. Older orders keep their own variants and costs.",
    changes: [
      { label: "Pack of 2 - For 1 Car (₹699)", from: "Black Frame ₹50", to: "₹50" },
      { label: "Pack of 4 - For 2 Cars (₹999)", to: "₹100" },
    ],
    affects: ["Profit"],
  },
  {
    date: "2026-10-27",
    category: "product",
    title: "Frameless Blind Spot Side Mirrors — separate product",
    detail: "Tracked separately from the framed mirrors. No ad spend column (no ads planned).",
    changes: [
      { label: "Pack of 2 (₹499) cost", to: "₹25" },
      { label: "Pack of 4 (₹699) cost", to: "₹50" },
      { label: "HSN", to: "7009" },
    ],
    affects: ["Profit", "Invoices"],
  },
  {
    date: "2026-10-27",
    category: "price",
    title: "Car Door Protector selling price up",
    changes: [
      { label: "4pcs - For 1 Car", from: "₹599", to: "₹699" },
      { label: "8pcs - For 2 Cars", from: "₹799", to: "₹999" },
    ],
    affects: ["Profit"],
    note: "Seen in Shopify on 27 Oct — exact change date not recorded",
  },
  {
    date: "2026-10-31",
    category: "cost",
    title: "Car Door Protector cost up",
    detail: "Applies to orders placed from 31 Oct 2026 (IST). Earlier orders keep the old cost.",
    changes: [
      { label: "4pcs - For 1 Car", from: "₹55", to: "₹80" },
      { label: "8pcs - For 2 Cars", from: "₹110", to: "₹160" },
    ],
    affects: ["Profit"],
  },
];

/** Current Shopify variants, used to show today's costs on the Changes tab (looked up live from lib/costs.ts). */
export const CURRENT_VARIANTS: { product: string; variant: string; price: number }[] = [
  { product: "Door Shock Absorbers", variant: "8 Piece - All Doors", price: 499 },
  { product: "Door Shock Absorbers", variant: "16 Piece - Full Car (Recommended)", price: 699 },
  { product: "Car Door Protector - Latch Cover", variant: "4pcs - For 1 Car", price: 699 },
  { product: "Car Door Protector - Latch Cover", variant: "8pcs - For 2 Cars", price: 999 },
  { product: "Blind Spot Side Mirrors", variant: "Pack of 2 - For 1 Car", price: 699 },
  { product: "Blind Spot Side Mirrors", variant: "Pack of 4 - For 2 Cars", price: 999 },
  { product: "Frameless Blind Spot Side Mirrors", variant: "Pack of 2", price: 499 },
  { product: "Frameless Blind Spot Side Mirrors", variant: "Pack of 4 - Bestseller", price: 699 },
  { product: "Car Seat Headrest Double Hook", variant: "Pack of 2", price: 699 },
  { product: "Car Seat Headrest Double Hook", variant: "Pack of 4 - Best Seller", price: 999 },
];
