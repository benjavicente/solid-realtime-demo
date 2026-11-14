// Shared market configuration, imported by both the server simulation and the
// client. Everything here is plain data so it can cross the server boundary.

export type FundId = "andes-arriesgado" | "manquehue-moderado" | "cristobal-conservador";

export type RiskLevel = "high" | "medium" | "low";

export interface FundProfile {
  readonly id: FundId;
  /** Display name (Spanish UI). */
  readonly name: string;
  readonly risk: RiskLevel;
  /** Price in CLP when the simulation starts. */
  readonly initialPrice: number;
  /** Expected yearly log-return (geometric Brownian motion drift). */
  readonly annualDrift: number;
  /** Yearly volatility of log-returns. */
  readonly annualVolatility: number;
  /** Expected number of sudden jumps per simulated year (0 = none). */
  readonly jumpsPerYear: number;
  /** Mean and standard deviation of the log-size of a jump. */
  readonly jumpMean: number;
  readonly jumpStd: number;
  /**
   * Chart layer and row color. All funds share one green hue; darker means riskier.
   * Layers are also separated by white strokes so they stay distinguishable.
   */
  readonly color: string;
}

export const FUNDS: readonly FundProfile[] = [
  {
    id: "andes-arriesgado",
    name: "Andes Arriesgado",
    risk: "high",
    initialPrice: 185_000,
    annualDrift: 0.2,
    annualVolatility: 0.6,
    jumpsPerYear: 5,
    jumpMean: -0.025,
    jumpStd: 0.1,
    color: "#1f4a3b",
  },
  {
    id: "manquehue-moderado",
    name: "Manquehue Moderado",
    risk: "medium",
    initialPrice: 12_500,
    annualDrift: 0.08,
    annualVolatility: 0.15,
    jumpsPerYear: 1,
    jumpMean: -0.02,
    jumpStd: 0.015,
    color: "#4a8a6d",
  },
  {
    id: "cristobal-conservador",
    name: "Cristóbal Conservador",
    risk: "low",
    initialPrice: 1_000,
    annualDrift: 0.05,
    annualVolatility: 0.022,
    jumpsPerYear: 1,
    jumpMean: -0.004,
    jumpStd: 0.002,
    color: "#9dd0b6",
  },
];

export const FUND_IDS: readonly FundId[] = FUNDS.map((fund) => fund.id);

export function getFund(id: FundId): FundProfile {
  const fund = FUNDS.find((candidate) => candidate.id === id);
  if (!fund) throw new Error(`Unknown fund: ${id}`);
  return fund;
}

/** Initial allocation plan, in percent. Also the default target inputs. */
export const INITIAL_PLAN: Readonly<Record<FundId, number>> = {
  "andes-arriesgado": 60,
  "manquehue-moderado": 30,
  "cristobal-conservador": 10,
};

/** Capital every client starts with, in CLP. */
export const INITIAL_CAPITAL_CLP = 250_000_000;

/** Color of the cash layer. */
export const CASH_COLOR = "#e2ece6";

// Simulated clock: one tick per simulated day, every 2 real seconds.
export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
export const YEAR_MS = 365 * DAY_MS;
export const SIM_MS_PER_TICK = DAY_MS;
export const REAL_MS_PER_TICK = 2_000;
/**
 * Extra history the client keeps and the chart draws just left of the visible
 * window, so data slides out of view instead of being cut when a tick arrives.
 */
export const CHART_OVERSCAN_MS = 3 * DAY_MS;
/** Length of the price history the server keeps and the chart shows (~3 months). */
export const HISTORY_WINDOW_MS = 90 * DAY_MS;
