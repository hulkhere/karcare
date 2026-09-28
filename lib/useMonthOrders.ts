"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { currentMonthIST } from "./dates";
import type { OrdersResponse } from "./types";

/** Month/year kept in the URL (?month=&year=) so Dashboard and Summary stay in sync. */
export function useMonthOrders() {
  const params = useSearchParams();
  const router = useRouter();
  const now = currentMonthIST();
  const [month, setMonth] = useState(Number(params.get("month")) || now.month);
  const [year, setYear] = useState(Number(params.get("year")) || now.year);
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    router.replace(`?month=${month}&year=${year}`, { scroll: false });
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
  }, [month, year, router]);

  // Load once on first render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void fetchOrders(), []);

  return {
    month,
    year,
    setMonthYear: (m: number, y: number) => {
      setMonth(m);
      setYear(y);
    },
    data,
    loading,
    error,
    fetchOrders,
  };
}
