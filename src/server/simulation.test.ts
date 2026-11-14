import { describe, expect, it } from "vitest";
import { DAY_MS, FUNDS, type FundId } from "~/market/funds";
import { MARKET_EVENT_KINDS, type MarketEventKind, type PriceTick } from "~/market/types";
import { createMarket, DEFAULT_SEED } from "./simulation";

const SEEDS = [DEFAULT_SEED, 1, 2, 3, 42, 1234, 98765, 0xc0ffee];
const WINDOW = 90;
const RISKY: FundId = "andes-arriesgado";
const MODERATE: FundId = "manquehue-moderado";
const CONSERVATIVE: FundId = "cristobal-conservador";

const MANY_SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 7919);

function mulberry(seed: number) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Warms up a market, triggers `kind`, and returns the ticks around the event. */
function runEvent(seed: number, kind: MarketEventKind, days: number, afterDays: number) {
  const market = createMarket(seed);
  for (let i = 0; i < WINDOW; i++) market.step();
  const before = market.step();
  market.trigger(kind);
  const during = Array.from({ length: days }, () => market.step());
  const after = Array.from({ length: afterDays }, () => market.step());
  return { before, during, after };
}

/**
 * Log-effect of an event on each fund, `days` after it was triggered: the price
 * against the same seed without the event (events draw from their own stream).
 */
function eventEffect(seed: number, kind: MarketEventKind, days: readonly number[]) {
  const withEvent = createMarket(seed);
  const without = createMarket(seed);
  for (let i = 0; i <= WINDOW; i++) {
    withEvent.step();
    without.step();
  }
  withEvent.trigger(kind);
  const effects: Record<FundId, number>[] = [];
  for (let day = 1; day <= Math.max(...days); day++) {
    const a = withEvent.step();
    const b = without.step();
    if (!days.includes(day)) continue;
    effects.push(
      Object.fromEntries(
        FUNDS.map((fund) => [fund.id, Math.log(a.prices[fund.id] / b.prices[fund.id])]),
      ) as Record<FundId, number>,
    );
  }
  return effects;
}

