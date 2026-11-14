import type { FundId } from "./funds";

/**
 * Names of the hidden events a client can send to the shared market.
 *
 * - `send-spy`: a leak hits Andes Arriesgado; it falls ~15–28% over 7 simulated
 *   days, then recovers about a third of the loss.
 * - `send-moon`: a market-wide euphoria for 7 days. Every fund inflates, scaled by
 *   risk (Andes ~+20–40%, Manquehue ~+5–10%, Cristóbal ~+1–2%), then gives back
 *   about a third of the gain over two weeks.
 * - `send-retiro`: mass pension withdrawals (as in Chile's 2020 AFP 10% withdrawals)
 *   force bond sales for 14 days. Cristóbal Conservador falls ~5–8%, Manquehue
 *   ~1–3%, Andes is barely affected; then a slow, partial recovery.
 */
export type MarketEventKind = "send-spy" | "send-moon" | "send-retiro";

export const MARKET_EVENT_KINDS: readonly MarketEventKind[] = Object.freeze([
  "send-spy",
  "send-moon",
  "send-retiro",
]);

/** A temporary shock, active between `startedAt` and `endsAt` (simulated ms). */
export interface MarketEvent {
  readonly kind: MarketEventKind;
  /** The fund the event targets; undefined when it moves the whole market. */
  readonly fundId?: FundId;
  readonly startedAt: number;
  readonly endsAt: number;
}

/** One simulated instant: the price of every fund in CLP. */
export interface PriceTick {
  /** Simulated time in ms (monotonic, shared by every client). */
  readonly t: number;
  readonly prices: Readonly<Record<FundId, number>>;
  /**
   * The events in effect at `t`, at most one per kind, in `MARKET_EVENT_KINDS`
   * order. Absent when none is active.
   */
  readonly events?: readonly MarketEvent[];
}
