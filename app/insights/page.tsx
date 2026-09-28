"use client";

import { Suspense, useMemo } from "react";
import { LoadState } from "@/components/LoadState";
import { MonthPicker } from "@/components/MonthPicker";
import { Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { monthLabel, monthRangeUTC } from "@/lib/dates";
import { productRows, totals } from "@/lib/export";
import { formatINR } from "@/lib/invoice";
import type { Order, Outcome } from "@/lib/types";
import { useMonthData } from "@/lib/useMonthData";

const r = (n: number) => `₹${formatINR(n)}`;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const th = "px-4 py-2.5 text-left text-xs font-medium text-slate-500";
const td = "px-4 py-2.5";

const OUTCOMES: Outcome[] = ["Delivered", "In transit", "Not shipped", "RTO", "Cancelled"];
const OUTCOME_COLOR: Record<string, string> = {
  Delivered: "bg-emerald-500",
  "In transit": "bg-yellow-400",
  "Not shipped": "bg-slate-300",
  RTO: "bg-rose-500",
  Cancelled: "bg-slate-500",
};

function byProduct(orders: Order[]) {
  const map = new Map<string, { orders: number; qty: number; value: number; prepaid: number; cod: number } & Record<Outcome, number>>();
  for (const o of orders) {
    const titles = new Set(o.lineItems.map((l) => l.title));
    for (const title of titles) {
      const row =
        map.get(title) ??
        ({ orders: 0, qty: 0, value: 0, prepaid: 0, cod: 0, Delivered: 0, "In transit": 0, "Not shipped": 0, RTO: 0, Cancelled: 0, Test: 0 } as never);
      row.orders++;
      if (o.paymentType === "COD") row.cod++;
      else row.prepaid++;
      row[o.outcome]++;
      for (const l of o.lineItems.filter((x) => x.title === title)) {
        row.qty += l.quantity;
        row.value += l.discountedTotal;
      }
      map.set(title, row);
    }
  }
  return [...map].map(([product, v]) => ({ product, ...v })).sort((a, b) => b.orders - a.orders);
}

function Insights() {
  const { month, year, setMonthYear, data, phase, progress, loading, error, refresh } = useMonthData();
  const range = monthRangeUTC(month, year);
  const placed = useMemo(
    () => (data?.orders ?? []).filter((o) => !o.isTest && new Date(o.createdAt) >= range.start && new Date(o.createdAt) < range.end),
    [data, range.start, range.end],
  );
  const products = useMemo(() => byProduct(placed), [placed]);
  const invoices = data?.invoices ?? [];
  const gstByProduct = useMemo(() => productRows(invoices), [invoices]);
  const forfeits = totals(invoices.filter((i) => i.kind === "forfeit"));
  const all = totals(invoices);

  const cod = placed.filter((o) => o.paymentType === "COD");
  const count = (list: Order[], o: Outcome) => list.filter((x) => x.outcome === o).length;
  const codSettled = count(cod, "Delivered") + count(cod, "RTO");

  return (
    <>
      <PageHeader title="Insights" subtitle={`How ${monthLabel(month, year)} went — orders, returns and GST by product`}>
        <MonthPicker month={month} year={year} onChange={setMonthYear} onRefresh={refresh} loading={loading} />
      </PageHeader>

      <LoadState phase={phase} progress={progress} error={error} month={month} year={year} onRetry={refresh} hasData={!!data} />

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Stat label="Orders placed" value={placed.length} />
            <Stat label="Prepaid" value={placed.length - cod.length} hint={pct(placed.length - cod.length, placed.length)} />
            <Stat label="COD" value={cod.length} hint={pct(cod.length, placed.length)} />
            <Stat label="Delivered" value={count(placed, "Delivered")} tone="green" />
            <Stat label="RTO" value={count(placed, "RTO")} tone="red" hint={`COD RTO rate ${pct(count(cod, "RTO"), codSettled)}`} />
            <Stat label="Cancelled" value={count(placed, "Cancelled")} />
          </div>

          <Card title="What happened to this month's orders">
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
              {OUTCOMES.map((o) => {
                const c = count(placed, o);
                return c ? <div key={o} className={OUTCOME_COLOR[o]} style={{ width: `${(c / placed.length) * 100}%` }} title={`${o}: ${c}`} /> : null;
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
              {OUTCOMES.map((o) => (
                <span key={o} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${OUTCOME_COLOR[o]}`} />
                  {o} <strong className="tabular-nums">{count(placed, o)}</strong>
                  <span className="text-slate-400">{pct(count(placed, o), placed.length)}</span>
                </span>
              ))}
            </div>
          </Card>

          <Card title="Orders by product" subtitle={`Orders placed in ${monthLabel(month, year)}`} padded={false}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/70">
                  <tr>
                    <th className={th}>Product</th>
                    <th className={`${th} text-right`}>Orders</th>
                    <th className={`${th} text-right`}>Units</th>
                    <th className={`${th} text-right`}>Prepaid</th>
                    <th className={`${th} text-right`}>COD</th>
                    <th className={`${th} text-right`}>Delivered</th>
                    <th className={`${th} text-right`}>In transit</th>
                    <th className={`${th} text-right`}>RTO</th>
                    <th className={`${th} text-right`}>Cancelled</th>
                    <th className={`${th} text-right`}>Order value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {products.map((p) => (
                    <tr key={p.product} className="hover:bg-slate-50/60">
                      <td className={`${td} font-medium`}>{p.product}</td>
                      <td className={`${td} text-right`}>{p.orders}</td>
                      <td className={`${td} text-right`}>{p.qty}</td>
                      <td className={`${td} text-right`}>{p.prepaid}</td>
                      <td className={`${td} text-right`}>{p.cod}</td>
                      <td className={`${td} text-right text-emerald-700`}>{p.Delivered}</td>
                      <td className={`${td} text-right`}>{p["In transit"] + p["Not shipped"]}</td>
                      <td className={`${td} text-right text-rose-700`}>{p.RTO}</td>
                      <td className={`${td} text-right`}>{p.Cancelled}</td>
                      <td className={`${td} text-right`}>{r(p.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {products.length === 0 && <EmptyState>No orders placed this month.</EmptyState>}
            </div>
          </Card>

          <Card title="GST by product" subtitle={`From the ${invoices.length} invoices dated ${monthLabel(month, year)}`} padded={false}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/70">
                  <tr>
                    <th className={th}>Product</th>
                    <th className={`${th} text-right`}>Invoices</th>
                    <th className={`${th} text-right`}>Units</th>
                    <th className={`${th} text-right`}>Taxable</th>
                    <th className={`${th} text-right`}>GST</th>
                    <th className={`${th} text-right`}>Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {gstByProduct.map((p) => (
                    <tr key={p.product}>
                      <td className={`${td} font-medium`}>{p.product}</td>
                      <td className={`${td} text-right`}>{p.invoices}</td>
                      <td className={`${td} text-right`}>{p.qty}</td>
                      <td className={`${td} text-right`}>{r(p.taxable)}</td>
                      <td className={`${td} text-right font-medium`}>{r(p.tax)}</td>
                      <td className={`${td} text-right`}>{r(p.value)}</td>
                    </tr>
                  ))}
                  {forfeits.count > 0 && (
                    <tr>
                      <td className={`${td} font-medium`}>
                        Retained COD advances <span className="font-normal text-slate-400">(cancelled / RTO)</span>
                      </td>
                      <td className={`${td} text-right`}>{forfeits.count}</td>
                      <td className={`${td} text-right text-slate-400`}>—</td>
                      <td className={`${td} text-right`}>{r(forfeits.taxable)}</td>
                      <td className={`${td} text-right font-medium`}>{r(forfeits.tax)}</td>
                      <td className={`${td} text-right`}>{r(forfeits.total)}</td>
                    </tr>
                  )}
                  {invoices.length > 0 && (
                    <tr className="bg-slate-50 font-semibold">
                      <td className={td}>Total</td>
                      <td className={`${td} text-right`}>{all.count}</td>
                      <td className={td} />
                      <td className={`${td} text-right`}>{r(all.taxable)}</td>
                      <td className={`${td} text-right`}>{r(all.tax)}</td>
                      <td className={`${td} text-right`}>{r(all.total)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {invoices.length === 0 && <EmptyState>No invoices this month.</EmptyState>}
            </div>
            <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-400">
              Shipping charges, if any, are counted in the total but not under a product.
            </p>
          </Card>
        </>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Insights />
    </Suspense>
  );
}
