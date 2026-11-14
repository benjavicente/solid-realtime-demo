import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scaleUtc } from "@tanstack/charts/scales/time";
import { CASH_COLOR, FUNDS, HISTORY_WINDOW_MS } from "../../market/funds";
import type { MarketEvent } from "../../market/types";
import type { PortfolioTimeline } from "../../portfolio";
import type { SeriesPoint } from "./series";

export const FRAME = { width: 960, height: 680, left: 72, right: 940, top: 14, bottom: 652 };
export const LAYERS = [...FUNDS, { id: "cash", name: "Caja", color: CASH_COLOR }];
const monthFormat = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const numberFormat = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });
export const moneyFormat = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function formatAxisMoney(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${numberFormat.format(value / 1_000_000)} M`;
  if (Math.abs(value) >= 1_000) return `$${numberFormat.format(value / 1_000)} mil`;
  return moneyFormat.format(value);
}

export function buildGeometry(
  points: readonly SeriesPoint[],
  timeline: PortfolioTimeline,
  events: readonly MarketEvent[] = [],
) {
  const end = points[points.length - 1]?.t ?? timeline.startedAt;
  const start = end - HISTORY_WINDOW_MS;
  // TanStack's standalone scales are SSR-safe. The four ordered layers use a
  // small SVG path builder, avoiding adapter / scene machinery for this demo.
  const x = scaleUtc([start, end], [FRAME.left, FRAME.right]);
  const max = points.reduce((value, point) => Math.max(value, point.total), 0);
  const y = scaleLinear([0, Math.max(1, max * 1.08)], [FRAME.bottom, FRAME.top]).nice(5);
  const positionX = (t: number) => x(t)!;
  const positionY = (value: number) => y(value)!;
  const stacks = points.map((point) => {
    let sum = 0;
    return point.values.map((value) => {
      const bottom = sum;
      sum += value;
      return [bottom, sum] as const;
    });
  });
  const coordinate = (index: number, value: number) =>
    `${positionX(points[index].t).toFixed(2)},${positionY(value).toFixed(2)}`;
  const layers = LAYERS.map((layer, layerIndex) => {
    const upper = points.map((_, i) => coordinate(i, stacks[i][layerIndex][1]));
    const lower = points.map((_, i) => coordinate(i, stacks[i][layerIndex][0])).reverse();
    return { ...layer, path: points.length ? `M${upper.join("L")}L${lower.join("L")}Z` : "" };
  });
  const totalPath = points
    .map((point, i) => `${i ? "L" : "M"}${coordinate(i, point.total)}`)
    .join("");
  const markers = [
    { at: timeline.startedAt, label: "Inicio" },
    ...timeline.changes.map((entry) => ({ at: entry.at, label: "Rebalanceo" })),
  ]
    .filter((entry) => entry.at >= start && entry.at <= end)
    .map((entry) => ({ ...entry, x: positionX(entry.at) }));
  // Shaded spans for market events (e.g. the spy week) inside the window.
  const bands = events
    .filter((event) => event.endsAt > start && event.startedAt < end)
    .map((event) => {
      const x1 = positionX(Math.max(start, event.startedAt));
      const x2 = positionX(Math.min(end, event.endsAt));
      return { kind: event.kind, x: x1, width: Math.max(0, x2 - x1) };
    });
  return {
    layers,
    bands,
    totalPath,
    markers,
    split: Math.min(FRAME.right, Math.max(FRAME.left, positionX(timeline.startedAt))),
    xTicks: x.ticks(7).map((date) => ({
      x: positionX(date.getTime()),
      label: monthFormat.format(date).replaceAll(".", ""),
    })),
    yTicks: y.ticks(5).map((value) => ({ y: positionY(value), label: formatAxisMoney(value) })),
    latestValue: points[points.length - 1]?.total,
    /** Screen position of every sample, for hover lookups. */
    anchors: points.map((point, i) => ({
      point,
      x: positionX(point.t),
      y: positionY(point.total),
      index: i,
    })),
  };
}
