"use client";

import { Suspense } from "react";
import { LoadState } from "@/components/LoadState";
import { MonthPicker } from "@/components/MonthPicker";
import { Alert, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { COSTS } from "@/lib/costs";
import { formatDateIST, monthLabel } from "@/lib/dates";
import { formatINR } from "@/lib/invoice";
import type { ProfitData, ProfitRow } from "@/lib/profit";
import { useMonthData } from "@/lib/useMonthData";

const r = (n: number) => `${n < 0 ? "−" : ""}₹${formatINR(Math.abs(n))}`;
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
const thBase = "whitespace-nowrap px-3 py-2.5 text-xs font-medium text-slate-500";
const th = `${thBase} text-right`;
const thL = `${thBase} text-left`;
const td = "whitespace-nowrap px-3 py-2.5 text-right tabular-nums";
const tone = (n: number) => (n < 0 ? "text-rose-700" : "text-emerald-700");

const sales = (t: ProfitRow) => t.collected - t.gstOutput; // sales ex-GST, for margins

function Line({ label, value, base, strong, muted, bar = true }: {
  label: string; value: number; base: number; strong?: boolean; muted?: boolean; bar?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 text-sm ${strong ? "font-semibold" : ""}`}>
      <div className={`w-60 shrink-0 ${muted ? "text-slate-500" : "text-slate-700"}`}>{label}</div>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        {bar && (
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${value >= 0 ? "bg-slate-800" : "bg-rose-400"}`}
            style={{ width: `${base ? Math.min(100, (Math.abs(value) / base) * 100) : 0}%` }}
          />
        )}
      </div>
      <div className={`w-32 text-right tabular-nums ${strong ? tone(value) : ""}`}>{r(value)}</div>
    </div>
  );
}

function Breakdown({ t }: { t: ProfitRow }) {
  const before = t.collected - t.cogs - t.shipping - t.gateway - t.packaging - t.ads;
  return (
    <div className="space-y-2">
      <Line label="Collected from customers (incl. GST)" value={t.collected} base={t.collected} strong />
      <Line label="Product cost" value={-t.cogs} base={t.collected} />
      <Line label="Shipping — freight + COD charge (incl. GST)" value={-t.shipping} base={t.collected} />
      <Line label="Fastrr payment fees (incl. GST)" value={-t.gateway} base={t.collected} />
      <Line label="Packaging (incl. GST)" value={-t.packaging} base={t.collected} />
      <Line label="Meta ads (incl. 18% GST)" value={-t.ads} base={t.collected} />
      <div className="border-t border-slate-200 pt-2">
        <Line label="Left before settling GST" value={before} base={t.collected} strong bar={false} />
      </div>
      <Line label="GST payable on sales" value={-t.gstOutput} base={t.collected} muted />
      <Line label="GST input credit on costs & ads" value={t.gstInput} base={t.collected} muted />
      <div className="border-t border-slate-200 pt-2">
        <Line label="Profit in pocket (before income tax)" value={t.profit} base={t.collected} strong bar={false} />
      </div>
    </div>
  );
}

