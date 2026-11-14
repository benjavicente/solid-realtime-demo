import { describe, expect, it } from "vitest";
import { DAY_MS, FUNDS, type FundId } from "~/market/funds";
import type { PriceTick } from "~/market/types";
import { createMarket, DEFAULT_SEED } from "./simulation";

const SEEDS = [DEFAULT_SEED, 1, 2, 3, 42, 1234, 98765, 0xc0ffee];
const WINDOW = 90;
const RISKY: FundId = "andes-arriesgado";
const MODERATE: FundId = "manquehue-moderado";
const CONSERVATIVE: FundId = "cristobal-conservador";

function run(seed: number, days: number): PriceTick[] {
  const market = createMarket(seed);
  return Array.from({ length: days }, () => market.step());
}

function series(ticks: readonly PriceTick[], id: FundId) {
  return ticks.map((tick) => tick.prices[id]);
}

function logReturns(prices: readonly number[]) {
  return prices.slice(1).map((price, i) => Math.log(price / prices[i]!));
}

function std(values: readonly number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1),
  );
}

function annualizedVol(prices: readonly number[]) {
  return std(logReturns(prices)) * Math.sqrt(365);
}

function maxDrawdown(prices: readonly number[]) {
  let peak = prices[0]!;
  let worst = 0;
  for (const price of prices) {
    peak = Math.max(peak, price);
    worst = Math.max(worst, 1 - price / peak);
  }
  return worst;
}

/** Lag-1 autocorrelation of absolute returns: positive when volatility clusters. */
function absReturnAutocorrelation(prices: readonly number[]) {
  const abs = logReturns(prices).map(Math.abs);
  const mean = abs.reduce((sum, value) => sum + value, 0) / abs.length;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < abs.length; i++) {
    denominator += (abs[i]! - mean) ** 2;
    if (i > 0) numerator += (abs[i]! - mean) * (abs[i - 1]! - mean);
  }
  return numerator / denominator;
}

function correlation(a: readonly number[], b: readonly number[]) {
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let i = 0; i < a.length; i++) {
    covariance += (a[i]! - meanA) * (b[i]! - meanB);
    varianceA += (a[i]! - meanA) ** 2;
    varianceB += (b[i]! - meanB) ** 2;
  }
  return covariance / Math.sqrt(varianceA * varianceB);
}

