import type { FundId } from "./funds";

/** One simulated instant: the price of every fund in CLP. */
export interface PriceTick {
  /** Simulated time in ms (monotonic, shared by every client). */
  readonly t: number;
  readonly prices: Readonly<Record<FundId, number>>;
}
