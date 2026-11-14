import type { FundId } from "./funds";

/**
 * Names of the hidden events a client can send to the shared market. Each one
 * replays a real market episode on the simulated funds.
 *
 * - `send-deepseek` (27 Jan 2025): DeepSeek released its low-cost R1 model and
 *   Nvidia fell ~17% in one day, erasing ~US$589 billion, the largest single-day
 *   market-cap loss for a company in history; the Nasdaq fell more than 3%. The
 *   tech-heavy Andes Arriesgado crashes ~14–20% over 2 simulated days, Manquehue
 *   dips ~1–3%, Cristóbal is untouched; Andes then wins back ~45% of the loss over
 *   three weeks, as Nvidia did.
 * - `send-nvidia` (25 May 2023): Nvidia guided US$11 billion of quarterly revenue
 *   (vs ~US$7.2 billion expected) on AI demand; the stock rose ~24% in one day,
 *   adding ~US$184 billion and nearing a US$1 trillion valuation, and lifted the
 *   Nasdaq. Andes jumps ~15–25% over 2 days, Manquehue ~2–4%; the euphoria lingers
 *   for a few days and only a small part is given back.
 * - `send-afp` (July 2020, Chile): Ley 21.248 allowed the first 10% withdrawal from
 *   AFP pension funds; to pay it, funds sold bonds and the conservative funds D and
 *   E were hit hardest. Cristóbal Conservador falls ~5–8% over 14 days with
 *   elevated volatility, Manquehue ~1–3%, Andes is barely affected; then a slow,
 *   partial recovery.
 */
export type MarketEventKind = "send-deepseek" | "send-nvidia" | "send-afp";

export const MARKET_EVENT_KINDS: readonly MarketEventKind[] = Object.freeze([
  "send-deepseek",
  "send-nvidia",
  "send-afp",
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