function median(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

describe("market simulation", () => {
  it("is reproducible for a seed", () => {
    expect(run(7, 30)).toEqual(run(7, 30));
  });

  it("orders realized volatility conservative << moderate << risky", () => {
    for (const seed of SEEDS) {
      const ticks = run(seed, 3 * 365);
      const conservative = annualizedVol(series(ticks, CONSERVATIVE));
      const moderate = annualizedVol(series(ticks, MODERATE));
      const risky = annualizedVol(series(ticks, RISKY));
      expect(conservative).toBeLessThan(0.03);
      expect(moderate).toBeGreaterThan(3 * conservative);
      expect(moderate).toBeGreaterThan(0.08);
      expect(moderate).toBeLessThan(0.2);
      expect(risky).toBeGreaterThan(3 * moderate);
      expect(risky).toBeLessThan(0.9);
    }
  });

  it("keeps the conservative fund's 90-day drawdown small and its trend upward", () => {
    for (const seed of SEEDS) {
      const ticks = run(seed, 20 * WINDOW);
      for (let start = 0; start < ticks.length; start += WINDOW) {
        const prices = series(ticks.slice(start, start + WINDOW), CONSERVATIVE);
        expect(maxDrawdown(prices)).toBeLessThan(0.015);
      }
      const prices = series(ticks, CONSERVATIVE);
      expect(prices.at(-1)!).toBeGreaterThan(prices[0]!);
    }
  });

  it("gives the risky fund volatility clustering and deep drawdowns", () => {
    const riskyDrawdowns: number[] = [];
    const moderateDrawdowns: number[] = [];
    for (const seed of SEEDS) {
      const ticks = run(seed, 10 * 365);
      expect(absReturnAutocorrelation(series(ticks, RISKY))).toBeGreaterThan(0.08);
      for (let start = 0; start < ticks.length; start += WINDOW) {
        const window = ticks.slice(start, start + WINDOW);
        riskyDrawdowns.push(maxDrawdown(series(window, RISKY)));
        moderateDrawdowns.push(maxDrawdown(series(window, MODERATE)));
      }
    }
    expect(median(riskyDrawdowns)).toBeGreaterThan(3 * median(moderateDrawdowns));
    expect(Math.max(...riskyDrawdowns)).toBeGreaterThan(0.4);
  });

  it("keeps prices positive and bounded over 20 simulated years", () => {
    for (const seed of SEEDS) {
      const ticks = run(seed, 20 * 365);
      for (const fund of FUNDS) {
        const prices = series(ticks, fund.id);
        expect(Math.min(...prices)).toBeGreaterThan(0.05 * fund.initialPrice);
        expect(Math.max(...prices)).toBeLessThan(40 * fund.initialPrice);
        for (const price of prices) expect(Math.round(price * 100) / 100).toBe(price);
      }
    }
  });

  it("send-spy sinks the risky fund for 7 days and tags only those ticks", () => {
    const losses: number[] = [];
    for (const seed of SEEDS) {
      const market = createMarket(seed);
      for (let i = 0; i < WINDOW; i++) market.step();
      const before = market.step();
      const event = market.trigger("send-spy");
      expect(event).toMatchObject({ kind: "send-spy", fundId: RISKY });
      expect(event.startedAt).toBe(before.t + DAY_MS);
      expect(event.endsAt - event.startedAt).toBe(7 * DAY_MS);
      expect(Object.isFrozen(event)).toBe(true);

      const during = Array.from({ length: 7 }, () => market.step());
      for (const tick of during) expect(tick.event).toBe(event);
      const after = Array.from({ length: 20 }, () => market.step());
      for (const tick of after) expect("event" in tick).toBe(false);
      expect("event" in before).toBe(false);

      const loss = 1 - during.at(-1)!.prices[RISKY] / before.prices[RISKY];
      expect(loss).toBeGreaterThan(0.05);
      expect(loss).toBeLessThan(0.45);
      losses.push(loss);
    }
    expect(median(losses)).toBeGreaterThan(0.14);
    expect(median(losses)).toBeLessThan(0.3);
  });

  it("extends a running spy event instead of stacking it", () => {
    const market = createMarket(5);
    for (let i = 0; i < WINDOW; i++) market.step();
    const first = market.trigger("send-spy");
    market.step();
    market.step();
    const second = market.trigger("send-spy");
    market.trigger("send-spy");
    const third = market.trigger("send-spy");
    expect(third.startedAt).toBe(first.startedAt);
    expect(third.endsAt).toBe(second.endsAt);
    expect(third.endsAt).toBe(market.now() + 8 * DAY_MS);
    const ticks = Array.from({ length: 10 }, () => market.step());
    expect(ticks.filter((tick) => tick.event).length).toBe(7);
  });

  it("prints a per-fund summary", () => {
    const rows: Record<string, string>[] = [];
    for (const seed of SEEDS.slice(0, 5)) {
      const ticks = run(seed, WINDOW);
      const year = run(seed, 365);
      for (const fund of FUNDS) {
        const window = series(ticks, fund.id);
        rows.push({
          seed: seed.toString(16),
          fund: fund.name,
          "annual vol (1y)": `${(annualizedVol(series(year, fund.id)) * 100).toFixed(1)}%`,
          "90d max DD": `${(maxDrawdown(window) * 100).toFixed(2)}%`,
          "90d return": `${((window.at(-1)! / window[0]! - 1) * 100).toFixed(2)}%`,
        });
      }
    }
    console.table(rows);

    const ticks = run(DEFAULT_SEED, 10 * 365);
    const returns = Object.fromEntries(
      FUNDS.map((fund) => [fund.id, logReturns(series(ticks, fund.id))]),
    ) as Record<FundId, number[]>;
    const spyLosses = SEEDS.map((seed) => {
      const market = createMarket(seed);
      for (let i = 0; i < WINDOW; i++) market.step();
      const before = market.step().prices[RISKY];
      market.trigger("send-spy");
      let last = before;
      for (let i = 0; i < 7; i++) last = market.step().prices[RISKY];
      return `${((last / before - 1) * 100).toFixed(1)}%`;
    });
    console.log({
      "corr risky/moderate": correlation(returns[RISKY], returns[MODERATE]).toFixed(2),
      "corr risky/conservative": correlation(returns[RISKY], returns[CONSERVATIVE]).toFixed(2),
      "corr moderate/conservative": correlation(returns[MODERATE], returns[CONSERVATIVE]).toFixed(
        2,
      ),
      "abs-return lag-1 autocorrelation (risky)": absReturnAutocorrelation(
        series(ticks, RISKY),
      ).toFixed(2),
      "send-spy 7-day return per seed": spyLosses.join(", "),
    });
  });
});
