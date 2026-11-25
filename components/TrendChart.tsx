"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatINR } from "@/lib/invoice";
import type { ProfitData } from "@/lib/profit";
import { todayIST, trendPoints, type TrendPoint } from "@/lib/trend";

// Categorical hues (fixed order): revenue, ROAS, CVR
const COLOR = { revenue: "#257de0", roas: "#f47230", cvr: "#00b894" };
const INK = { label: "#64748b", faint: "#94a3b8", grid: "#e2e8f0", axis: "#cbd5e1" };

const PANEL_H = 78;
const TITLE_H = 22;
const GAP = 14;
const LEFT = 52;
const RIGHT = 10;
const AXIS_H = 22;

const rupees = (n: number) => `₹${formatINR(Math.round(n)).replace(/\.00$/, "")}`;
const compact = (n: number) => (n >= 1e5 ? `₹${(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `₹${Math.round(n / 1e3)}k` : `₹${Math.round(n)}`);
const x2 = (n: number | null) => (n === null ? "–" : `${n.toFixed(2)}×`);
const pc = (n: number | null) => (n === null ? "–" : `${(n * 100).toFixed(1)}%`);
const dayLabel = (d: string) => new Date(`${d}T06:30:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const weekday = (d: string) => new Date(`${d}T06:30:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" });
const shortName = (title: string) => title.split(" - ")[0];

/** A round number at or just above `max`, so the top gridline gets a clean label. */
function niceMax(max: number) {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}

/** Line path that breaks at missing values. */
function linePath(vals: (number | null)[], x: (i: number) => number, y: (v: number) => number) {
  let d = "";
  let open = false;
  vals.forEach((v, i) => {
    if (v === null) return void (open = false);
    d += `${open ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    open = true;
  });
  return d;
}

function Delta({ now, before, fmt, points = false }: { now: number | null; before: number | null; fmt: (n: number) => string; points?: boolean }) {
  if (now === null || before === null) return null;
  const diff = now - before;
  const rel = points ? null : before ? diff / before : null;
  if (Math.abs(diff) < 1e-9) return <span className="text-slate-400">no change</span>;
  const up = diff > 0;
  return (
    <span className={up ? "text-emerald-700" : "text-rose-700"}>
      {up ? "▲" : "▼"} {rel !== null ? `${Math.abs(rel * 100).toFixed(0)}%` : fmt(Math.abs(diff))}
    </span>
  );
}

function Headline({ label, color, value, delta }: { label: string; color: string; value: string; delta: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="text-lg font-semibold tabular-nums text-slate-900">{value}</span>
        <span className="text-xs tabular-nums">{delta}</span>
      </div>
    </div>
  );
}

/**
 * Daily trends for complete days: revenue, ROAS and CVR as three small panels that share one
 * day axis (never two scales on one chart). Hover or tap a day to read all three at once.
 */
