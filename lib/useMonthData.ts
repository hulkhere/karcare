"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { currentMonthIST, previousMonth } from "./dates";
import { seriesStartFor } from "./orders";
import type { MonthData } from "./types";

type Phase = "exporting" | "loading" | "ready" | "error";

const REUSE_MINUTES = 30;
const storeKey = (series: string) => `kc:export:${series}`;

function readExport(series: string): { id: string; at: number } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(storeKey(series)) || "null");
    return v && Date.now() - v.at < REUSE_MINUTES * 60_000 ? v : null;
  } catch {
    return null;
  }
}
function writeExport(series: string, id: string | null) {
  try {
    if (id) sessionStorage.setItem(storeKey(series), JSON.stringify({ id, at: Date.now() }));
    else sessionStorage.removeItem(storeKey(series));
  } catch {
    /* ignore */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function json<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body.error ?? `Request failed (${res.status})`), { busy: body.busy });
  return body;
}

/**
 * Month/year live in the URL (?month=&year=) so tabs stay in sync.
 * Data comes from one Shopify bulk export per invoice series (financial year), reused for
 * 30 minutes across tabs and months; "Refresh" pulls a fresh export.
 */
export function useMonthData<T extends { month: number; year: number } = MonthData>({
  defaultToPrevious = false,
  endpoint = "/api/month",
} = {}) {
  const params = useSearchParams();
  const router = useRouter();
  const fallback = defaultToPrevious ? previousMonth(currentMonthIST()) : currentMonthIST();
  const month = Number(params.get("month")) || fallback.month;
  const year = Number(params.get("year")) || fallback.year;
  const s = seriesStartFor({ month, year });
  const series = `${s.year}-${s.month}`;

  const [data, setData] = useState<T | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);

  const load = useCallback(
    async (fresh: boolean) => {
      const token = ++run.current;
      const alive = () => token === run.current;
      setError(null);
      try {
        let id = fresh ? null : readExport(series)?.id ?? null;
        if (!id) {
          setPhase("exporting");
          setProgress(0);
          for (let attempt = 0; ; attempt++) {
            try {
              ({ id } = await json<{ id: string }>(
                await fetch("/api/sync", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ month, year }),
                }),
              ));
              break;
            } catch (e) {
              if (!(e as { busy?: boolean }).busy || attempt > 20) throw e;
              await sleep(3000);
              if (!alive()) return;
            }
          }
          for (;;) {
            const st = await json<{ status: string; objectCount: number; errorCode: string | null }>(
              await fetch(`/api/sync?id=${encodeURIComponent(id!)}`, { cache: "no-store" }),
            );
            if (!alive()) return;
            setProgress(st.objectCount);
            if (st.status === "COMPLETED") break;
            if (!["CREATED", "RUNNING"].includes(st.status)) {
              throw new Error(`Shopify export ${st.status.toLowerCase()}${st.errorCode ? ` (${st.errorCode})` : ""}`);
            }
            await sleep(2000);
          }
          writeExport(series, id);
        }
        setPhase("loading");
        const md = await json<T>(
          await fetch(`${endpoint}?id=${encodeURIComponent(id!)}&month=${month}&year=${year}`, { cache: "no-store" }),
        );
        if (!alive()) return;
        setData(md);
        setPhase("ready");
      } catch (e) {
        if (!alive()) return;
        writeExport(series, null);
        setError((e as Error).message);
        setPhase("error");
      }
    },
    [month, year, series, endpoint],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const setMonthYear = (m: number, y: number) => router.replace(`?month=${m}&year=${y}`, { scroll: false });
  const current = data && data.month === month && data.year === year ? data : null;
  return {
    month,
    year,
    setMonthYear,
    data: current,
    phase,
    progress,
    loading: phase === "exporting" || phase === "loading",
    error,
    refresh: () => load(true),
  };
}
