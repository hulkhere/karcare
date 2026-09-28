"use client";

import { MONTH_NAMES } from "@/lib/dates";

export function MonthPicker({
  month,
  year,
  onChange,
}: {
  month: number;
  year: number;
  onChange: (month: number, year: number) => void;
}) {
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 4 }, (_, i) => thisYear - 2 + i);
  const cls = "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";
  return (
    <div className="flex gap-2">
      <select aria-label="Month" className={cls} value={month} onChange={(e) => onChange(Number(e.target.value), year)}>
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
      <select aria-label="Year" className={cls} value={year} onChange={(e) => onChange(month, Number(e.target.value))}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
