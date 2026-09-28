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
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | prod | Upstash Redis for the monthly archive. Added automatically by Vercel → Storage → Upstash Redis. Locally, `.data/` is used instead |
| `CRON_SECRET` | prod | Any long random string; Vercel Cron sends it when closing each month |
| `ARCHIVE_START_MONTH` / `ARCHIVE_START_NUMBER` | no | First archived month and its first invoice number (default `2026-08` / `1`) |

\*One of the two auth options. The app needs the **`read_orders`** and **`read_all_orders`** scopes (the latter for orders older than 60 days).

On Vercel, add the same variables under Project → Settings → Environment Variables. Never commit `.env.local`.

## Invoice rules

- **Prepaid** (`PAID`, non-COD gateway): always invoiced, dated at order creation, in the month the order was placed.
- **COD** (`PARTIALLY_PAID`, or any order whose payment gateways include "COD"/"Cash on Delivery"): invoiced only when the fulfillment's `displayStatus` is `DELIVERED`, dated at `deliveredAt`, and in the **month of delivery**. The app looks back 90 days of orders to catch COD orders placed earlier but delivered in the selected month.
- **Skipped**: cancelled, voided, refunded, test orders (total < ₹50, a `test` tag, or Shopify test orders), and other payment states (pending, authorized, partially refunded, …).
- **GST is inclusive at 18%.** Taxable value = total / 1.18. Shopify's `totalTaxSet` is used when it agrees with that (within ₹1). Telangana buyers (`TS`/`TG`) → CGST 9% + SGST 9%; everyone else → IGST 18%.
- **Totals always match Shopify's `totalPriceSet`** (i.e. after discounts). Shipping becomes its own line (SAC 9965); the rest is allocated across products in proportion to their discounted line totals.
- **Numbering**: `KC/{FY}/{NNN}`, assigned in order of invoice date, continuing from the previous month and restarting at 001 every April.

## Monthly archive

On the 1st of every month (06:00 IST, via Vercel Cron — and also whenever the Archive tab or a finished month is opened) the previous month is **closed**: every qualifying order gets a final invoice number and the result is stored permanently. Closed months never change, so numbers can't shift or be skipped.

The **Archive** tab offers, per month: a CA package ZIP (merged PDF, individual PDFs, invoice register CSV, state-wise summary CSV, HSN summary CSV), plus each file separately.

- A COD order delivered in a closed month but only updated in Shopify afterwards is invoiced in the next month (dated the 1st), so it's never missed.
- Refunds or cancellations after a month closes don't alter its invoices — raise a credit note with your CA.
- For the month in progress, the dashboard only produces **draft** PDFs with provisional numbers.

## Structure

- `app/api/orders` – fetch + classify a month's orders
- `app/api/generate-invoices` – re-fetches, re-checks eligibility server-side, returns invoice data
- `lib/orders.ts` – eligibility rules and invoice maths
- `components/InvoicePDF.tsx` – `@react-pdf/renderer` template (rendered in the browser)
- `lib/archive.ts` – month closing and numbering
- `app/api/archive` – archive listing and downloads; `app/api/cron/close-month` – monthly cron
- `middleware.ts` – password gate
