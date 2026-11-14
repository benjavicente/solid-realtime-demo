import { FUND_IDS, FUNDS, HISTORY_WINDOW_MS, type FundId } from "../../market/funds";
import type { PriceTick } from "../../market/types";
import type { Portfolio, PortfolioTimeline } from "../../portfolio";

export interface SeriesPoint {
  readonly t: number;
  /** Bottom to top: FUNDS order, then cash. */
  readonly values: readonly number[];
  readonly total: number;
}

function lowerBound(ticks: readonly PriceTick[], t: number): number {
  let low = 0;
  let high = ticks.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (ticks[mid].t < t) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Linear prices at window / rebalance boundaries; never extrapolate history. */
function tickAt(ticks: readonly PriceTick[], t: number): PriceTick {
  const right = lowerBound(ticks, t);
  if (right === 0) return ticks[0];
  if (right === ticks.length) return ticks[ticks.length - 1];
  if (ticks[right].t === t) return ticks[right];
  const a = ticks[right - 1];
  const b = ticks[right];
  const ratio = (t - a.t) / (b.t - a.t);
  const prices = Object.fromEntries(
    FUND_IDS.map((id) => [id, a.prices[id] + ratio * (b.prices[id] - a.prices[id])]),
  ) as Record<FundId, number>;
  return { t, prices };
}

function valuePoint(tick: PriceTick, portfolio: Portfolio): SeriesPoint {
  const values = FUNDS.map((fund) => portfolio.shares(fund.id) * tick.prices[fund.id]);
  values.push(portfolio.shares("cash"));
  return { t: tick.t, values, total: values.reduce((sum, value) => sum + value, 0) };
}

/** Samples the visible year, preserving endpoints and instantaneous allocation changes. */
export function buildSeries(
  ticks: readonly PriceTick[],
  timeline: PortfolioTimeline,
  maxPoints = 400,
): readonly SeriesPoint[] {
  if (!ticks.length) return [];
  const limit = Number.isFinite(maxPoints) ? Math.max(2, Math.floor(maxPoints)) : 400;
  const end = ticks[ticks.length - 1].t;
  const start = Math.max(end - HISTORY_WINDOW_MS, ticks[0].t);
  const first = tickAt(ticks, start);
  const last = ticks[ticks.length - 1];
  if (start === end) return [valuePoint(last, timeline.at(end))];

  // Reserve two coincident points per change so layer boundaries jump vertically.
  // If changes alone exhaust the budget, keep the most recent complete pairs.
  const changes = [
    ...new Map(
      timeline.changes
        .filter((entry) => entry.at > start && entry.at <= end)
        .map((entry) => [entry.at, entry]),
    ).values(),
  ];
  const eventBudget = Math.floor((limit - 2) / 2);
  const retainedChanges = eventBudget > 0 ? changes.slice(-eventBudget) : [];
  const budget = limit - retainedChanges.length * 2;
  const selected: SeriesPoint[] = [valuePoint(first, timeline.at(start))];
  const low = lowerBound(ticks, start);
  const span = ticks.length - 1 - low;
  for (let i = 1; i < budget - 1; i++) {
    const index = low + Math.round((i * span) / (budget - 1));
    const tick = ticks[index];
    if (tick.t > start && tick.t < end && tick.t !== selected[selected.length - 1].t) {
      selected.push(valuePoint(tick, timeline.at(tick.t)));
    }
  }
  selected.push(valuePoint(last, timeline.at(end)));
  for (const entry of retainedChanges) {
    const tick = tickAt(ticks, entry.at);
    // Replace regular samples at the event with the ordered before/after pair.
    const index = selected.findIndex((point) => point.t === entry.at);
    if (index !== -1) selected.splice(index, 1);
    selected.push(valuePoint(tick, timeline.at(entry.at - 1)));
    selected.push(valuePoint(tick, entry.portfolio));
  }
  return selected.sort((a, b) => a.t - b.t);
}
