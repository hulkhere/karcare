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
| `GOOGLE_SHEET_CSV_URL` | for Profit | Published CSV link of the ad-spend sheet (see below) |

\*One of the two auth options. The app needs the **`read_orders`** and **`read_all_orders`** scopes (the latter for orders older than 60 days).

On Vercel, add the same variables under Project → Settings → Environment Variables. Never commit `.env.local`.

## Invoice rules

An invoice is created **on the day money is received**, and every invoice gets the next number in one continuous series — `KC/{FY}/{NNNN}`, starting at 0001 in August 2026 and restarting at 0001 every 1 April. Numbers are computed automatically and can't be edited.

| Situation | Invoice date | Amount |
|---|---|---|
| Prepaid order | order date | full order total |
| COD delivered | delivery date | full order total (the ₹99 advance + cash collected) |
| COD refused / returned (RTO) | date Shopify records the failed delivery | the advance received (non-refundable) |
| COD cancelled before shipping | cancellation date | the advance received (non-refundable) |

- COD orders still in transit get no invoice until one of the above happens.
- No invoice: test orders (under ₹50, tagged "test", or Shopify test orders), prepaid orders cancelled/refunded in the same month they were placed, cancellations where nothing was received.
- A refund or return *after* an invoice doesn't change it (the CA issues a credit note), so past numbers never shift.
- **GST is inclusive at 18%.** Telangana buyers (`TS`/`TG`) → CGST 9% + SGST 9%; everyone else → IGST 18%. Products use HSN 8708, shipping SAC 9965, and the retained advance SAC 9997 (`FORFEIT_SAC` in `lib/constants.ts` — confirm with your CA).
- COD orders are recognised by the "Cash on Delivery (COD)" payment method, the `PPCOD` tag, or partially-paid status.
- Export a month a couple of days after it ends, so courier updates for its last days are in.

## How data is loaded

To number invoices in order, the app counts every order since the start of the series. It uses a Shopify **bulk export** (one request, no rate limits, typically 10–40 seconds), reused for 30 minutes across tabs and months; **Refresh** pulls a fresh one.

## Tabs

- **Orders** – orders placed in the month plus earlier orders paid in it, with delivery status and invoice number. Filters: search (order #, invoice #, customer, city, AWB), invoice status, payment, delivery status, state; delivery-status chips filter too.
- **CA Export** – the standard rules with counts, the month's number range, and one button that downloads a ZIP for the CA: all invoices in one PDF, each invoice as its own PDF, invoice register, state-wise and HSN summaries (CSV).
- **GST Summary** – state-wise and HSN totals for GSTR-1 (filter: prepaid / COD delivered / advances retained), plus orders not invoiced this month and why.
- **Profit** – profit for orders placed in the month, by product and by day, after product cost, shipping, Fastrr fees, packaging and Meta ads (all ex-GST), plus estimated net GST.
- **Insights** – orders placed, prepaid vs COD, delivered / RTO / cancelled with RTO rate, orders per product, and GST per product.

## Profit

Orders count on the day they're placed (the day the ad money was spent). Everything is ex-GST — GST paid on costs is input credit.

| Outcome | Revenue | Product cost | Shipping | Packaging | Fastrr fee |
|---|---|---|---|---|---|
| Delivered / prepaid | order ÷ 1.18 | per variant | ₹67.50 (+ ₹40 COD charge) | ₹10 | 0.8% UPI / 1.2% partial COD |
| RTO | ₹99 advance ÷ 1.18 | ₹0 (restocked) | ₹67.50 × 2 | ₹10 | fee lost |
| Cancelled before shipping | ₹99 advance ÷ 1.18 | ₹0 | ₹0 | ₹0 | fee lost |

COD orders still in transit are counted at the recent COD delivery rate; **Confirmed profit** leaves them out. All rates and product costs are in `lib/costs.ts`.

### Ad spend sheet

One tab named **Ad spend**, one row per product per day:

| Date | Product | Spend |
|---|---|---|
| 01/09/2026 | Door Shock Absorbers | 2500 |
| 01/09/2026 | Car Door Protector | 1500 |

- **Date**: DD/MM/YYYY (2026-09-01 and "1 Sep 2026" also work).
- **Product**: the Shopify product name, or a clear part of it ("Door Shock Absorbers", "Car Door Protector"). Unmatched names are counted in the total and flagged.
- **Spend**: "Amount spent" from Meta Ads Manager, **without** the 18% GST. Numbers only (₹ and commas are fine).

Publish it: File → Share → Publish to web → choose the **Ad spend** tab → **Comma-separated values (.csv)** → Publish. Copy the link into `GOOGLE_SHEET_CSV_URL` in Vercel and redeploy. Anyone with that link can read the sheet, so don't put anything else in it.

## Structure

- `lib/orders.ts` – money-event rules, numbering (`buildMonth`) and invoice maths — pure and unit-tested
- `lib/shopify.ts` – Shopify auth and bulk export; `lib/raw.ts` – export parsing
- `app/api/sync` – start / poll the export; `app/api/month` – a month's orders and invoices
- `lib/export.ts` – register / state-wise / HSN / product summaries
- `lib/profit.ts`, `lib/costs.ts`, `lib/sheet.ts` – profit maths, unit costs, ad-spend sheet
- `components/InvoicePDF.tsx` – PDF template; PDFs and the ZIP are built in the browser
- `middleware.ts` – password gate
