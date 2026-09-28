import "server-only";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-07";

export const ORDERS_QUERY = /* GraphQL */ `
  query Orders($first: Int!, $query: String!, $after: String) {
    orders(first: $first, query: $query, after: $after, reverse: true) {
      edges {
        cursor
        node {
          id
          name
          createdAt
          cancelledAt
          test
          displayFinancialStatus
          displayFulfillmentStatus
          paymentGatewayNames
          totalPriceSet { shopMoney { amount currencyCode } }
          totalTaxSet { shopMoney { amount } }
          subtotalPriceSet { shopMoney { amount } }
          totalShippingPriceSet { shopMoney { amount } }
          shippingLines(first: 5) {
            edges { node { title discountedPriceSet { shopMoney { amount } } } }
          }
          shippingAddress {
            firstName lastName address1 address2 city province provinceCode country zip phone
          }
          billingAddress {
            firstName lastName address1 address2 city province provinceCode country zip phone
          }
          lineItems(first: 20) {
            edges {
              node {
                title
                variantTitle
                quantity
                sku
                originalUnitPriceSet { shopMoney { amount } }
                discountedTotalSet { shopMoney { amount } }
              }
            }
          }
          fulfillments(first: 5) {
            status
            displayStatus
            deliveredAt
            inTransitAt
            createdAt
            trackingInfo(first: 1) { number company url }
          }
          tags
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

type Money = { shopMoney: { amount: string } };
type RawAddress = {
  firstName: string | null;
  lastName: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
  country: string | null;
  zip: string | null;
  phone: string | null;
} | null;

export interface RawOrder {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  test: boolean;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  paymentGatewayNames: string[];
  totalPriceSet: Money;
  totalTaxSet: Money | null;
  subtotalPriceSet: Money | null;
  totalShippingPriceSet: Money | null;
  shippingLines: { edges: { node: { title: string; discountedPriceSet: Money } }[] };
  shippingAddress: RawAddress;
  billingAddress: RawAddress;
  lineItems: {
    edges: {
      node: {
        title: string;
        variantTitle: string | null;
        quantity: number;
        sku: string | null;
        originalUnitPriceSet: Money;
        discountedTotalSet: Money;
      };
    }[];
  };
  fulfillments: {
    status: string;
    displayStatus: string | null;
    deliveredAt: string | null;
    inTransitAt: string | null;
    createdAt: string;
    trackingInfo: { number: string | null; company: string | null; url: string | null }[];
  }[];
  tags: string[];
}

function store() {
  const s = process.env.SHOPIFY_STORE;
  if (!s) throw new Error("SHOPIFY_STORE is not set");
  return s.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Uses SHOPIFY_ACCESS_TOKEN when set; otherwise exchanges the app's client
 * credentials for a short-lived token (cached in memory until near expiry).
 */
async function accessToken(): Promise<string> {
  if (process.env.SHOPIFY_ACCESS_TOKEN) return process.env.SHOPIFY_ACCESS_TOKEN;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Shopify credentials missing: set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET (or SHOPIFY_ACCESS_TOKEN)",
    );
  }

  const res = await fetch(`https://${store()}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Shopify token request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = JSON.parse(text) as { access_token: string; expires_in?: number };
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return json.access_token;
}

async function shopifyGraphQL<T>(query: string, variables: Record<string, unknown>, attempt = 0): Promise<T> {
  const res = await fetch(`https://${store()}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": await accessToken(),
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (res.status === 401 && !process.env.SHOPIFY_ACCESS_TOKEN && attempt === 0) {
    cachedToken = null; // token may have expired; fetch a fresh one once
    return shopifyGraphQL(query, variables, attempt + 1);
  }
  if (res.status === 429 && attempt < 4) {
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    return shopifyGraphQL(query, variables, attempt + 1);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Shopify API error (${res.status}): ${text.slice(0, 300)}`);

  const json = JSON.parse(text) as {
    data?: T;
    errors?: { message: string; extensions?: { code?: string } }[];
  };
  if (json.errors?.length) {
    if (json.errors.some((e) => e.extensions?.code === "THROTTLED") && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      return shopifyGraphQL(query, variables, attempt + 1);
    }
    throw new Error(`Shopify GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) throw new Error("Shopify returned no data");
  return json.data;
}

/** Fetch every order matching a Shopify search query, following pagination. */
async function fetchOrders(query: string): Promise<RawOrder[]> {
  const orders: RawOrder[] = [];
  let after: string | null = null;

  for (let page = 0; page < 200; page++) {
    const data: {
      orders: { edges: { node: RawOrder }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
    } = await shopifyGraphQL(ORDERS_QUERY, { first: 25, query, after });
    orders.push(...data.orders.edges.map((e) => e.node));
    if (!data.orders.pageInfo.hasNextPage) break;
    after = data.orders.pageInfo.endCursor;
  }
  return orders;
}

const between = (from: Date, to: Date) => `created_at:>='${from.toISOString()}' created_at:<'${to.toISOString()}'`;

/**
 * Orders placed in [start, end), plus shipped COD orders placed in [lookbackFrom, start)
 * (those can be delivered — and therefore invoiced — in this month).
 */
export async function fetchOrdersForMonth(start: Date, end: Date, lookbackFrom: Date, codTag: string) {
  const [month, earlierCod] = await Promise.all([
    fetchOrders(between(start, end)),
    fetchOrders(`${between(lookbackFrom, start)} tag:${codTag} fulfillment_status:shipped`),
  ]);
  return [...month, ...earlierCod];
}
