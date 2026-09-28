"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { currentMonthIST, previousMonth } from "./dates";
import type { OrdersResponse } from "./types";

/**
 * Month/year kept in the URL (?month=&year=) so tabs stay in sync.
 * Orders load automatically whenever the month changes.
 */
export function useMonthOrders({ defaultToPrevious = false } = {}) {
  const params = useSearchParams();
  const router = useRouter();
  const fallback = defaultToPrevious ? previousMonth(currentMonthIST()) : currentMonthIST();
  const month = Number(params.get("month")) || fallback.month;
  const year = Number(params.get("year")) || fallback.year;

  const [data, setData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders?month=${month}&year=${year}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setData(json);
    } catch (e) {
      setData(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const setMonthYear = (m: number, y: number) => router.replace(`?month=${m}&year=${y}`, { scroll: false });

  // Ignore data from a previously selected month while the new one loads
  const current = data && data.month === month && data.year === year ? data : null;
  return { month, year, setMonthYear, data: current, loading, error, reload: load };
}
