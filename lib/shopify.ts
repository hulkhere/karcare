import "server-only";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-07";

import { assembleJsonl, type RawOrder } from "./raw";

/** Everything the app needs per order. Runs as a Shopify bulk export (no rate limits). */
const bulkOrdersQuery = (from: Date, to: Date) => `{
  orders(query: "created_at:>='${from.toISOString()}' created_at:<'${to.toISOString()}'") {
    edges { node {
      id name createdAt cancelledAt test displayFinancialStatus paymentGatewayNames tags
      totalPriceSet { shopMoney { amount } }
      totalTaxSet { shopMoney { amount } }
      totalReceivedSet { shopMoney { amount } }
      shippingAddress { firstName lastName city province provinceCode }
      billingAddress { firstName lastName city province provinceCode }
      refunds { createdAt }
      transactions { kind status gateway amountSet { shopMoney { amount } } }
      shippingLines { edges { node { id discountedPriceSet { shopMoney { amount } } } } }
      lineItems { edges { node { id title variantTitle quantity sku
        originalUnitPriceSet { shopMoney { amount } } discountedTotalSet { shopMoney { amount } } } } }
      fulfillments { id status displayStatus deliveredAt updatedAt createdAt
        trackingInfo { number company url }
        events { edges { node { id status happenedAt } } } }
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

/** Start a bulk export of orders created in [from, to). Returns the operation id. */
export async function startOrdersExport(from: Date, to: Date): Promise<string> {
  const data = await shopifyGraphQL<{
    bulkOperationRunQuery: { bulkOperation: { id: string } | null; userErrors: { message: string }[] };
  }>(
    `mutation Run($q: String!) { bulkOperationRunQuery(query: $q) { bulkOperation { id status } userErrors { field message } } }`,
    { q: bulkOrdersQuery(from, to) },
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
