/** Order shape as assembled from Shopify's bulk export (see lib/shopify.ts). */
type Money = { shopMoney: { amount: string } };

export interface RawAddress {
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
}

export interface RawOrder {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  test: boolean;
  displayFinancialStatus: string | null;
  paymentGatewayNames: string[];
  tags: string[];
  totalPriceSet: Money;
  totalTaxSet: Money | null;
  totalReceivedSet: Money | null;
  shippingAddress: RawAddress | null;
  billingAddress: RawAddress | null;
  refunds: { createdAt: string }[];
  transactions: { kind: string; status: string; gateway: string | null; amountSet: Money }[];
  shippingLines: { discountedPriceSet: Money }[];
  lineItems: {
    title: string;
    variantTitle: string | null;
    quantity: number;
    sku: string | null;
    originalUnitPriceSet: Money;
    discountedTotalSet: Money;
  }[];
  fulfillments: {
    id: string;
    status: string;
    displayStatus: string | null;
    deliveredAt: string | null;
    updatedAt: string;
    createdAt: string;
    trackingInfo: { number: string | null; company: string | null; url: string | null }[];
    events: { status: string; happenedAt: string }[];
  }[];
}

/** Rebuild orders from bulk-export JSONL: child rows (line items, events…) go back under their parents. */
export function assembleJsonl(text: string): RawOrder[] {
  const orders = new Map<string, RawOrder>();
  const fulfillments = new Map<string, RawOrder["fulfillments"][number]>();
  const children: { parent: string; row: Record<string, unknown> }[] = [];

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row.__parentId) {
      children.push({ parent: row.__parentId, row });
    } else if (String(row.id).startsWith("gid://shopify/Order/")) {
      const o = { ...row, lineItems: [], shippingLines: [] } as RawOrder;
      o.fulfillments = (row.fulfillments ?? []).map((f: RawOrder["fulfillments"][number]) => {
        const withEvents = { ...f, events: [] as RawOrder["fulfillments"][number]["events"] };
        fulfillments.set(f.id, withEvents);
        return withEvents;
      });
      orders.set(o.id, o);
    }
  }
  for (const { parent, row } of children) {
    const id = String(row.id ?? "");
    if (id.includes("/LineItem/")) orders.get(parent)?.lineItems.push(row as never);
    else if (id.includes("/ShippingLine/")) orders.get(parent)?.shippingLines.push(row as never);
    else if (id.includes("/FulfillmentEvent/")) fulfillments.get(parent)?.events.push(row as never);
  }
  return [...orders.values()];
}
