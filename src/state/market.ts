import { createMemo, untrack } from "solid-js";
import { HISTORY_WINDOW_MS } from "../market/funds";
import { livePrices } from "../market/api";
import type { PriceTick } from "../market/types";

/**
 * Global server state: the price history (preloaded during SSR, see `App`) and
 * the live tick that every client receives from the shared broadcast.
 */
export function createMarketFeed(loaded: () => readonly PriceTick[]) {
  const history = loaded;
  // Show the last known prices while the shared live transport connects, so the
  // stream never blocks the first paint.
  const tick = createMemo(() => livePrices(), {
    loadingValue: untrack(() => history()[history().length - 1]),
  });

  // The prices the chart needs: the history plus every live tick, trimmed to a
  // sliding window.
  const ticks = createMemo<readonly PriceTick[]>((prev) => {
    const base = prev ?? history();
    const live = tick();
    const last = base[base.length - 1];
    if (last && live.t <= last.t) return base;
    const start = live.t - HISTORY_WINDOW_MS;
    let first = 0;
    while (first < base.length && base[first].t < start) first++;
    return [...base.slice(first), live];
  });

  return { history, tick, ticks };
}

export type MarketFeed = ReturnType<typeof createMarketFeed>;
