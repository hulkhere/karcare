import "server-only";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-07";

import { assembleJsonl, type RawOrder } from "./raw";

/**
 * Everything the app needs per order. A full load runs as a Shopify bulk export (no rate limits);
 * quick refreshes page through only the orders changed since the last sync.
 * Bulk exports can't include a connection inside a list, so fulfillment events are
 * fetched separately (see fetchFulfillmentEvents).
 */
/** Order fields. `paged` adds the `first:` limits a normal (non-bulk) query needs on connections. */
const orderFields = (paged: boolean) => `
      id name createdAt cancelledAt test displayFinancialStatus paymentGatewayNames tags
      totalPriceSet { shopMoney { amount } }
      totalTaxSet { shopMoney { amount } }
      totalReceivedSet { shopMoney { amount } }
      shippingAddress { firstName lastName city province provinceCode }
      billingAddress { firstName lastName city province provinceCode }
      refunds { createdAt }
      transactions { kind status gateway amountSet { shopMoney { amount } } }
      shippingLines${paged ? "(first: 3)" : ""} { edges { node { id discountedPriceSet { shopMoney { amount } } } } }
      lineItems${paged ? "(first: 25)" : ""} { ${paged ? "pageInfo { hasNextPage } " : ""}edges { node { id title variantTitle quantity sku
        originalUnitPriceSet { shopMoney { amount } } discountedTotalSet { shopMoney { amount } } } } }
      fulfillments { id status displayStatus deliveredAt updatedAt createdAt
        trackingInfo { number company url } }`;

const ordersFilter = (from: Date, to: Date, since?: Date) =>
  `created_at:>='${from.toISOString()}' created_at:<'${to.toISOString()}'${since ? ` updated_at:>='${since.toISOString()}'` : ""}`;

const bulkOrdersQuery = (from: Date, to: Date, since?: Date) => `{
  orders(query: "${ordersFilter(from, to, since)}") {
    edges { node { ${orderFields(false)}
    } }
  }
}`;

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

export interface BulkStatus {
  id: string;
  status: string; // CREATED | RUNNING | COMPLETED | FAILED | CANCELED | EXPIRED …
  errorCode: string | null;
  objectCount: number;
  url: string | null;
}

/**
 * Start a bulk export of orders created in [from, to). With `since`, only orders changed
 * since then (new orders and status updates — a delivery or RTO updates the order too).
 */
export async function startOrdersExport(from: Date, to: Date, since?: Date): Promise<string> {
  const data = await shopifyGraphQL<{
    bulkOperationRunQuery: { bulkOperation: { id: string } | null; userErrors: { message: string }[] };
  }>(
    `mutation Run($q: String!) { bulkOperationRunQuery(query: $q) { bulkOperation { id status } userErrors { field message } } }`,
    { q: bulkOrdersQuery(from, to, since) },
  );
  const { bulkOperation, userErrors } = data.bulkOperationRunQuery;
  if (!bulkOperation) throw new Error(userErrors.map((e) => e.message).join("; ") || "Couldn't start the export");
  return bulkOperation.id;
}

export async function exportStatus(id: string): Promise<BulkStatus> {
  const data = await shopifyGraphQL<{ node: (Omit<BulkStatus, "objectCount"> & { objectCount: string }) | null }>(
    `query Poll($id: ID!) { node(id: $id) { ... on BulkOperation { id status errorCode objectCount url } } }`,
    { id },
  );
  if (!data.node) throw new Error("Export not found");
  return { ...data.node, objectCount: Number(data.node.objectCount) };
}

/** Download a finished export and put child rows (line items, events…) back under their parents. */
export async function downloadOrders(url: string | null): Promise<RawOrder[]> {
  if (!url) return []; // an export with no matching orders has no file
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't download the export (${res.status})`);
  return assembleJsonl(await res.text());
}

