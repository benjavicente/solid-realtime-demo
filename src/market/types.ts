import type { FundId } from "./funds";

/**
 * Names of the hidden events a client can send to the shared market. Each one
 * replays a recent real market episode (Sep–Nov 2026) on the simulated funds.
 *
 * - `send-spy` (Nov 2026): amid reports of an espionage-related investigation and
 *   the departure of its CEO, Nvidia fell 13% in a week (sixth weekly loss in a row).
 *   Andes Arriesgado slides ~10–15% over 7 days, then partially recovers.
 * - `send-intel` (30 Oct 2026): Intel fell ~29% on weak guidance and tech lost
 *   more than US$1 trillion. Andes crashes ~14–20% over 2 days, Manquehue dips
 *   ~1–3%, Cristóbal is untouched; Andes then wins back ~45% over three weeks.
 * - `send-coreweave` (10–11 Nov 2026): AI rebound, Nasdaq-100's best day since
 *   March and CoreWeave +25%. Andes jumps ~15–25% over 2 days, Manquehue ~2–4%.
 * - `send-afp` (Sep 2026, Chile): rising long-term rates and swap losses sank the
 *   AFPs' Fondo E (−4.9% in the month). Cristóbal Conservador falls ~5–8% over 14
 *   days with elevated volatility, Manquehue ~1–3%; then a partial recovery.
 */
export type MarketEventKind = "send-spy" | "send-intel" | "send-coreweave" | "send-afp";

export const MARKET_EVENT_KINDS: readonly MarketEventKind[] = Object.freeze([
  "send-spy",
  "send-intel",
  "send-coreweave",
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
