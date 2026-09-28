"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { href: "/", label: "Orders" },
  { href: "/ca-export", label: "CA Export" },
  { href: "/summary", label: "GST Summary" },
  { href: "/insights", label: "Insights" },
];

export function NavTabs() {
  const path = usePathname();
  const params = useSearchParams();
  // Keep the selected month when switching tabs
  const qs = params.get("month") && params.get("year") ? `?month=${params.get("month")}&year=${params.get("year")}` : "";
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto">
      {TABS.map((t) => {
        const active = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href + qs}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
              active ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
