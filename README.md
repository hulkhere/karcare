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
- **COD** (`PARTIALLY_PAID`, or any order whose payment gateways include "COD"/"Cash on Delivery"): invoiced only when the fulfillment's `displayStatus` is `DELIVERED`, dated at `deliveredAt`, and in the **month of delivery**. The app also checks shipped COD orders (tag `PPCOD`) from the previous 90 days to catch ones placed earlier but delivered in the selected month.
- **Skipped**: cancelled, voided, refunded, test orders (total < ₹50, a `test` tag, or Shopify test orders), and other payment states (pending, authorized, partially refunded, …).
- **GST is inclusive at 18%.** Taxable value = total / 1.18. Shopify's `totalTaxSet` is used when it agrees with that (within ₹1). Telangana buyers (`TS`/`TG`) → CGST 9% + SGST 9%; everyone else → IGST 18%.
- **Totals always match Shopify's `totalPriceSet`** (i.e. after discounts). Shipping becomes its own line (SAC 9965); the rest is allocated across products in proportion to their discounted line totals.
- **Numbering**: `KC/{FY}/{NNN}`, assigned in order of invoice date from the first number shown on the CA Export tab (suggested automatically; 001 every April).

## Tabs

- **Orders** – every order for the month with its delivery status and invoice status. Filter by search (order #, customer, city, AWB), invoice status, payment type, delivery status and state; click a delivery-status chip to filter.
- **CA Export** – pick a month (defaults to last month). The standard rules below are applied automatically; one click downloads a ZIP for the CA with all invoices in one PDF, each invoice as its own PDF, the invoice register, a state-wise summary and an HSN summary (CSV). The first invoice number is suggested from the previous month's export (remembered in this browser) so numbers continue without gaps.
- **GST Summary** – state-wise and HSN figures for GSTR-1, filterable by payment type, plus the list of orders that aren't invoiced and why.

## Structure

- `app/api/orders` – fetch + classify a month's orders
- `app/api/generate-invoices` – applies the standard rules server-side and returns numbered invoice data
- `lib/orders.ts` – eligibility rules and invoice maths
- `lib/export.ts` – register / state-wise / HSN CSVs
- `components/InvoicePDF.tsx` – `@react-pdf/renderer` template; PDFs and the ZIP are built in the browser
- `middleware.ts` – password gate