function summarize(values: Record<FundId, number[]>) {
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
  return Object.fromEntries(
    Object.entries(values).map(([id, list]) => [
      id,
      `min ${pct(Math.min(...list))} · median ${pct(median(list))} · max ${pct(Math.max(...list))}`,
    ]),
  );
}

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
      for (const tick of during) expect(tick.events).toEqual([event]);
      for (const tick of during) expect(Object.isFrozen(tick.events)).toBe(true);
      const after = Array.from({ length: 20 }, () => market.step());
      for (const tick of after) expect("events" in tick).toBe(false);
      expect("events" in before).toBe(false);

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
    expect(ticks.filter((tick) => tick.events).length).toBe(7);
  });

  it("send-moon inflates every fund by risk for 7 days", () => {
    const gains = { [RISKY]: [], [MODERATE]: [], [CONSERVATIVE]: [] } as Record<FundId, number[]>;
    const kepts = { [RISKY]: [], [MODERATE]: [], [CONSERVATIVE]: [] } as Record<FundId, number[]>;
    for (const seed of MANY_SEEDS) {
      const { before, during, after } = runEvent(seed, "send-moon", 7, 60);
      expect(during.every((tick) => tick.events?.[0]?.kind === "send-moon")).toBe(true);
      expect(during[0]!.events![0]!.fundId).toBeUndefined();
      expect(after.every((tick) => !tick.events)).toBe(true);
      for (const id of [RISKY, MODERATE, CONSERVATIVE]) {
        gains[id].push(during.at(-1)!.prices[id] / before.prices[id] - 1);
      }
      // Against the same market without the event: a partial correction, not a
      // full reversal, three weeks after the end.
      const effect = eventEffect(seed, "send-moon", [7, 28]);
      for (const id of [RISKY, MODERATE, CONSERVATIVE]) {
        const [peak, later] = effect.map((day) => day[id]);
        kepts[id].push(later! / peak!);
      }
      // Andes' own swings (and their GARCH echo) blur its counterfactual, so it is
      // only checked on the median below.
      const [peak, later] = effect.map((day) => day[CONSERVATIVE]!);
      expect(later!).toBeGreaterThan(0.3 * peak!);
      expect(later!).toBeLessThan(0.95 * peak!);
    }
    for (const id of [RISKY, MODERATE, CONSERVATIVE]) {
      expect(median(kepts[id])).toBeGreaterThan(0.45);
      expect(median(kepts[id])).toBeLessThan(0.85);
    }
    const [risky, moderate, conservative] = [gains[RISKY], gains[MODERATE], gains[CONSERVATIVE]];
    // Andes' own jumps can wipe out or double a single week; the median is the
    // event's signature.
    expect(Math.min(...risky)).toBeGreaterThan(-0.05);
    expect(Math.max(...risky)).toBeLessThan(0.6);
    expect(median(risky)).toBeGreaterThan(0.22);
    expect(median(risky)).toBeLessThan(0.38);
    expect(Math.min(...moderate)).toBeGreaterThan(0.03);
    expect(Math.max(...moderate)).toBeLessThan(0.13);
    expect(Math.min(...conservative)).toBeGreaterThan(0.005);
    expect(Math.max(...conservative)).toBeLessThan(0.03);
    console.log("send-moon 7-day return", summarize(gains));
    console.log("send-moon share kept 3 weeks later", summarize(kepts));
  });

  it("send-retiro sinks the conservative fund for 14 days, barely touching Andes", () => {
    const moves = { [RISKY]: [], [MODERATE]: [], [CONSERVATIVE]: [] } as Record<FundId, number[]>;
    const recovery: number[] = [];
    const volRatios: number[] = [];
    for (const seed of MANY_SEEDS) {
      const { before, during, after } = runEvent(seed, "send-retiro", 14, 60);
      expect(during.length).toBe(14);
      expect(during.every((tick) => tick.events?.[0]?.fundId === CONSERVATIVE)).toBe(true);
      expect(after.every((tick) => !tick.events)).toBe(true);
      for (const id of [RISKY, MODERATE, CONSERVATIVE]) {
        moves[id].push(during.at(-1)!.prices[id] / before.prices[id] - 1);
      }
      // Against the same market without the event: a slow, partial recovery,
      // still well below one and two months after the end.
      const [loss, month, twoMonths] = eventEffect(seed, "send-retiro", [14, 44, 74]).map(
        (day) => day[CONSERVATIVE],
      );
      expect(month! / loss!).toBeGreaterThan(0.45);
      expect(month! / loss!).toBeLessThan(0.75);
      expect(twoMonths! / loss!).toBeGreaterThan(0.3);
      recovery.push(1 - twoMonths! / loss!);
      // Elevated volatility for the conservative fund during the event.
      const eventVol = std(logReturns(series([before, ...during], CONSERVATIVE)));
      const calmVol = std(logReturns(series(after.slice(-20), CONSERVATIVE)));
      volRatios.push(eventVol / calmVol);
    }
    expect(median(volRatios)).toBeGreaterThan(2);
    const [risky, moderate, conservative] = [moves[RISKY], moves[MODERATE], moves[CONSERVATIVE]];
    expect(Math.min(...conservative)).toBeGreaterThan(-0.095);
    expect(Math.max(...conservative)).toBeLessThan(-0.04);
    expect(median(conservative)).toBeLessThan(-0.055);
    expect(median(conservative)).toBeGreaterThan(-0.075);
    expect(Math.min(...moderate)).toBeGreaterThan(-0.065);
    expect(Math.max(...moderate)).toBeLessThan(0.01);
    expect(median(moderate)).toBeLessThan(-0.01);
    expect(median(moderate)).toBeGreaterThan(-0.03);
    // Andes keeps its usual dynamics: no systematic move.
    expect(Math.abs(median(risky))).toBeLessThan(0.05);
    console.log("send-retiro 14-day return", summarize(moves));
    console.log("send-retiro share of the loss recovered 2 months later", {
      [CONSERVATIVE]: summarize({ [CONSERVATIVE]: recovery } as Record<FundId, number[]>)[
        CONSERVATIVE
      ],
      "daily vol during / after (median)": median(volRatios).toFixed(1),
    });
  });

  it("lists overlapping kinds together, each with its own period", () => {
    const market = createMarket(11);
    for (let i = 0; i < WINDOW; i++) market.step();
    const moon = market.trigger("send-moon");
    market.step();
    market.step();
    const retiro = market.trigger("send-retiro");
    const spy = market.trigger("send-spy");
    const ticks = Array.from({ length: 20 }, () => market.step());
    // The moon started two days earlier; the spy and the retiro start now, and
    // everything is listed in kind order.
    for (const tick of ticks.slice(0, 5)) expect(tick.events).toEqual([spy, moon, retiro]);
    expect(ticks[5]!.events).toEqual([spy, retiro]);
    expect(ticks[6]!.events).toEqual([spy, retiro]);
    for (const tick of ticks.slice(7, 14)) expect(tick.events).toEqual([retiro]);
    for (const tick of ticks.slice(14)) expect("events" in tick).toBe(false);
    expect(moon.fundId).toBeUndefined();
    expect(retiro.fundId).toBe(CONSERVATIVE);
    // The same array is reused while the active set does not change.
    expect(ticks[2]!.events).toBe(ticks[1]!.events);
    expect(Object.isFrozen(ticks[0]!.events)).toBe(true);
    for (const tick of ticks) {
      for (const event of tick.events ?? []) {
        expect(tick.t).toBeGreaterThanOrEqual(event.startedAt);
        expect(tick.t).toBeLessThan(event.endsAt);
      }
    }
  });

  it("re-triggering any kind extends it without stacking its move", () => {
    for (const kind of MARKET_EVENT_KINDS) {
      const days = kind === "send-retiro" ? 14 : 7;
      const singles: number[] = [];
      const spammed: number[] = [];
      for (const seed of SEEDS) {
        const single = runEvent(seed, kind, days, 0);
        const fund = single.during[0]!.events![0]!.fundId ?? RISKY;
        singles.push(Math.log(single.during.at(-1)!.prices[fund] / single.before.prices[fund]));

        const market = createMarket(seed);
        for (let i = 0; i < WINDOW; i++) market.step();
        const before = market.step();
        const first = market.trigger(kind);
        let last = before;
        for (let i = 0; i < 4; i++) {
          last = market.step();
          market.trigger(kind);
          market.trigger(kind);
        }
        const ticks: PriceTick[] = [];
        for (let tick = market.step(); tick.events; tick = market.step()) ticks.push(tick);
        last = ticks.at(-1)!;
        expect(ticks.every((tick) => tick.events!.length === 1)).toBe(true);
        expect(ticks[0]!.events![0]!.startedAt).toBe(first.startedAt);
        expect(ticks.length).toBe(days);
        spammed.push(Math.log(last.prices[fund] / before.prices[fund]));
      }
      // One event's worth of move, not five.
      expect(Math.abs(median(spammed))).toBeLessThan(1.75 * Math.abs(median(singles)));
    }
  });

  it("stays positive and bounded with random events over 20 simulated years", () => {
    for (const seed of SEEDS) {
      const market = createMarket(seed);
      const rng = mulberry(seed ^ 0x5eed);
      const ticks: PriceTick[] = [];
      for (let day = 0; day < 20 * 365; day++) {
        // Bursts of easter eggs: sometimes spammed, sometimes overlapping.
        if (rng() < 0.03) {
          const kind = MARKET_EVENT_KINDS[Math.floor(rng() * MARKET_EVENT_KINDS.length)]!;
          const repeats = 1 + Math.floor(rng() * 5);
          for (let i = 0; i < repeats; i++) market.trigger(kind);
        }
        ticks.push(market.step());
      }
      for (const fund of FUNDS) {
        const prices = series(ticks, fund.id);
        expect(Math.min(...prices)).toBeGreaterThan(0.05 * fund.initialPrice);
        expect(Math.max(...prices)).toBeLessThan(40 * fund.initialPrice);
        expect(prices.every(Number.isFinite)).toBe(true);
      }
      // The conservative fund never collapses even under repeated withdrawals.
      const conservative = series(ticks, CONSERVATIVE);
      expect(Math.min(...conservative)).toBeGreaterThan(0.5 * FUNDS[2]!.initialPrice);
    }
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
