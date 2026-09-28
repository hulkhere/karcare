# KarCare GST Invoice Generator

Private Next.js app that pulls Shopify orders for a month, shows delivery status, and generates GST-compliant PDF invoices (merged PDF + ZIP of individual files).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
npm test                     # unit tests for tax / numbering / eligibility
```

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `SHOPIFY_STORE` | yes | `1t2gmb-fi.myshopify.com` |
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | yes* | Dev Dashboard app credentials; exchanged for a short-lived token automatically |
| `SHOPIFY_ACCESS_TOKEN` | yes* | Alternative: static `shpat_…` token (takes precedence) |
| `APP_PASSWORD` | prod | Password for the login screen. Without it, production requests are refused |
| `SHOPIFY_API_VERSION` | no | Default `2026-07` |

\*One of the two auth options. The app needs the **`read_orders`** and **`read_all_orders`** scopes (the latter for orders older than 60 days).

On Vercel, add the same variables under Project → Settings → Environment Variables. Never commit `.env.local`.

## Invoice rules

- **Prepaid** (`PAID`, non-COD gateway): always invoiced, dated at order creation, in the month the order was placed.
- **COD** (`PARTIALLY_PAID`, or any order whose payment gateways include "COD"/"Cash on Delivery"): invoiced only when the fulfillment's `displayStatus` is `DELIVERED`, dated at `deliveredAt`, and in the **month of delivery**. The app looks back 90 days of orders to catch COD orders placed earlier but delivered in the selected month.
- **Skipped**: cancelled, voided, refunded, test orders (total < ₹50, a `test` tag, or Shopify test orders), and other payment states (pending, authorized, partially refunded, …).
- **GST is inclusive at 18%.** Taxable value = total / 1.18. Shopify's `totalTaxSet` is used when it agrees with that (within ₹1). Telangana buyers (`TS`/`TG`) → CGST 9% + SGST 9%; everyone else → IGST 18%.
- **Totals always match Shopify's `totalPriceSet`** (i.e. after discounts). Shipping becomes its own line (SAC 9965); the rest is allocated across products in proportion to their discounted line totals.
- **Numbering**: `KC/{FY}/{NNN}`, assigned in order of invoice date, starting from the "Starting invoice number" on the dashboard. The success message tells you where to start next month.

## Structure

- `app/api/orders` – fetch + classify a month's orders
- `app/api/generate-invoices` – re-fetches, re-checks eligibility server-side, returns invoice data
- `lib/orders.ts` – eligibility rules and invoice maths
- `components/InvoicePDF.tsx` – `@react-pdf/renderer` template (rendered in the browser)
- `middleware.ts` – password gate
