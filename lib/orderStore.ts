"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { RawOrder } from "./raw";

/**
 * Orders are kept in the browser (IndexedDB) per invoice series (financial year).
 * The first visit downloads everything once; after that only orders that changed since the
 * last sync are fetched (new orders, deliveries, RTOs — a status change updates the order),
 * and every tab and month is computed instantly from the saved copy.
 */

/** Bump when RawOrder's shape changes — older saved copies are then rebuilt. */
export const SNAPSHOT_VERSION = 1;
/** Overlap with the previous sync, so nothing changed around the boundary is missed. */
const OVERLAP_MS = 15 * 60_000;
/** A saved copy younger than this isn't re-synced automatically on page open. */
const FRESH_MS = 60_000;

export interface Snapshot {
  version: number;
  series: string;
  syncedAt: string; // when the last successful sync started
  orders: RawOrder[];
}

type Phase = "idle" | "exporting" | "downloading";

interface SeriesState {
  snapshot: Snapshot | null;
  loaded: boolean; // saved copy read from IndexedDB
  syncing: boolean;
  full: boolean; // current sync downloads everything
  phase: Phase;
  progress: number;
  error: string | null;
}

/** Merge changed orders into the saved ones (by id). */
export function mergeOrders(base: RawOrder[], changed: RawOrder[]): RawOrder[] {
  if (!changed.length) return base;
  const byId = new Map(base.map((o) => [o.id, o]));
  for (const o of changed) byId.set(o.id, o);
  return [...byId.values()];
}

// ---------- IndexedDB (falls back to memory only if unavailable) ----------

let dbPromise: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open("karcare", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("snapshots");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function readSnapshot(series: string): Promise<Snapshot | null> {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const req = d.transaction("snapshots").objectStore("snapshots").get(series);
      req.onsuccess = () => {
        const s = req.result as Snapshot | undefined;
        resolve(s && s.version === SNAPSHOT_VERSION ? s : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeSnapshot(s: Snapshot) {
  const d = await db();
  if (!d) return;
  try {
    d.transaction("snapshots", "readwrite").objectStore("snapshots").put(s, s.series);
  } catch {
    /* storage full or blocked — the in-memory copy still works for this visit */
  }
}

// ---------- shared state per series ----------

const states = new Map<string, SeriesState>();
const listeners = new Map<string, Set<() => void>>();
const inflight = new Map<string, Promise<void>>();

const initial: SeriesState = { snapshot: null, loaded: false, syncing: false, full: false, phase: "idle", progress: 0, error: null };
const get = (series: string) => states.get(series) ?? initial;
function set(series: string, patch: Partial<SeriesState>) {
  states.set(series, { ...get(series), ...patch });
  listeners.get(series)?.forEach((l) => l());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function json<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body.error ?? `Request failed (${res.status})`), { busy: body.busy });
  return body;
}

async function load(series: string) {
  if (get(series).loaded) return;
  const snapshot = await readSnapshot(series);
  set(series, { snapshot: get(series).snapshot ?? snapshot, loaded: true });
}

/** Fetch changed orders (or everything, the first time / when `full`) and save. One sync per series at a time. */
export function syncSeries(series: string, ym: { month: number; year: number }, opts: { full?: boolean } = {}) {
  const running = inflight.get(series);
  if (running) return running;
  const p = (async () => {
    await load(series);
    const prev = get(series).snapshot;
    const full = !!opts.full || !prev;
    const startedAt = new Date().toISOString();
    const since = full ? undefined : new Date(Date.parse(prev!.syncedAt) - OVERLAP_MS).toISOString();
    set(series, { syncing: true, full, phase: "exporting", progress: 0, error: null });
    try {
      type Started = { id?: string; orders?: RawOrder[] };
      let started: Started = {};
      for (let attempt = 0; ; attempt++) {
        try {
          started = await json<Started>(
            await fetch("/api/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...ym, since }),
            }),
          );
          break;
        } catch (e) {
          if (!(e as { busy?: boolean }).busy || attempt > 20) throw e;
          await sleep(3000);
        }
      }
      // Quick refresh: the changed orders came straight back
      let changed = started.orders;
      if (!changed) {
        const id = started.id!;
        for (let wait = 700; ; wait = Math.min(wait * 1.5, 2500)) {
          const st = await json<{ status: string; objectCount: number; errorCode: string | null }>(
            await fetch(`/api/sync?id=${encodeURIComponent(id)}`, { cache: "no-store" }),
          );
          set(series, { progress: st.objectCount });
          if (st.status === "COMPLETED") break;
          if (!["CREATED", "RUNNING"].includes(st.status)) {
            throw new Error(`Shopify export ${st.status.toLowerCase()}${st.errorCode ? ` (${st.errorCode})` : ""}`);
          }
          await sleep(wait);
        }
        set(series, { phase: "downloading" });
        type Page = { total: number; pages: number; orders: RawOrder[] };
        const page = async (n: number) =>
          json<Page>(await fetch(`/api/export?id=${encodeURIComponent(id)}&page=${n}`, { cache: "no-store" }));
        const first = await page(0);
        const rest = await Promise.all(Array.from({ length: first.pages - 1 }, (_, i) => page(i + 1)));
        changed = [first, ...rest].flatMap((p) => p.orders);
      }
      const orders = full ? changed : mergeOrders(get(series).snapshot?.orders ?? [], changed);
      const snapshot: Snapshot = { version: SNAPSHOT_VERSION, series, syncedAt: startedAt, orders };
      set(series, { snapshot, syncing: false, phase: "idle", progress: 0 });
      void writeSnapshot(snapshot);
    } catch (e) {
      set(series, { syncing: false, phase: "idle", error: (e as Error).message });
    }
  })().finally(() => inflight.delete(series));
  inflight.set(series, p);
  return p;
}

/**
 * Orders for one invoice series: the saved copy right away, refreshed in the background.
 * `refresh` fetches only what changed; `rebuild` downloads everything again.
 */
export function useOrderStore(series: string, ym: { month: number; year: number }) {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!listeners.has(series)) listeners.set(series, new Set());
      listeners.get(series)!.add(cb);
      return () => void listeners.get(series)!.delete(cb);
    },
    [series],
  );
  const state = useSyncExternalStore(subscribe, () => get(series), () => initial);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await load(series);
      if (!alive) return;
      const s = get(series).snapshot;
      if (!s || Date.now() - Date.parse(s.syncedAt) > FRESH_MS) void syncSeries(series, ym);
    })();
    return () => {
      alive = false;
    };
    // ym only matters for which series to export; the series key already captures it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series]);

  return {
    ...state,
    refresh: () => syncSeries(series, ym),
    rebuild: () => syncSeries(series, ym, { full: true }),
  };
}
