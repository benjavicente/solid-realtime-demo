import { createMemo } from "solid-js";
import { HISTORY_WINDOW_MS } from "../market/funds";
import { getPriceHistory, livePrices } from "../market/api";
import type { PriceTick } from "../market/types";

/**
 * Global server state: the price history (fetched once) and the live tick that
 * every client receives from the shared broadcast. Async memos: read them under
 * `<Loading>`.
 */
export function createMarketFeed() {
  const history = createMemo(() => getPriceHistory());
  const tick = createMemo(() => livePrices());

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