/** Statement view: line items as rows, one column per product plus total. */
function Statement({ products, total }: { products: ProfitRow[]; total: ProfitRow }) {
  const cols = [...products, { ...total, key: "Total" }];
  type Item = { label: string; get: (r: ProfitRow) => number; kind?: "in" | "out" | "gst" | "sub" | "final" };
  const items: Item[] = [
    { label: "Collected from customers (incl. GST)", get: (r) => r.collected, kind: "in" },
    { label: "Product cost", get: (r) => -r.cogs, kind: "out" },
    { label: "Shipping — freight + COD charge (incl. GST)", get: (r) => -r.shipping, kind: "out" },
    { label: "Fastrr payment fees (incl. GST)", get: (r) => -r.gateway, kind: "out" },
    { label: "Packaging (incl. GST)", get: (r) => -r.packaging, kind: "out" },
    { label: "Meta ads (incl. 18% GST)", get: (r) => -r.ads, kind: "out" },
    { label: "Left before settling GST", get: (r) => r.collected - r.cogs - r.shipping - r.gateway - r.packaging - r.ads, kind: "sub" },
    { label: "GST payable on sales", get: (r) => -r.gstOutput, kind: "gst" },
    { label: "GST input credit (shipping, fees, packaging, ads)", get: (r) => r.gstInput, kind: "gst" },
    { label: "Net GST (− you pay · + credit left over)", get: (r) => -r.netGst, kind: "sub" },
    { label: "Final profit (after all GST, before income tax)", get: (r) => r.profit, kind: "final" },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-100 bg-slate-50/70">
          <tr>
            <th className={thL}>Line item</th>
            {cols.map((c) => (
              <th key={c.key} className={`${th} ${c.key === "Total" ? "text-slate-800" : ""}`}>{c.key}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((it) => (
            <tr
              key={it.label}
              className={
                it.kind === "final" ? "bg-slate-900 text-white" : it.kind === "sub" ? "bg-slate-50 font-medium" : it.kind === "gst" ? "text-slate-500" : ""
              }
            >
              <td className={`whitespace-nowrap px-3 py-2.5 ${it.kind === "final" ? "font-semibold" : ""} ${it.kind === "out" || it.kind === "gst" ? "pl-6" : ""}`}>
                {it.label}
              </td>
              {cols.map((c) => {
                const v = it.get(c);
                return (
                  <td
                    key={c.key}
                    className={`${td} ${c.key === "Total" ? "font-semibold" : ""} ${
                      it.kind === "final" ? (v < 0 ? "font-semibold text-rose-300" : "font-semibold text-emerald-300") : ""
                    }`}
                  >
                    {r(v)}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="text-xs text-slate-500">
            <td className="px-3 py-2">Margin on sales ex-GST · per order</td>
            {cols.map((c) => (
              <td key={c.key} className={`${td} text-xs`}>
                {pct(c.profit, sales(c))} · {c.orders ? r(c.profit / c.orders) : "—"}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function GstCard({ g }: { g: ProfitData["gst"] }) {
  const row = (label: string, value: number, cls = "") => (
    <div className={`flex justify-between py-1 text-sm ${cls}`}>
      <span>{label}</span>
      <span className="tabular-nums">{r(value)}</span>
    </div>
  );
  return (
    <div>
      {row("GST payable on sales", g.output, "font-medium")}
      <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Input credit</div>
      <div className="text-slate-600">
        {row("Shipping (18%)", g.input.shipping)}
        {row("Fastrr fees (18%)", g.input.gateway)}
        {row("Packaging (~10%)", g.input.packaging)}
        {row("Meta ads (18%)", g.input.ads)}
      </div>
      {row("Total input credit", g.input.total, "border-t border-slate-100 font-medium")}
      {g.net >= 0
        ? row("Net GST to pay", g.net, "mt-1 border-t border-slate-300 pt-2 text-base font-semibold")
        : row("Nothing to pay — credit carried forward", -g.net, "mt-1 border-t border-slate-300 pt-2 text-base font-semibold text-emerald-700")}
      <p className="mt-2 text-xs text-slate-400">
        Estimate for orders placed this month. Your actual GST return goes by invoice date — use CA Export for filing.
      </p>
    </div>
  );
}

function Outcomes({ row }: { row: ProfitRow }) {
  return (
    <span className="text-xs text-slate-500">
      <span className="text-emerald-700">{row.delivered}</span> · <span className="text-rose-700">{row.rto}</span> ·{" "}
      <span className="text-amber-700">{row.pending}</span>
      {row.cancelled > 0 && <span className="text-slate-400"> · {row.cancelled}✕</span>}
    </span>
  );
}

function Profit() {
  const { month, year, setMonthYear, data, phase, progress, loading, error, refresh } = useMonthData<ProfitData>({
    endpoint: "/api/profit",
  });
  const t = data?.totals;

  return (
    <>
      <PageHeader title="Profit" subtitle={`Orders placed in ${monthLabel(month, year)} — cash in and out, GST settled, profit in pocket before income tax`}>
        <MonthPicker month={month} year={year} onChange={setMonthYear} onRefresh={refresh} loading={loading} />
      </PageHeader>

      <LoadState phase={phase} progress={progress} error={error} month={month} year={year} onRetry={refresh} hasData={!!data} />

      {data && !data.ads.configured && (
        <Alert tone="amber">
          <strong>Ad spend sheet not connected</strong> — profit below doesn&apos;t include Meta ads yet. Add the published
          Google Sheet link as <code>GOOGLE_SHEET_CSV_URL</code> in Vercel (see the README).
        </Alert>
      )}
      {data?.ads.error && <Alert>{data.ads.error}</Alert>}
      {data && data.ads.unassigned.length > 0 && (
        <Alert tone="amber">
          Ad spend with a product name that doesn&apos;t match any Shopify product (counted in the total only):{" "}
          {data.ads.unassigned.map((u) => `${u.product} ${r(u.spend)}`).join(", ")}
        </Alert>
      )}
      {data && data.missingCosts.length > 0 && (
        <Alert>No product cost set for: {data.missingCosts.join(", ")} — counted as ₹0 until added in lib/costs.ts.</Alert>
      )}

      {data && t && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Stat label="Profit in pocket" value={r(t.profit)} tone={t.profit < 0 ? "red" : "green"} hint={`${pct(t.profit, sales(t))} of sales ex-GST`} />
            <Stat label="Confirmed profit" value={r(t.confirmedProfit)} hint={`${t.pending} COD still pending`} />
            <Stat label="Collected" value={r(t.collected)} hint={`${t.orders} orders · ${t.units} units`} />
            <Stat label="Meta ad spend" value={r(t.adSpend)} hint={t.adSpend ? `ROAS ${(t.collected / t.adSpend).toFixed(2)}× · paid ${r(t.ads)}` : "—"} />
            <Stat
              label={data.gst.net >= 0 ? "Net GST to pay" : "GST credit carried forward"}
              value={r(Math.abs(data.gst.net))}
              hint={`${r(data.gst.output)} payable − ${r(data.gst.input.total)} credit`}
            />
            <Stat label="Profit / order" value={t.orders ? r(t.profit / t.orders) : "—"} />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3" title="Where the money goes" subtitle="Cash in and out, then GST settled">
              <Breakdown t={t} />
            </Card>
            <Card className="lg:col-span-2" title="GST">
              <GstCard g={data.gst} />
            </Card>
          </div>

          <Card title="How it's calculated">
            <ul className="grid gap-x-8 gap-y-1.5 text-xs text-slate-600 md:grid-cols-2">
              <li>• Orders count on the day they&apos;re placed — the day the ad money was spent.</li>
              <li>
                • Delivered: product cost, freight ₹{COSTS.freight} (+ ₹{COSTS.codCharge} COD charge), packaging ₹{COSTS.packaging},
                Fastrr fee {COSTS.gatewayPrepaid * 100}% UPI / {COSTS.gatewayPartialCod * 100}% partial COD — all as paid, incl. GST.
              </li>
              <li>• RTO: only the ₹99 advance kept · goods restocked · freight both ways · packaging and fee lost.</li>
              <li>• Cancelled before shipping: ₹99 advance kept · only the fee spent.</li>
              <li>
                • COD still in transit: counted at your recent delivery rate, <strong>{Math.round(data.deliveryRate * 100)}%</strong>
                {data.deliveryRateSample >= 10 ? ` (last ${data.deliveryRateSample} settled COD orders)` : " (default until 10 COD orders settle)"}.
                &ldquo;Confirmed profit&rdquo; leaves them out.
              </li>
              <li>• Profit in pocket = collected − everything paid − net GST. Only income tax is left.</li>
            </ul>
          </Card>

          <Card title="Profit statement" subtitle="Every rupee in and out, then GST, down to final profit" padded={false}>
            <Statement products={data.products} total={t} />
          </Card>

          <Card title="By product" subtitle="Amounts as paid, incl. GST · margin on sales ex-GST" padded={false}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/70">
                  <tr>
                    <th className={thL}>Product</th>
                    <th className={th}>Orders</th>
                    <th className={th}>Units</th>
                    <th className={th} title="Sold (delivered, or prepaid) · Returned · COD pending">Sold · RTO · Pend</th>
                    <th className={th}>Collected</th>
                    <th className={th}>Goods</th>
                    <th className={th}>Shipping</th>
                    <th className={th}>Fees</th>
                    <th className={th}>Packaging</th>
                    <th className={th}>Ads</th>
                    <th className={th}>GST payable</th>
                    <th className={th}>GST credit</th>
                    <th className={th}>Net GST</th>
                    <th className={th}>Profit</th>
                    <th className={th}>Margin</th>
                    <th className={th}>Per order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.products.map((p) => (
                    <tr key={p.key} className="hover:bg-slate-50/60">
                      <td className="min-w-48 px-3 py-2.5 font-medium">{p.key}</td>
                      <td className={td}>{p.orders}</td>
                      <td className={td}>{p.units}</td>
                      <td className={td}><Outcomes row={p} /></td>
                      <td className={td}>{r(p.collected)}</td>
                      <td className={td}>{r(p.cogs)}</td>
                      <td className={td}>{r(p.shipping)}</td>
                      <td className={td}>{r(p.gateway)}</td>
                      <td className={td}>{r(p.packaging)}</td>
                      <td className={td}>{r(p.ads)}</td>
                      <td className={`${td} text-slate-500`}>{r(p.gstOutput)}</td>
                      <td className={`${td} text-slate-500`}>{r(p.gstInput)}</td>
                      <td className={td}>{r(p.netGst)}</td>
                      <td className={`${td} font-semibold ${tone(p.profit)}`}>{r(p.profit)}</td>
                      <td className={td}>{pct(p.profit, sales(p))}</td>
                      <td className={td}>{p.orders ? r(p.profit / p.orders) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.products.length === 0 && <EmptyState>No orders placed this month.</EmptyState>}
            </div>
          </Card>

          <Card title="Day by day" padded={false}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/70">
                  <tr>
                    <th className={thL}>Date</th>
                    <th className={th}>Orders</th>
                    <th className={th} title="Sold (delivered, or prepaid) · Returned · COD pending">Sold · RTO · Pend</th>
                    <th className={th}>Collected</th>
                    <th className={th} title="Product, shipping, fees, packaging — incl. GST">Costs</th>
                    <th className={th} title="Paid incl. 18% GST">Ads</th>
                    <th className={th} title="Collected ÷ ad spend (ex-GST, as in Ads Manager)">ROAS</th>
                    <th className={th}>GST payable</th>
                    <th className={th}>GST credit</th>
                    <th className={th}>Net GST</th>
                    <th className={th}>Final profit</th>
                    <th className={th} title="Pending COD orders left out">Confirmed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...data.days].reverse().map((d) => (
                    <tr key={d.key} className="hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-3 py-2.5 text-left font-medium">{formatDateIST(`${d.key}T06:30:00Z`)}</td>
                      <td className={td}>{d.orders}</td>
                      <td className={td}><Outcomes row={d} /></td>
                      <td className={td}>{r(d.collected)}</td>
                      <td className={td}>{r(d.cogs + d.shipping + d.gateway + d.packaging)}</td>
                      <td className={td}>{d.ads ? r(d.ads) : <span className="text-amber-600">not entered</span>}</td>
                      <td className={td}>{d.adSpend ? `${(d.collected / d.adSpend).toFixed(2)}×` : "—"}</td>
                      <td className={`${td} text-slate-500`}>{r(d.gstOutput)}</td>
                      <td className={`${td} text-slate-500`}>{r(d.gstInput)}</td>
                      <td className={td}>{r(d.netGst)}</td>
                      <td className={`${td} font-semibold ${tone(d.profit)}`}>{r(d.profit)}</td>
                      <td className={`${td} text-slate-500`}>{r(d.confirmedProfit)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-semibold">
                    <td className="px-3 py-2.5">Total · final profit</td>
                    <td className={td}>{t.orders}</td>
                    <td className={td}><Outcomes row={t} /></td>
                    <td className={td}>{r(t.collected)}</td>
                    <td className={td}>{r(t.cogs + t.shipping + t.gateway + t.packaging)}</td>
                    <td className={td}>{r(t.ads)}</td>
                    <td className={td}>{t.adSpend ? `${(t.collected / t.adSpend).toFixed(2)}×` : "—"}</td>
                    <td className={td}>{r(t.gstOutput)}</td>
                    <td className={td}>{r(t.gstInput)}</td>
                    <td className={td}>{r(t.netGst)}</td>
                    <td className={`${td} ${tone(t.profit)}`}>{r(t.profit)}</td>
                    <td className={td}>{r(t.confirmedProfit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Profit />
    </Suspense>
  );
}
