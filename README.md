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

\*One of the two auth options. The app needs the **`read_orders`** and **`read_all_orders`** scopes (the latter for orders older than 60 days), plus **`read_reports`** for product-page visits (CVR on the Profit tab — without it CVR shows "–" and everything else works).

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

To number invoices in order, the app needs every order since the start of the series. They're kept **in the browser** (IndexedDB) so nothing is downloaded twice:

- **First visit in a browser** – one Shopify **bulk export** of the whole series (10–40 seconds), saved locally.
- **Every visit after that** – the saved orders show instantly and every tab and month is computed in the browser. In the background the app asks Shopify only for orders **changed since the last sync** (new orders, deliveries, RTOs and cancellations all update the order) — usually 1–2 seconds — and merges them in. If a lot changed (over ~200 orders), it uses a bulk export for just those.
- **Refresh** – fetches changes now. **Reload everything** – downloads the whole series again (only if something looks off).
- The Profit tab also reads the ad-spend sheet (cached 2 minutes) and product-page visits (cached 10 minutes).

## Tabs

- **Orders** – orders placed in the month plus earlier orders paid in it, with delivery status and invoice number. Filters: search (order #, invoice #, customer, city, AWB), invoice status, payment, delivery status, state; delivery-status chips filter too.
- **CA Export** – the standard rules with counts, the month's number range, and one button that downloads a ZIP for the CA: all invoices in one PDF, each invoice as its own PDF, invoice register, state-wise and HSN summaries (CSV).
- **GST Summary** – state-wise and HSN totals for GSTR-1 (filter: prepaid / COD delivered / advances retained), plus orders not invoiced this month and why.
- **Profit** – cash collected, every cost as paid, GST payable / input credit / net GST, and profit in pocket — overall, by product and by day. The day-by-day table also shows each product's final profit per day (after GST and that product's ad spend), with its ROAS and CVR in small text underneath. **Daily trends** charts revenue, ROAS and CVR for complete days (today is left out), for all products or one, with the last full day compared to the day before.
- **Changes** – a dated log of every cost, selling-price, product, packaging, GST-code and rule change (filter by month for the monthly review), plus today's rates read live from `lib/costs.ts`. Add an entry to `lib/changelog.ts` with every such change.
- **Insights** – orders placed, prepaid vs COD, delivered / RTO / cancelled with RTO rate, orders per product, and GST per product.

## Profit

Orders count on the day they're placed (the day the ad money was spent). Amounts are shown as cash — collected and paid **including GST** — then GST is settled separately: GST payable on sales minus input credit on shipping (18%), Fastrr fees (18%), packaging (~10%) and Meta ads (18%). What's left is **profit in pocket**, before income tax only.

| Outcome | Revenue | Product cost | Shipping | Packaging | Fastrr fee |
|---|---|---|---|---|---|
| Delivered / prepaid | full order | per variant | ₹67.50 (+ ₹40 COD charge) | ₹10 | 0.8% UPI / 1.2% partial COD |
| RTO | ₹99 advance | ₹0 (restocked) | ₹67.50 × 2 | ₹10 | fee lost |
| Cancelled before shipping | ₹99 advance | ₹0 | ₹0 | ₹0 | fee lost |

COD orders still in transit are counted at the recent COD delivery rate; **Confirmed profit** leaves them out. All rates are in `lib/costs.ts`.

- **ROAS** = collected ÷ ad spend from the sheet (ex-GST, as in Ads Manager). Shows "–" until that day's spend is entered.
- **CVR** = orders ÷ visits that landed on the product's page (Shopify analytics, by landing page). Checkout runs on Fastrr, so Shopify's own conversion rate can't see these orders. Each product's page is matched by its handle in `lib/costs.ts` — add `handle` when adding a product.

### Products

| Shopify product | Cost per unit | HSN |
|---|---|---|
| Door Shock Absorbers | ₹7 per piece (8pc ₹56, 16pc ₹112) | 8708 |
| Car Door Protector - Latch Cover | 4pcs ₹80, 8pcs ₹160 for orders placed from 31 Oct 2026 (before: ₹55 / ₹110) | 8708 |
| Blind Spot Side Mirrors | Pack of 2 ₹50, Pack of 4 ₹100 (older orders: Frameless ₹25, Black Frame ₹50) | 7009 (rear-view mirrors for vehicles) |
| Frameless Blind Spot Side Mirrors | Pack of 2 ₹25, Pack of 4 ₹50 | 7009 |
| Car Seat Headrest Double Hook | Pack of 2 ₹50, Pack of 4 ₹100 | 3924 |

**Packaging** is ₹10 per order, except when a product needs more: headrest hooks Pack of 2 ₹10, Pack of 4 ₹20 per pack — an order pays the larger of ₹10 and its hooks' packaging (Pack of 4 → ₹20, 2 × Pack of 2 → ₹20, Pack of 4 + Door Shock Absorbers → ₹20).

**Adding a product:** add an entry to `CATALOG` in `lib/costs.ts` (Shopify name, a matching pattern, HSN, cost per unit), then add a column for it in the ad-spend sheet. Until a product is in the catalogue, the Profit tab shows a red "no product cost" warning for it.

### Ad spend sheet

One tab named **Ad spend**, one row per day, one column per product:

| Date | Door Shock Absorbers | Car Door Protector | Blind Spot Mirror | Total |
|---|---|---|---|---|
| 01/10/2026 | 6000 | 8000 | 1500 | 15500 |
| 02/10/2026 | 5800 | 8200 | 2000 | 16000 |

- **Date**: DD/MM/YYYY ("29-Aug" and "1 Sep 2026" also work).
- **Product columns**: header = the Shopify product name or its key words — every word in the header must appear in the product name (singular/plural doesn't matter), e.g. "Blind Spot Mirror" → Blind Spot Side Mirrors. Avoid one-word headers like "Door". For a new product, insert a column before Total. A header that matches no product is counted in the total and flagged.
- **Values**: "Amount spent" from Meta Ads Manager, **without** the 18% GST. Blank = no spend. ₹ and commas are fine.
- **Total**: optional (e.g. `=SUM(B2:C2)`) — the app ignores it.

(A long layout — `Date | Product | Spend`, one row per product per day — is also accepted.)

Publish it: File → Share → Publish to web → choose the **Ad spend** tab → **Comma-separated values (.csv)** → Publish. Copy the link into `GOOGLE_SHEET_CSV_URL` in Vercel and redeploy. Anyone with that link can read the sheet, so don't put anything else in it.

## Structure

- `lib/orders.ts` – money-event rules, numbering (`buildMonth`) and invoice maths — pure and unit-tested
- `lib/shopify.ts` – Shopify auth, bulk export, changed-orders query, landing-page visits; `lib/raw.ts` – export parsing
- `lib/orderStore.ts` – the browser's saved copy of orders and the sync (full / changes only); `lib/useMonthData.ts` – computes each tab's view from it
- `app/api/sync` – start a sync (changed orders straight back, or a bulk export id) / poll the export; `app/api/export` – a finished export, in pages; `app/api/adspend`, `app/api/sessions` – ad spend sheet and product-page visits
- `lib/trend.ts`, `components/TrendChart.tsx` – daily revenue / ROAS / CVR
- `lib/export.ts` – register / state-wise / HSN / product summaries
- `lib/profit.ts`, `lib/costs.ts`, `lib/sheet.ts` – profit maths, unit costs, ad-spend sheet
- `components/InvoicePDF.tsx` – PDF template; PDFs and the ZIP are built in the browser
- `middleware.ts` – password gate
