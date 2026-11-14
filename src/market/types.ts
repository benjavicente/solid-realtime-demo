import type { FundId } from "./funds";

/** Names of the events a client can send to the shared market. */
export type MarketEventKind = "send-spy";

/** A temporary shock affecting one fund, active between `startedAt` and `endsAt` (simulated ms). */
export interface MarketEvent {
  readonly kind: MarketEventKind;
  readonly fundId: FundId;
  readonly startedAt: number;
  readonly endsAt: number;
}

/** One simulated instant: the price of every fund in CLP. */
export interface PriceTick {
  /** Simulated time in ms (monotonic, shared by every client). */
  readonly t: number;
  readonly prices: Readonly<Record<FundId, number>>;
  /** The shock in effect at `t`, if any. */
  readonly event?: MarketEvent;
}