export function TrendChart({ data }: { data: ProfitData }) {
  const [product, setProduct] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(720);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const productKeys = data.products.map((p) => p.key);
  const selected = product && productKeys.includes(product) ? product : null;
  const pts: TrendPoint[] = useMemo(() => trendPoints(data.days, selected, todayIST()), [data.days, selected]);

  const n = pts.length;
  const plotW = width - LEFT - RIGHT;
  const step = n ? plotW / n : plotW;
  const x = (i: number) => LEFT + step * (i + 0.5);
  const panelTop = (k: number) => k * (TITLE_H + PANEL_H + GAP) + TITLE_H;
  const height = panelTop(2) + PANEL_H + AXIS_H;

  const revMax = niceMax(Math.max(0, ...pts.map((p) => p.revenue)));
  const roasVals = pts.map((p) => p.roas);
  const cvrVals = pts.map((p) => p.cvr);
  const roasMax = niceMax(Math.max(0, ...roasVals.map((v) => v ?? 0)));
  const cvrMax = niceMax(Math.max(0, ...cvrVals.map((v) => v ?? 0)));
  const yIn = (k: number, max: number) => (v: number) => panelTop(k) + PANEL_H - (Math.max(0, v) / max) * PANEL_H;

  const last = pts[n - 1];
  const prev = pts[n - 2];
  const visits = data.sessions;
  // Kept short so they fit a phone; the page shows the full reason above
  const cvrNote = !visits.available ? (visits.needsPermission ? "Needs a Shopify permission — see note above" : "Store visits not available") : null;
  const roasNote = roasVals.every((v) => v === null) ? "No ad spend entered for these days" : null;

  // X labels: as many as fit without touching
  const every = Math.max(1, Math.ceil(44 / step));
  const barW = Math.max(2, Math.min(18, step * 0.62));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const i = Math.floor((e.clientX - rect.left - LEFT) / step);
    setHover(i >= 0 && i < n ? i : null);
  };
  const h = hover !== null ? pts[hover] : null;

  const panel = (k: number, title: string, color: string, note: string | null, max: number, fmt: (v: number) => string, children: ReactNode) => (
    <g>
      <text x={LEFT} y={panelTop(k) - 8} fontSize="11" fill={INK.label} fontWeight={500}>
        <tspan fill={color}>■ </tspan>
        {title}
      </text>
      <line x1={LEFT} x2={width - RIGHT} y1={panelTop(k)} y2={panelTop(k)} stroke={INK.grid} strokeDasharray="2 3" />
      <line x1={LEFT} x2={width - RIGHT} y1={panelTop(k) + PANEL_H} y2={panelTop(k) + PANEL_H} stroke={INK.axis} />
      {!note && (
        <>
          <text x={LEFT - 6} y={panelTop(k) + 4} fontSize="10" fill={INK.faint} textAnchor="end">{fmt(max)}</text>
          <text x={LEFT - 6} y={panelTop(k) + PANEL_H} fontSize="10" fill={INK.faint} textAnchor="end">0</text>
        </>
      )}
      {note ? (
        <text x={LEFT + plotW / 2} y={panelTop(k) + PANEL_H / 2 + 4} fontSize="11" fill={INK.faint} textAnchor="middle">
          {note}
        </text>
      ) : (
        children
      )}
    </g>
  );

  const dots = (vals: (number | null)[], y: (v: number) => number, color: string) =>
    vals.map((v, i) =>
      v !== null && (vals[i - 1] ?? null) === null && (vals[i + 1] ?? null) === null ? (
        <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={color} />
      ) : null,
    );

  return (
    <div ref={box}>
      {/* Filter row */}
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Product">
        {[null, ...productKeys].map((k) => (
          <button
            key={k ?? "all"}
            onClick={() => setProduct(k)}
            aria-pressed={selected === k}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              selected === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {k ? shortName(k) : "All products"}
          </button>
        ))}
      </div>

      {n === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">No complete days yet this month — today shows up here tomorrow.</p>
      ) : (
        <>
          {last && (
            <div className="mb-4 grid grid-cols-3 gap-4 border-b border-slate-100 pb-4">
              <Headline
                label={`Revenue · ${dayLabel(last.day)}`}
                color={COLOR.revenue}
                value={rupees(last.revenue)}
                delta={prev && <Delta now={last.revenue} before={prev.revenue} fmt={rupees} />}
              />
              <Headline
                label="ROAS"
                color={COLOR.roas}
                value={x2(last.roas)}
                delta={prev && <Delta now={last.roas} before={prev.roas} fmt={(v) => `${v.toFixed(2)}×`} points />}
              />
              <Headline
                label="CVR"
                color={COLOR.cvr}
                value={pc(last.cvr)}
                delta={prev && <Delta now={last.cvr} before={prev.cvr} fmt={(v) => `${(v * 100).toFixed(1)} pts`} points />}
              />
              {prev && <p className="col-span-3 -mt-2 text-xs text-slate-400">Last full day, compared with {dayLabel(prev.day)}</p>}
            </div>
          )}

          <div className="relative select-none">
            <svg width={width} height={height} role="img" aria-label="Daily revenue, ROAS and CVR" className="block">
              {panel(0, "Revenue (collected, incl. GST)", COLOR.revenue, null, revMax, compact,
                pts.map((p, i) => {
                  const y = yIn(0, revMax)(p.revenue);
                  const hgt = panelTop(0) + PANEL_H - y;
                  if (hgt <= 0) return null;
                  const r = Math.min(4, barW / 2, hgt);
                  const x0 = x(i) - barW / 2;
                  const base = panelTop(0) + PANEL_H;
                  return (
                    <path
                      key={p.day}
                      d={`M${x0},${base}V${y + r}Q${x0},${y} ${x0 + r},${y}H${x0 + barW - r}Q${x0 + barW},${y} ${x0 + barW},${y + r}V${base}Z`}
                      fill={COLOR.revenue}
                      opacity={hover === null || hover === i ? 1 : 0.45}
                    />
                  );
                }),
              )}

              {panel(1, "ROAS (collected ÷ ad spend)", COLOR.roas, roasNote, roasMax, (v) => `${v.toFixed(v < 10 ? 1 : 0)}×`,
                <>
                  <path d={linePath(roasVals, x, yIn(1, roasMax))} fill="none" stroke={COLOR.roas} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {dots(roasVals, yIn(1, roasMax), COLOR.roas)}
                </>,
              )}

              {panel(2, "CVR (orders ÷ product page visits)", COLOR.cvr, cvrNote, cvrMax, (v) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`,
                <>
                  <path d={linePath(cvrVals, x, yIn(2, cvrMax))} fill="none" stroke={COLOR.cvr} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {dots(cvrVals, yIn(2, cvrMax), COLOR.cvr)}
                </>,
              )}

              {/* Day axis */}
              {pts.map((p, i) =>
                (n - 1 - i) % every === 0 ? (
                  <text key={p.day} x={x(i)} y={height - 6} fontSize="10" fill={INK.faint} textAnchor="middle">
                    {Number(p.day.slice(8))}
                  </text>
                ) : null,
              )}

              {/* Crosshair */}
              {h && hover !== null && (
                <g pointerEvents="none">
                  <line x1={x(hover)} x2={x(hover)} y1={panelTop(0)} y2={panelTop(2) + PANEL_H} stroke="#334155" strokeWidth={1} strokeDasharray="3 3" />
                  {h.roas !== null && !roasNote && (
                    <circle cx={x(hover)} cy={yIn(1, roasMax)(h.roas)} r={4} fill={COLOR.roas} stroke="#fff" strokeWidth={2} />
                  )}
                  {h.cvr !== null && !cvrNote && (
                    <circle cx={x(hover)} cy={yIn(2, cvrMax)(h.cvr)} r={4} fill={COLOR.cvr} stroke="#fff" strokeWidth={2} />
                  )}
                </g>
              )}

              <rect
                x={LEFT}
                y={0}
                width={plotW}
                height={height - AXIS_H}
                fill="transparent"
                onPointerMove={onMove}
                onPointerDown={onMove}
                onPointerLeave={() => setHover(null)}
              />
            </svg>

            {h && hover !== null && (
              <div
                className="pointer-events-none absolute top-1 z-10 w-48 rounded-lg border border-slate-200 bg-white/95 p-2.5 text-xs shadow-lg"
                style={x(hover) > width / 2 ? { right: width - x(hover) + 10 } : { left: x(hover) + 10 }}
              >
                <div className="mb-1.5 font-medium text-slate-900">
                  {weekday(h.day)}, {dayLabel(h.day)}
                </div>
                {[
                  { c: COLOR.revenue, k: "Revenue", v: rupees(h.revenue) },
                  { c: COLOR.roas, k: "ROAS", v: x2(h.roas) },
                  { c: COLOR.cvr, k: "CVR", v: pc(h.cvr) },
                ].map((r) => (
                  <div key={r.k} className="flex items-center justify-between gap-3 py-0.5">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: r.c }} />
                      {r.k}
                    </span>
                    <span className="font-medium tabular-nums text-slate-900">{r.v}</span>
                  </div>
                ))}
                <div className="mt-1.5 border-t border-slate-100 pt-1.5 text-slate-500">
                  {h.orders} orders · ad spend {h.adSpend ? rupees(h.adSpend) : "–"} · visits {h.sessions ?? "–"}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
