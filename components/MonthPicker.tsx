"use client";

import { MONTH_NAMES } from "@/lib/dates";
import { btn, inputCls, Spinner } from "./ui";

export function MonthPicker({ month, year, onChange, onRefresh, loading }: {
  month: number;
  year: number;
  onChange: (month: number, year: number) => void;
  onRefresh?: () => void;
  loading?: boolean;
}) {
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 4 }, (_, i) => thisYear - 2 + i);
  return (
    <div className="flex items-center gap-2">
      <select aria-label="Month" className={inputCls} value={month} onChange={(e) => onChange(Number(e.target.value), year)}>
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
      <select aria-label="Year" className={inputCls} value={year} onChange={(e) => onChange(month, Number(e.target.value))}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      {onRefresh && (
        <button onClick={onRefresh} disabled={loading} className={btn.secondary} title="Pull the latest data from Shopify">
          {loading ? <Spinner /> : "↻"} <span className="hidden sm:inline">{loading ? "Loading" : "Refresh"}</span>
        </button>
      )}
    </div>
  );
}
