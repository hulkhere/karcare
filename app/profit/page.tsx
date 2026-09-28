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

function Breakdown({ t }: { t: ProfitRow }) {
  const items = [
    { label: "Revenue (ex-GST)", value: t.revenue, strong: true },
    { label: "Cost of goods", value: -t.cogs },
    { label: "Shipping (freight + COD charge)", value: -t.shipping },
    { label: "Payment gateway (Fastrr)", value: -t.gateway },
    { label: "Packaging", value: -t.packaging },
    { label: "Meta ads", value: -t.ads },
  ];
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-3 text-sm">
          <div className="w-56 shrink-0 text-slate-600">{i.label}</div>
          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`absolute inset-y-0 left-0 rounded-full ${i.value >= 0 ? "bg-slate-800" : "bg-rose-400"}`}
              style={{ width: `${t.revenue ? Math.min(100, (Math.abs(i.value) / t.revenue) * 100) : 0}%` }}
            />
          </div>
          <div className={`w-28 text-right tabular-nums ${i.strong ? "font-semibold" : ""}`}>{r(i.value)}</div>
          <div className="w-14 text-right text-xs tabular-nums text-slate-400">{pct(Math.abs(i.value), t.revenue)}</div>
        </div>
      ))}
      <div className="flex items-center gap-3 border-t border-slate-200 pt-2 text-sm font-semibold">
        <div className="w-56 shrink-0">Profit</div>
        <div className="flex-1" />
        <div className={`w-28 text-right tabular-nums ${tone(t.profit)}`}>{r(t.profit)}</div>
        <div className="w-14 text-right text-xs tabular-nums text-slate-500">{pct(t.profit, t.revenue)}</div>
      </div>
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
      <PageHeader title="Profit" subtitle={`Orders placed in ${monthLabel(month, year)}, after every cost — all amounts ex-GST`}>
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
            <Stat label="Profit" value={r(t.profit)} tone={t.profit < 0 ? "red" : "green"} hint={`${pct(t.profit, t.revenue)} margin`} />
            <Stat label="Confirmed profit" value={r(t.confirmedProfit)} hint={`${t.pending} COD still pending`} />
            <Stat label="Revenue" value={r(t.revenue)} hint={`${t.orders} orders · ${t.units} units`} />
            <Stat label="Meta ads" value={r(t.ads)} hint={t.ads ? `ROAS ${(t.revenue / t.ads).toFixed(2)}×` : "—"} />
            <Stat label="Profit / order" value={t.orders ? r(t.profit / t.orders) : "—"} />
            <Stat label="Net GST payable (est.)" value={r(data.gst.net)} hint={`${r(data.gst.output)} out − ${r(data.gst.input)} input`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3" title="Where the money goes">
              <Breakdown t={t} />
            </Card>
            <Card className="lg:col-span-2" title="How it's calculated">
              <ul className="space-y-1.5 text-xs text-slate-600">
                <li>• Orders count on the day they&apos;re placed — the day the ad money was spent.</li>
                <li>
                  • Delivered: full revenue − product cost − freight ₹{COSTS.freight} (+ ₹{COSTS.codCharge} COD charge) −
                  packaging ₹{COSTS.packaging} − Fastrr fee ({COSTS.gatewayPrepaid * 100}% UPI / {COSTS.gatewayPartialCod * 100}% partial COD).
                </li>
                <li>• RTO: only the ₹99 advance kept · goods restocked · freight both ways · packaging and fee lost.</li>
                <li>• Cancelled before shipping: ₹99 advance kept · only the fee spent.</li>
                <li>
                  • COD still in transit: counted at your recent delivery rate,{" "}
                  <strong>{Math.round(data.deliveryRate * 100)}%</strong>
                  {data.deliveryRateSample >= 10 ? ` (last ${data.deliveryRateSample} settled COD orders)` : " (default until 10 COD orders settle)"}.
                  &ldquo;Confirmed profit&rdquo; leaves them out.
                </li>
                <li>• GST is removed from every amount; what you pay on costs comes back as input credit.</li>
              </ul>
            </Card>
          </div>

          <Card title="By product" padded={false}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/70">
                  <tr>
                    <th className={thL}>Product</th>
                    <th className={th}>Orders</th>
                    <th className={th}>Units</th>
                    <th className={th} title="Sold (delivered, or prepaid) · Returned · COD pending">Sold · RTO · Pend</th>
                    <th className={th}>Revenue</th>
                    <th className={th}>Goods</th>
                    <th className={th}>Shipping</th>
                    <th className={th}>Fees</th>
                    <th className={th}>Packaging</th>
                    <th className={th}>Ads</th>
                    <th className={th}>Profit</th>
                    <th className={th}>Margin</th>
                    <th className={th}>Per order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.products.map((p) => (
                    <tr key={p.key} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 font-medium">{p.key}</td>
                      <td className={td}>{p.orders}</td>
                      <td className={td}>{p.units}</td>
                      <td className={td}><Outcomes row={p} /></td>
                      <td className={td}>{r(p.revenue)}</td>
                      <td className={td}>{r(p.cogs)}</td>
                      <td className={td}>{r(p.shipping)}</td>
                      <td className={td}>{r(p.gateway)}</td>
                      <td className={td}>{r(p.packaging)}</td>
                      <td className={td}>{r(p.ads)}</td>
                      <td className={`${td} font-semibold ${tone(p.profit)}`}>{r(p.profit)}</td>
                      <td className={td}>{pct(p.profit, p.revenue)}</td>
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
                    <th className={th}>Revenue</th>
                    <th className={th}>Costs</th>
                    <th className={th}>Ads</th>
                    <th className={th}>ROAS</th>
                    <th className={th}>Profit</th>
                    <th className={th}>Confirmed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...data.days].reverse().map((d) => (
                    <tr key={d.key} className="hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-3 py-2.5 text-left font-medium">{formatDateIST(`${d.key}T06:30:00Z`)}</td>
                      <td className={td}>{d.orders}</td>
                      <td className={td}><Outcomes row={d} /></td>
                      <td className={td}>{r(d.revenue)}</td>
                      <td className={td}>{r(d.cogs + d.shipping + d.gateway + d.packaging)}</td>
                      <td className={td}>{d.ads ? r(d.ads) : <span className="text-amber-600">not entered</span>}</td>
                      <td className={td}>{d.ads ? `${(d.revenue / d.ads).toFixed(2)}×` : "—"}</td>
                      <td className={`${td} font-semibold ${tone(d.profit)}`}>{r(d.profit)}</td>
                      <td className={`${td} text-slate-500`}>{r(d.confirmedProfit)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-semibold">
                    <td className="px-3 py-2.5">Total</td>
                    <td className={td}>{t.orders}</td>
                    <td className={td}><Outcomes row={t} /></td>
                    <td className={td}>{r(t.revenue)}</td>
                    <td className={td}>{r(t.cogs + t.shipping + t.gateway + t.packaging)}</td>
                    <td className={td}>{r(t.ads)}</td>
                    <td className={td}>{t.ads ? `${(t.revenue / t.ads).toFixed(2)}×` : "—"}</td>
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
