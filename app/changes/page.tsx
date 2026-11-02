"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui";
import { CATEGORY_LABEL, CHANGES, CURRENT_VARIANTS, type Change, type ChangeCategory } from "@/lib/changelog";
import { catalogEntry, CATALOG, COSTS, orderPackaging, unitCost } from "@/lib/costs";
import { currentMonthIST, monthLabel, MONTH_NAMES } from "@/lib/dates";

const STYLE: Record<ChangeCategory, { dot: string; badge: string; ring: string }> = {
  product: { dot: "bg-violet-500", badge: "bg-violet-50 text-violet-700 ring-violet-200", ring: "ring-violet-100" },
  cost: { dot: "bg-amber-500", badge: "bg-amber-50 text-amber-800 ring-amber-200", ring: "ring-amber-100" },
  price: { dot: "bg-sky-500", badge: "bg-sky-50 text-sky-700 ring-sky-200", ring: "ring-sky-100" },
  packaging: { dot: "bg-teal-500", badge: "bg-teal-50 text-teal-700 ring-teal-200", ring: "ring-teal-100" },
  fees: { dot: "bg-indigo-500", badge: "bg-indigo-50 text-indigo-700 ring-indigo-200", ring: "ring-indigo-100" },
  gst: { dot: "bg-rose-500", badge: "bg-rose-50 text-rose-700 ring-rose-200", ring: "ring-rose-100" },
  invoicing: { dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200", ring: "ring-emerald-100" },
  ads: { dot: "bg-pink-500", badge: "bg-pink-50 text-pink-700 ring-pink-200", ring: "ring-pink-100" },
};

const monthKey = (date: string) => date.slice(0, 7); // YYYY-MM
const keyLabel = (key: string) => monthLabel(Number(key.slice(5, 7)), Number(key.slice(0, 4)));
const dayLabel = (date: string) => `${Number(date.slice(8, 10))} ${MONTH_NAMES[Number(date.slice(5, 7)) - 1].slice(0, 3)}`;
const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

function ChangeCard({ c }: { c: Change }) {
  const s = STYLE[c.category];
  return (
    <li className="relative pl-10">
      {/* timeline dot */}
      <span className={`absolute left-[11px] top-5 h-3 w-3 rounded-full ring-4 ${s.dot} ${s.ring}`} />
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">{dayLabel(c.date)}</span>
          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.badge}`}>{CATEGORY_LABEL[c.category]}</span>
          <div className="ml-auto flex flex-wrap gap-1">
            {c.affects.map((a) => (
              <span key={a} className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500">
                {a}
              </span>
            ))}
          </div>
        </div>
        <h3 className="mt-2.5 text-[15px] font-semibold text-slate-900">{c.title}</h3>
        {c.detail && <p className="mt-1 text-sm leading-relaxed text-slate-600">{c.detail}</p>}
        {c.changes && c.changes.length > 0 && (
          <dl className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100 bg-slate-50/60">
            {c.changes.map((ch) => (
              <div key={ch.label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm">
                <dt className="text-slate-600">{ch.label}</dt>
                <dd className="flex items-center gap-2 tabular-nums">
                  {ch.from && (
                    <>
                      <span className="text-slate-400 line-through decoration-slate-300">{ch.from}</span>
                      <span className="text-slate-300">→</span>
                    </>
                  )}
                  <span className="font-semibold text-slate-900">{ch.to}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
        {c.note && (
          <p className="mt-2.5 flex items-start gap-1.5 text-xs text-amber-700">
            <span aria-hidden>ⓘ</span>
            {c.note}
          </p>
        )}
      </div>
    </li>
  );
}

function TodaysRates() {
  const now = new Date().toISOString();
  const byProduct = CURRENT_VARIANTS.reduce<Record<string, typeof CURRENT_VARIANTS>>((m, v) => {
    (m[v.product] ??= []).push(v);
    return m;
  }, {});
  const fees = [
    { label: "Freight (each way)", value: `${inr(COSTS.freight)}` },
    { label: "COD charge (delivered)", value: inr(COSTS.codCharge) },
    { label: "Fastrr — prepaid", value: `${(COSTS.gatewayPrepaid * 100).toFixed(1)}%` },
    { label: "Fastrr — partial COD", value: `${(COSTS.gatewayPartialCod * 100).toFixed(1)}%` },
    { label: "Packaging per order", value: `${inr(COSTS.packaging)}+` },
    { label: "GST on Meta ads", value: `${COSTS.adsGstRate}%` },
  ];
  return (
    <div className="space-y-4">
      <Card title="Shipping & fees today" subtitle="Incl. GST · used by the Profit tab">
        <dl className="grid grid-cols-2 gap-2">
          {fees.map((f) => (
            <div key={f.label} className="rounded-xl bg-slate-50 px-3 py-2">
              <dt className="text-[11px] text-slate-500">{f.label}</dt>
              <dd className="text-sm font-semibold tabular-nums text-slate-900">{f.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card title="Product costs today" subtitle="Live from the app's settings" padded={false}>
        <div className="divide-y divide-slate-100">
          {Object.entries(byProduct).map(([product, variants]) => (
            <div key={product} className="px-5 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">{product}</div>
                <div className="text-[11px] text-slate-400">HSN {catalogEntry(product)?.hsn ?? "—"}</div>
              </div>
              <table className="mt-1.5 w-full text-xs">
                <tbody>
                  {variants.map((v) => {
                    const cost = unitCost(v.product, v.variant, now);
                    const pack = orderPackaging([{ title: v.product, variantTitle: v.variant, quantity: 1 }]);
                    return (
                      <tr key={v.variant}>
                        <td className="py-1 pr-2 text-slate-600">{v.variant}</td>
                        <td className="py-1 text-right tabular-nums text-slate-400">{inr(v.price)}</td>
                        <td className="py-1 pl-3 text-right font-semibold tabular-nums text-slate-900">
                          {cost === null ? <span className="text-rose-600">not set</span> : inr(cost)}
                        </td>
                        <td className="py-1 pl-3 text-right tabular-nums text-slate-400" title="Packaging">
                          📦 {inr(pack)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <p className="border-t border-slate-100 px-5 py-2.5 text-[11px] text-slate-400">
          Columns: selling price · product cost · packaging per order
        </p>
      </Card>
    </div>
  );
}

function Changes() {
  const params = useSearchParams();
  const router = useRouter();
  const months = useMemo(() => [...new Set(CHANGES.map((c) => monthKey(c.date)))].sort().reverse(), []);
  const urlKey =
    params.get("month") && params.get("year") ? `${params.get("year")}-${String(params.get("month")).padStart(2, "0")}` : null;
  const [category, setCategory] = useState<ChangeCategory | "all">("all");
  const selected = urlKey ?? "all";

  const setMonth = (key: string) =>
    router.replace(key === "all" ? "?" : `?month=${Number(key.slice(5, 7))}&year=${key.slice(0, 4)}`, { scroll: false });

  const visible = CHANGES.filter((c) => (selected === "all" || monthKey(c.date) === selected) && (category === "all" || c.category === category));
  const groups = [...new Set(visible.map((c) => monthKey(c.date)))]
    .sort()
    .reverse()
    .map((key) => ({ key, items: visible.filter((c) => monthKey(c.date) === key).sort((a, b) => b.date.localeCompare(a.date)) }));

  const now = currentMonthIST();
  const thisMonth = `${now.year}-${String(now.month).padStart(2, "0")}`;
  const latest = [...CHANGES].sort((a, b) => b.date.localeCompare(a.date))[0];
  const categories = (Object.keys(CATEGORY_LABEL) as ChangeCategory[]).filter((k) => CHANGES.some((c) => c.category === k));

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-6 text-white shadow-lg sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200">Change log</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">What changed, and when</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Every cost, selling price, product, packaging and rule change behind your profit and invoices — open the month
            you&apos;re reviewing to see exactly what moved.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Changes logged", value: CHANGES.length },
              { label: `In ${MONTH_NAMES[now.month - 1]}`, value: CHANGES.filter((c) => monthKey(c.date) === thisMonth).length },
              { label: "Products", value: CATALOG.length },
              { label: "Latest change", value: latest ? dayLabel(latest.date) : "—" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-inset ring-white/10 backdrop-blur">
                <div className="text-[11px] text-slate-300">{s.label}</div>
                <div className="mt-0.5 text-xl font-semibold tabular-nums">{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {["all", ...months].map((key) => {
            const count = key === "all" ? CHANGES.length : CHANGES.filter((c) => monthKey(c.date) === key).length;
            const active = selected === key;
            return (
              <button
                key={key}
                onClick={() => setMonth(key)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  active ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {key === "all" ? "All months" : keyLabel(key)}
                <span className={`ml-1.5 text-xs ${active ? "text-slate-300" : "text-slate-400"}`}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategory("all")}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              category === "all" ? "bg-slate-200 text-slate-900" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            All types
          </button>
          {categories.map((k) => (
            <button
              key={k}
              onClick={() => setCategory(category === k ? "all" : k)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition ${
                category === k ? STYLE[k].badge : "text-slate-500 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${STYLE[k].dot}`} />
              {CATEGORY_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Timeline */}
        <div className="space-y-8 lg:col-span-2">
          {groups.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <div className="text-sm font-medium text-slate-700">
                No changes logged {selected === "all" ? "" : `in ${keyLabel(selected)}`}
              </div>
              <p className="mt-1 text-xs text-slate-500">Costs, prices and rules stayed the same.</p>
              {selected !== "all" && (
                <button onClick={() => setMonth("all")} className="mt-3 text-xs font-medium text-indigo-600 hover:underline">
                  Show all months
                </button>
              )}
            </div>
          )}
          {groups.map((g) => (
            <section key={g.key}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">{keyLabel(g.key)}</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  {g.items.length} change{g.items.length === 1 ? "" : "s"}
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[16px] before:top-2 before:w-px before:bg-slate-200">
                {g.items.map((c) => (
                  <ChangeCard key={`${c.date}-${c.title}`} c={c} />
                ))}
              </ol>
            </section>
          ))}
        </div>

        {/* Today's rates */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <TodaysRates />
        </aside>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Changes />
    </Suspense>
  );
}
