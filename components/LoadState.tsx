import { monthLabel } from "@/lib/dates";
import { Alert, btn, Card, Spinner } from "./ui";

/** Progress while Shopify prepares the export, and errors with a retry. */
export function LoadState({ phase, progress, error, month, year, onRetry, hasData }: {
  phase: "exporting" | "loading" | "ready" | "error";
  progress: number;
  error: string | null;
  month: number;
  year: number;
  onRetry: () => void;
  hasData: boolean;
}) {
  if (phase === "error") {
    return (
      <Alert>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Couldn&apos;t load orders: {error}</span>
          <button className={btn.secondary} onClick={onRetry}>
            Try again
          </button>
        </div>
      </Alert>
    );
  }
  if (phase === "ready" || hasData) return null;
  return (
    <Card>
      <div className="flex flex-col items-center gap-2 py-10 text-sm text-slate-500">
        <div className="flex items-center gap-2 font-medium text-slate-700">
          <Spinner />
          {phase === "exporting" ? "Shopify is preparing your orders…" : `Loading ${monthLabel(month, year)}…`}
        </div>
        {phase === "exporting" && (
          <div className="text-xs">
            {progress > 0 ? `${progress.toLocaleString("en-IN")} records so far` : "Starting export"} · usually 10–40 seconds.
            Every order since the start of the financial year is counted so invoice numbers stay in order.
          </div>
        )}
      </div>
    </Card>
  );
}
