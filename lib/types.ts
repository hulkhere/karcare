export type PaymentType = "Prepaid" | "COD" | "Other";

/**
 * What an invoice is for:
 * - sale: goods supplied and paid for (prepaid order, or COD delivered)
 * - forfeit: COD order cancelled / not delivered — the non-refundable advance is kept
 */
export type InvoiceKind = "sale" | "forfeit";

/** Where an order lands for the selected month. */
export type Bucket =
  | "invoiceable" // gets its invoice this month
  | "pending_cod" // COD still on its way — no money event yet
  | "other_month" // invoiced (or will be) in a different month
  | "skipped"; // test, cancelled with nothing received, unpaid…

/** What finally happened to an order (for insights). */
export type Outcome = "Delivered" | "In transit" | "Not shipped" | "RTO" | "Cancelled" | "Test";

export interface Address {
  name: string;
  city: string;
  province: string;
  provinceCode: string;
}

export interface LineItem {
  title: string;
  variantTitle: string | null;
  quantity: number;
  sku: string | null;
  originalUnitPrice: number;
  /** Line total after line-level discounts (used only as allocation weight). */
  discountedTotal: number;
}

export interface Delivery {
  /** fulfillment.displayStatus, or null when not shipped */
  status: string | null;
  deliveredAt: string | null;
  /** When the courier reported the delivery as failed (RTO) */
  failedAt: string | null;
  shippedAt: string | null;
  tracking: { number: string | null; company: string | null; url: string | null } | null;
}

/** The money event that triggers an invoice. */
export interface InvoiceEvent {
  kind: InvoiceKind;
  date: string; // ISO
  amount: number; // ₹, GST-inclusive
  why: string; // e.g. "Delivered", "Prepaid", "RTO — advance kept"
}

export interface Order {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  financialStatus: string | null;
  paymentType: PaymentType;
  total: number;
  received: number;
  /** Paid online (for COD: the advance) */
  paidOnline: number;
  shopifyTax: number;
  shipping: number;
  address: Address | null;
  lineItems: LineItem[];
  delivery: Delivery;
  tags: string[];
  isTest: boolean;
  outcome: Outcome;
  event: InvoiceEvent | null;
  // For the selected month
  bucket: Bucket;
  reason: string;
  invoiceNumber: string | null;
}

export interface InvoiceLine {
  description: string;
  variant: string | null;
  code: string; // HSN / SAC
  quantity: number;
  rate: number; // unit price incl. GST
  taxable: number;
}

export interface InvoiceData {
  number: string;
  fileName: string;
  kind: InvoiceKind;
  date: string; // ISO
  orderId: string;
  orderName: string;
  orderDate: string;
  paymentType: PaymentType;
  paymentNote: string;
  buyerName: string;
  placeOfSupply: { state: string; code: string | null };
  intraState: boolean;
  lines: InvoiceLine[];
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  total: number;
  amountInWords: string;
}

export interface MonthData {
  month: number;
  year: number;
  /** Orders placed this month, plus orders from earlier months invoiced this month */
  orders: Order[];
  /** Final invoices for the month, in number order */
  invoices: InvoiceData[];
  /** The number series this month belongs to */
  series: { start: string; firstNumber: number | null; lastNumber: number | null };
  syncedAt: string;
}
