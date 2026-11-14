import { broadcast } from "@solidjs/web/server-functions";
import type { MarketEvent, MarketEventKind, PriceTick } from "./types";
import { priceHistory, triggerMarketEvent, watchPrices } from "~/server/simulation";

export const livePrices = broadcast(async function* (): AsyncGenerator<PriceTick> {
  "use server";
  yield* watchPrices();
});

/** The simulated history window, one tick per day, oldest first. */
export async function getPriceHistory(): Promise<PriceTick[]> {
  "use server";
  return [...priceHistory()];
}

const EVENT_KINDS = new Set<string>(["send-spy", "send-moon", "send-retiro"]);

/**
 * Hidden market events (easter eggs). Every viewer sees the effect, since the
 * market is shared server state. See the README for how to send them.
 */
export async function sendMarketEvent(kind: MarketEventKind): Promise<MarketEvent> {
  "use server";
  // The argument comes from the browser: only accept the known event names.
  if (!EVENT_KINDS.has(kind)) throw new Error(`Unknown market event: ${String(kind)}`);
  return triggerMarketEvent(kind);
}
