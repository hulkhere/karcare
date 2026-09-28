"use client";

import { useEffect, useState } from "react";
import { formatDateIST, monthLabel, MONTH_NAMES } from "@/lib/dates";
import { formatINR } from "@/lib/invoice";
import type { ArchiveMonth } from "@/lib/types";

type Data = {
  months: ArchiveMonth[];
  current: { month: number; year: number };
  start: { startMonth: number; startYear: number; startNumber: number };
};

const FILES = [
  { file: "package.zip", label: "CA package (ZIP)", primary: true },
  { file: "invoices.pdf", label: "All invoices (PDF)" },
  { file: "invoices.zip", label: "Individual PDFs (ZIP)" },
  { file: "register.csv", label: "Register (CSV)" },
];

export default function ArchivePage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/archive", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
        setData(json);
      })
      .catch((e) => setError(e.message));
  }, []);

  const next = data && (data.current.month === 12 ? { month: 1, year: data.current.year + 1 } : { month: data.current.month + 1, year: data.current.year });

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-lg font-semibold">Monthly archive</h1>
        <p className="text-sm text-slate-500">
          Each month closes automatically on the 1st of the next month. Closed months get final, gap-free invoice
          numbers that never change. The CA package has everything to file GSTR-1: all invoices (merged and
          individual), the invoice register, and state-wise and HSN summaries.
        </p>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {!data && !error && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Loading archive… (closing any finished months — this can take a few seconds)
        </div>
      )}

      {data && next && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
          <strong>{monthLabel(data.current.month, data.current.year)}</strong> is in progress — it closes automatically on
          1 {MONTH_NAMES[next.month - 1]} {next.year}.
        </div>
      )}

      {data?.months.map((m) => (
        <section key={m.key} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">{monthLabel(m.month, m.year)}</h2>
            <span className="text-xs text-slate-400">Closed {formatDateIST(m.closedAt)}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div>
              <div className="text-xs text-slate-500">Invoices</div>
              <div className="font-medium">
                {m.count ? `${m.count} · ${m.firstInvoice} → ${m.lastInvoice}` : "None"}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Taxable value</div>
              <div className="font-medium tabular-nums">₹{formatINR(m.taxable)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">GST</div>
              <div className="font-medium tabular-nums">₹{formatINR(m.tax)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Invoice value</div>
              <div className="font-medium tabular-nums">₹{formatINR(m.total)}</div>
            </div>
          </div>
          {m.lateOrders.length > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              Includes COD order(s) delivered last month but updated after it closed: {m.lateOrders.join(", ")}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {FILES.filter((f) => m.count > 0 || f.file === "package.zip").map((f) => (
              <a
                key={f.file}
                href={`/api/archive/${m.key}/${f.file}`}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  f.primary ? "bg-slate-900 text-white hover:bg-slate-700" : "border border-slate-300 hover:bg-slate-50"
                }`}
              >
                {f.label}
              </a>
            ))}
          </div>
        </section>
      ))}

      {data && data.months.length === 0 && (
        <p className="text-sm text-slate-500">
          No closed months yet. The archive starts from {monthLabel(data.start.startMonth, data.start.startYear)}.
        </p>
      )}
    </main>
  );
}