const EVENTS_QUERY = `query Events($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Fulfillment { id events(first: 15, sortKey: HAPPENED_AT) { nodes { status happenedAt } } }
  }
}`;

/** Tracking events for the given fulfillments (used to date RTOs exactly). */
export async function fetchFulfillmentEvents(ids: string[]) {
  const out = new Map<string, { status: string; happenedAt: string }[]>();
  for (let i = 0; i < ids.length; i += 25) {
    const data = await shopifyGraphQL<{
      nodes: ({ id: string; events: { nodes: { status: string; happenedAt: string }[] } } | null)[];
    }>(EVENTS_QUERY, { ids: ids.slice(i, i + 25) });
    for (const n of data.nodes) if (n?.events) out.set(n.id, n.events.nodes);
  }
  return out;
}

export interface SessionRow {
  date: string; // YYYY-MM-DD (store time zone, IST)
  path: string;
  sessions: number;
}

/**
 * Visits per landing page per day from Shopify analytics (needs the read_reports permission).
 * Checkout runs on Fastrr, so Shopify can't see conversions itself — the app divides orders by these.
 */
export async function fetchLandingSessions(fromDay: string, toDay: string): Promise<SessionRow[]> {
  const q = `FROM sessions SHOW sessions GROUP BY landing_page_path TIMESERIES day SINCE ${fromDay} UNTIL ${toDay}`;
  const data = await shopifyGraphQL<{
    shopifyqlQuery: { parseErrors: string[]; tableData: { rows: Record<string, string>[] } | null } | null;
  }>(`query Sessions($q: String!) { shopifyqlQuery(query: $q) { parseErrors tableData { rows } } }`, { q });
  const r = data.shopifyqlQuery;
  if (!r) throw new Error("Shopify analytics returned nothing");
  if (r.parseErrors.length) throw new Error(`Shopify analytics: ${r.parseErrors.join("; ")}`);
  return (r.tableData?.rows ?? []).map((row) => ({
    date: String(row.day).slice(0, 10),
    path: String(row.landing_page_path ?? ""),
    sessions: Number(row.sessions) || 0,
  }));
}

type Edges<T> = { edges: { node: T }[] };
type PagedOrder = Omit<RawOrder, "lineItems" | "shippingLines" | "fulfillments"> & {
  lineItems: Edges<RawOrder["lineItems"][number]> & { pageInfo: { hasNextPage: boolean } };
  shippingLines: Edges<RawOrder["shippingLines"][number]>;
  fulfillments: Omit<RawOrder["fulfillments"][number], "events">[];
};

/**
 * Orders created in [from, to) and changed since `since`, via normal paged queries — a second or two
 * for the handful of orders that change between visits. Returns null when there are more than
 * `maxOrders` (or an order has too many lines), so the caller falls back to a bulk export.
 */
export async function fetchChangedOrders(from: Date, to: Date, since: Date, maxOrders = 200): Promise<RawOrder[] | null> {
  const out: RawOrder[] = [];
  let after: string | null = null;
  for (;;) {
    const data: {
      orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: PagedOrder[] };
    } = await shopifyGraphQL(
      `query Changed($q: String!, $after: String) {
        orders(first: 20, after: $after, query: $q, sortKey: UPDATED_AT) {
          pageInfo { hasNextPage endCursor }
          nodes { ${orderFields(true)} }
        }
      }`,
      { q: ordersFilter(from, to, since), after },
    );
    for (const n of data.orders.nodes) {
      if (n.lineItems.pageInfo.hasNextPage) return null;
      out.push({
        ...n,
        lineItems: n.lineItems.edges.map((e) => e.node),
        shippingLines: n.shippingLines.edges.map((e) => e.node),
        fulfillments: n.fulfillments.map((f) => ({ ...f, events: [] })),
      });
    }
    if (!data.orders.pageInfo.hasNextPage) return out;
    if (out.length >= maxOrders) return null;
    after = data.orders.pageInfo.endCursor;
  }
}
