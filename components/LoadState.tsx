"use client";

import { useEffect, useState } from "react";
import type { SyncInfo } from "@/lib/useMonthData";
import { Alert, btn, Card, Spinner } from "./ui";

function ago(iso: string, now: number) {
  const m = Math.floor((now - Date.parse(iso)) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

/**
 * First visit: progress while Shopify prepares every order once.
 * After that: a one-line freshness note — the saved data shows instantly and refreshes in the background.
 */
export function LoadState({ sync }: { sync: SyncInfo }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (sync.firstLoad) {
    if (sync.error) {
      return (
        <Alert>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Couldn&apos;t load orders: {sync.error}</span>
            <button className={btn.secondary} onClick={sync.rebuild}>
              Try again
            </button>
          </div>
        </Alert>
      );
    }
    return (
      <Card>
        <div className="flex flex-col items-center gap-2 py-10 text-sm text-slate-500">
          <div className="flex items-center gap-2 font-medium text-slate-700">
            <Spinner />
            {sync.phase === "downloading" ? "Downloading orders…" : sync.phase === "exporting" ? "Shopify is preparing your orders…" : "Opening saved orders…"}
          </div>
          {sync.phase === "exporting" && (
            <div className="max-w-md text-center text-xs">
              {sync.progress > 0 ? `${sync.progress.toLocaleString("en-IN")} records so far` : "Starting export"} · only on the
              first visit in this browser (10–40 seconds). After this, the saved orders open instantly and only changes are
              fetched.
            </div>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
      {sync.syncing ? (
        <span className="flex items-center gap-1.5">
          <Spinner />
          {sync.full ? "Reloading every order from Shopify…" : "Checking Shopify for new orders and status changes…"}
        </span>
      ) : sync.error ? (
        <span className="text-rose-700">
          Couldn&apos;t refresh: {sync.error} — showing data from {sync.syncedAt ? ago(sync.syncedAt, now) : "earlier"}.{" "}
          <button className="underline" onClick={sync.refresh}>
            Try again
          </button>
        </span>
      ) : (
        <span>Up to date · synced {sync.syncedAt ? ago(sync.syncedAt, now) : "—"}</span>
      )}
      {!sync.syncing && (
        <button
          className="text-slate-400 underline decoration-dotted hover:text-slate-600"
          title="Download every order again (only needed if something looks off)"
          onClick={sync.rebuild}
        >
          Reload everything
        </button>
      )}
    </div>
  );
}
