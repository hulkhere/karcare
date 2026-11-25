"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { currentMonthIST, previousMonth } from "./dates";
import { buildMonth, normalize, seriesStartFor } from "./orders";
import { useOrderStore } from "./orderStore";
import { buildProfit, type AdRow, type ProfitData, type SessionRow } from "./profit";

/** What the pages need to show loading, freshness and errors (see components/LoadState). */
export interface SyncInfo {
  /** First load: nothing saved in this browser yet */
  firstLoad: boolean;
  /** A refresh is running in the background */
  syncing: boolean;
  /** The running sync downloads everything (first load / "Reload everything") */
  full: boolean;
  phase: "idle" | "exporting" | "downloading";
  progress: number;
  error: string | null;
  syncedAt: string | null;
  refresh: () => void;
  rebuild: () => void;
}

/**
 * Month/year live in the URL (?month=&year=) so tabs stay in sync. Orders for the whole invoice
 * series come from the browser's saved copy (lib/orderStore) and are refreshed in the background
 * with only what changed; each tab computes its view locally, so switching tabs and months is instant.
 */
function useSeries(defaultToPrevious: boolean) {
  const params = useSearchParams();
  const router = useRouter();
  const fallback = defaultToPrevious ? previousMonth(currentMonthIST()) : currentMonthIST();
  const month = Number(params.get("month")) || fallback.month;
  const year = Number(params.get("year")) || fallback.year;
  const s = seriesStartFor({ month, year });
  const store = useOrderStore(`${s.year}-${s.month}`, { month, year });
  const setMonthYear = (m: number, y: number) => router.replace(`?month=${m}&year=${y}`, { scroll: false });
  const sync: SyncInfo = {
    firstLoad: !store.snapshot,
    syncing: store.syncing || !store.loaded,
    full: store.full,
    phase: store.phase,
    progress: store.progress,
    error: store.error,
    syncedAt: store.snapshot?.syncedAt ?? null,
    refresh: () => void store.refresh(),
    rebuild: () => void store.rebuild(),
  };
  return { month, year, setMonthYear, snapshot: store.snapshot, sync };
}

export function useMonthData({ defaultToPrevious = false } = {}) {
  const { month, year, setMonthYear, snapshot, sync } = useSeries(defaultToPrevious);
  const data = useMemo(
    () => (snapshot ? buildMonth(snapshot.orders, { month, year }, { syncedAt: snapshot.syncedAt }) : null),
    [snapshot, month, year],
  );
  return { month, year, setMonthYear, data, sync, loading: sync.syncing, refresh: sync.refresh };
}

// ---------- Profit: ad spend sheet + product page visits, cached briefly ----------

type Ads = { rows: AdRow[]; configured: boolean; error: string | null; skipped?: string[] };
type Sessions = { available: boolean; error: string | null; needsPermission: boolean; rows: SessionRow[] };

const memo = new Map<string, { at: number; p: Promise<unknown> }>();
function cached<T>(key: string, ttlMs: number, fresh: boolean, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (!fresh && hit && Date.now() - hit.at < ttlMs) return hit.p as Promise<T>;
  const p = load();
  memo.set(key, { at: Date.now(), p });
  p.catch(() => memo.delete(key));
  return p;
}
const getJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
};

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Visits for the month so far, as IST days. */
function sessionsRange(month: number, year: number) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const from = `${year}-${pad(month)}-01`;
  const last = new Date(Date.UTC(year, month, 0)); // last day of the month
  const today = day(new Date(Date.now() + 5.5 * 3600_000)); // IST
  const to = day(last) < today ? day(last) : today;
  return { from, to, future: from > today };
}

export function useProfitData() {
  const { month, year, setMonthYear, snapshot, sync } = useSeries(false);
  const [ads, setAds] = useState<Ads | null>(null);
  const [sessions, setSessions] = useState<Sessions | null>(null);
  const [extrasLoading, setExtrasLoading] = useState(false);

  const loadExtras = useCallback(
    async (fresh: boolean) => {
      setExtrasLoading(true);
      const range = sessionsRange(month, year);
      const [a, s] = await Promise.all([
        cached("ads", 2 * 60_000, fresh, () => getJson<Ads>("/api/adspend")).catch(
          (e): Ads => ({ rows: [], configured: true, error: (e as Error).message }),
        ),
        range.future
          ? Promise.resolve<Sessions>({ available: false, error: null, needsPermission: false, rows: [] })
          : cached(`sessions:${range.from}:${range.to}`, 10 * 60_000, fresh, () =>
              getJson<Sessions>(`/api/sessions?from=${range.from}&to=${range.to}`).then((r) => {
                if (!r.available) memo.delete(`sessions:${range.from}:${range.to}`); // ask again next time
                return r;
              }),
            ).catch((e): Sessions => ({ available: false, error: (e as Error).message, needsPermission: false, rows: [] })),
      ]);
      setAds(a);
      setSessions(s);
      setExtrasLoading(false);
    },
    [month, year],
  );

  useEffect(() => {
    void loadExtras(false);
  }, [loadExtras]);

  const normalized = useMemo(() => snapshot?.orders.map(normalize) ?? null, [snapshot]);
  const data: ProfitData | null = useMemo(
    () =>
      normalized && ads
        ? buildProfit(normalized, { month, year }, ads, {
            syncedAt: snapshot!.syncedAt,
            sessions: sessions ?? undefined,
          })
        : null,
    [normalized, ads, sessions, month, year, snapshot],
  );

  const refresh = () => {
    sync.refresh();
    void loadExtras(true);
  };
  return {
    month,
    year,
    setMonthYear,
    data,
    sync: { ...sync, refresh, syncing: sync.syncing || extrasLoading },
    loading: sync.syncing || extrasLoading,
    refresh,
  };
}
