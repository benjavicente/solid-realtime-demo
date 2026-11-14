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
  /** Soft color used by the chart layer and the stock row. */
  readonly color: string;
}

export const FUNDS: readonly FundProfile[] = [
  {
    id: "andes-arriesgado",
    name: "Andes Arriesgado",
    risk: "high",
    initialPrice: 185_000,
    annualDrift: 0.14,
    annualVolatility: 0.45,
    jumpsPerYear: 3,
    jumpMean: -0.02,
    jumpStd: 0.12,
    color: "#f2a7a0",
  },
  {
    id: "manquehue-moderado",
    name: "Manquehue Moderado",
    risk: "medium",
    initialPrice: 12_500,
    annualDrift: 0.08,
    annualVolatility: 0.16,
    jumpsPerYear: 0,
    jumpMean: 0,
    jumpStd: 0,
    color: "#f5d491",
  },
  {
    id: "cristobal-conservador",
    name: "Cristóbal Conservador",
    risk: "low",
    initialPrice: 1_000,
    annualDrift: 0.04,
    annualVolatility: 0.04,
    jumpsPerYear: 0,
    jumpMean: 0,
    jumpStd: 0,
    color: "#a8d5ba",
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
  "andes-arriesgado": 10,
  "manquehue-moderado": 30,
  "cristobal-conservador": 60,
};

/** Capital every client starts with, in CLP. */
export const INITIAL_CAPITAL_CLP = 250_000_000;

/** Color of the cash layer. */
export const CASH_COLOR = "#cfd4da";

// Simulated clock: one tick per simulated day, every 2 real seconds.
export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
export const YEAR_MS = 365 * DAY_MS;
export const SIM_MS_PER_TICK = DAY_MS;
export const REAL_MS_PER_TICK = 2_000;
/** Length of the price history the server keeps and the chart shows (~3 months). */
export const HISTORY_WINDOW_MS = 90 * DAY_MS;
