export type PaymentType = "Prepaid" | "COD" | "Other";

/** Where an order lands for the selected month. */
export type Bucket =
  | "invoiceable" // qualifies for an invoice this month
  | "pending_cod" // COD not yet delivered
  | "other_month" // COD delivered, but invoiced in a different month
  | "skipped"; // cancelled / refunded / test / unpaid etc.

export interface Address {
  name: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  provinceCode: string;
  country: string;
  zip: string;
  phone: string;
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
  inTransitAt: string | null;
  shippedAt: string | null;
  tracking: { number: string | null; company: string | null; url: string | null } | null;
}

export interface Order {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  paymentGateways: string[];
  paymentType: PaymentType;
  total: number;
  shopifyTax: number;
  shipping: number;
  address: Address | null;
  lineItems: LineItem[];
  delivery: Delivery;
  tags: string[];
  isTest: boolean;
  // Classification for the selected month
  bucket: Bucket;
  reason: string;
  invoiceDate: string | null;
  /** Tax (₹) if invoiced — for summaries */
  tax: number;
}

export interface OrdersResponse {
  month: number;
  year: number;
  range: { start: string; end: string };
  orders: Order[];
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
  date: string; // ISO
  orderId: string;
  orderName: string;
  paymentType: PaymentType;
  buyer: Address | null;
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
