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

/** Lag-1 autocorrelation of a series. */
function autocorrelation(values: readonly number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < values.length; i++) {
    denominator += (values[i]! - mean) ** 2;
    if (i > 0) numerator += (values[i]! - mean) * (values[i - 1]! - mean);
  }
  return numerator / denominator;
}

/** Lag-1 autocorrelation of absolute returns: positive when volatility clusters. */
function absReturnAutocorrelation(prices: readonly number[]) {
  return autocorrelation(logReturns(prices).map(Math.abs));
}

/** Log-returns over consecutive, non-overlapping blocks of `days`. */
function blockReturns(dailyReturns: readonly number[], days: number) {
  const blocks: number[] = [];
  for (let i = 0; i + days <= dailyReturns.length; i += days) {
    blocks.push(dailyReturns.slice(i, i + days).reduce((sum, value) => sum + value, 0));
  }
  return blocks;
}

/** The same daily returns in a seeded random order: an i.i.d. baseline. */
function shuffled(values: readonly number[], seed: number) {
  const rng = mulberry(seed);
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function variance(values: readonly number[]) {
  return std(values) ** 2;
}

/**
 * How much prices move in runs, from daily log-returns:
 * - `autocorrelation`: of consecutive 10-day returns, positive when a rise tends
 *   to follow a rise;
 * - `varianceRatio`: variance of 60-day returns over 60 × the daily variance,
 *   above 1 when moves persist instead of cancelling out.
 * `iid` is the same for the returns shuffled, which keeps their distribution but
 * removes any trend.
 */
function trendStats(prices: readonly number[], seed: number) {
  const measure = (returns: readonly number[]) => ({
    autocorrelation: autocorrelation(blockReturns(returns, 10)),
    varianceRatio: variance(blockReturns(returns, 60)) / (60 * variance(returns)),
  });
  const returns = logReturns(prices);
  return { trend: measure(returns), iid: measure(shuffled(returns, seed)) };
}

function mean(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

const EVENT_DAYS: Record<MarketEventKind, number> = {
  "send-spy": 7,
  "send-intel": 2,
  "send-coreweave": 2,
  "send-afp": 14,
};

function emptyByFund(): Record<FundId, number[]> {
  return { [RISKY]: [], [MODERATE]: [], [CONSERVATIVE]: [] } as unknown as Record<FundId, number[]>;
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
      expect(conservative).toBeGreaterThan(0.015);
      expect(conservative).toBeLessThan(0.035);
      expect(moderate).toBeGreaterThan(3 * conservative);
      expect(moderate).toBeGreaterThan(0.12);
      expect(moderate).toBeLessThan(0.22);
      expect(risky).toBeGreaterThan(3 * moderate);
      expect(risky).toBeGreaterThan(0.55);
      expect(risky).toBeLessThan(0.95);
    }
  });

  it("moves in trends: returns persist over weeks, unlike i.i.d. noise", () => {
    const stats = { risky: [], riskyIid: [], moderate: [], moderateIid: [] } as Record<
      string,
      ReturnType<typeof trendStats>["trend"][]
    >;
    for (const seed of SEEDS) {
      const ticks = run(seed, 20 * 365);
      const risky = trendStats(series(ticks, RISKY), seed);
      const moderate = trendStats(series(ticks, MODERATE), seed);
      stats.risky!.push(risky.trend);
      stats.riskyIid!.push(risky.iid);
      stats.moderate!.push(moderate.trend);
      stats.moderateIid!.push(moderate.iid);
      expect(risky.trend.varianceRatio).toBeGreaterThan(1.05);
    }
    const avg = (
      list: ReturnType<typeof trendStats>["trend"][],
      key: "autocorrelation" | "varianceRatio",
    ) => mean(list.map((value) => value[key]));
    // Shuffled returns: ~0 autocorrelation (±0.04 per seed with 730 blocks) and a
    // variance ratio of ~1.
    for (const iid of [stats.riskyIid!, stats.moderateIid!]) {
      expect(Math.abs(avg(iid, "autocorrelation"))).toBeLessThan(0.04);
      expect(Math.abs(avg(iid, "varianceRatio") - 1)).toBeLessThan(0.12);
    }
    for (const [trend, iid] of [
      [stats.risky!, stats.riskyIid!],
      [stats.moderate!, stats.moderateIid!],
    ] as const) {
      expect(avg(trend, "autocorrelation")).toBeGreaterThan(0.06);
      expect(avg(trend, "autocorrelation")).toBeGreaterThan(avg(iid, "autocorrelation") + 0.04);
      expect(avg(trend, "varianceRatio")).toBeGreaterThan(1.25);
      expect(avg(trend, "varianceRatio")).toBeGreaterThan(avg(iid, "varianceRatio") + 0.2);
    }
  });

  it("keeps the conservative fund's 90-day drawdown small and its trend upward", () => {
    let windows = 0;
    let rising = 0;
    for (const seed of SEEDS) {
      const ticks = run(seed, 20 * WINDOW);
      for (let start = 0; start < ticks.length; start += WINDOW) {
        const prices = series(ticks.slice(start, start + WINDOW), CONSERVATIVE);
        expect(maxDrawdown(prices)).toBeLessThan(0.02);
        windows++;
        if (prices.at(-1)! > prices[0]!) rising++;
      }
      const prices = series(ticks, CONSERVATIVE);
      expect(prices.at(-1)!).toBeGreaterThan(prices[0]!);
    }
    expect(rising / windows).toBeGreaterThan(0.85);
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

  it("send-spy weighs on Andes for a week, then it wins back part of it", () => {
    const week: number[] = [];
    const moderate: number[] = [];
    const kept: number[] = [];
    for (const seed of MANY_SEEDS) {
      // Log effect against the same market without the event.
      const [drop, later] = eventEffect(seed, "send-spy", [7, 28]);
      expect(drop![CONSERVATIVE]).toBe(0);
      moderate.push(drop![MODERATE]);
      week.push(drop![RISKY]);
      kept.push(later![RISKY] / drop![RISKY]);
    }
    expect(median(moderate)).toBeLessThan(0);
    expect(median(week)).toBeLessThan(-0.09);
    expect(median(week)).toBeGreaterThan(-0.19);
    expect(median(kept)).toBeGreaterThan(0.55);
    expect(median(kept)).toBeLessThan(0.85);
  });

  it("send-intel crashes Andes over 2 days, then it wins back ~45% in 3 weeks", () => {
    const moves = emptyByFund();
    const recovered: number[] = [];
    for (const seed of MANY_SEEDS) {
      const market = createMarket(seed);
      for (let i = 0; i < WINDOW; i++) market.step();
      const before = market.step();
      const event = market.trigger("send-intel");
      expect(event).toMatchObject({ kind: "send-intel", fundId: RISKY });
      expect(event.startedAt).toBe(before.t + DAY_MS);
      expect(event.endsAt - event.startedAt).toBe(2 * DAY_MS);
      expect(Object.isFrozen(event)).toBe(true);
      const during = [market.step(), market.step()];
      for (const tick of during) expect(tick.events).toEqual([event]);
      for (const tick of during) expect(Object.isFrozen(tick.events)).toBe(true);
      const after = Array.from({ length: 30 }, () => market.step());
      for (const tick of after) expect("events" in tick).toBe(false);
      expect("events" in before).toBe(false);
      for (const id of [RISKY, MODERATE, CONSERVATIVE]) {
        moves[id].push(during.at(-1)!.prices[id] / before.prices[id] - 1);
      }
      // Against the same market without the event.
      const [crash, weeks] = eventEffect(seed, "send-intel", [2, 23]);
      expect(crash![CONSERVATIVE]).toBe(0);
      recovered.push(1 - weeks![RISKY] / crash![RISKY]);
    }
    const [risky, moderate, conservative] = [moves[RISKY], moves[MODERATE], moves[CONSERVATIVE]];
    // Andes' own swings blur single seeds; most land in the headline's range.
    expect(Math.max(...risky)).toBeLessThan(-0.03);
    expect(Math.min(...risky)).toBeGreaterThan(-0.4);
    expect(risky.filter((move) => move < -0.08 && move > -0.3).length).toBeGreaterThan(
      0.8 * risky.length,
    );
    expect(median(risky)).toBeLessThan(-0.13);
    expect(median(risky)).toBeGreaterThan(-0.21);
    expect(median(moderate)).toBeLessThan(-0.005);
    expect(median(moderate)).toBeGreaterThan(-0.04);
    expect(Math.abs(median(conservative))).toBeLessThan(0.003);
    expect(median(recovered)).toBeGreaterThan(0.35);
    expect(median(recovered)).toBeLessThan(0.55);
    console.log("send-intel 2-day return", summarize(moves));
    console.log("send-intel share of Andes' loss won back 3 weeks later", {
      [RISKY]: summarize({ [RISKY]: recovered } as Record<FundId, number[]>)[RISKY],
    });
  });

  it("send-coreweave lifts Andes 15–25% over 2 days, with momentum and a small give-back", () => {
    const moves = emptyByFund();
    const momentum: number[] = [];
    const kept: number[] = [];
    for (const seed of MANY_SEEDS) {
      const { before, during, after } = runEvent(seed, "send-coreweave", 2, 60);
      expect(during.every((tick) => tick.events?.[0]?.kind === "send-coreweave")).toBe(true);
      expect(during[0]!.events![0]!.fundId).toBeUndefined();
      expect(after.every((tick) => !tick.events)).toBe(true);
      for (const id of [RISKY, MODERATE, CONSERVATIVE]) {
        moves[id].push(during.at(-1)!.prices[id] / before.prices[id] - 1);
      }
      const [jump, peak, later] = eventEffect(seed, "send-coreweave", [2, 7, 37]);
      expect(jump![CONSERVATIVE]).toBe(0);
      momentum.push(peak![RISKY] / jump![RISKY]);
      kept.push(later![RISKY] / peak![RISKY]);
    }
    const [risky, moderate, conservative] = [moves[RISKY], moves[MODERATE], moves[CONSERVATIVE]];
    // Andes' own swings blur single seeds; most land in the headline's range.
    expect(Math.min(...risky)).toBeGreaterThan(-0.15);
    expect(Math.max(...risky)).toBeLessThan(0.45);
    expect(risky.filter((move) => move > 0.08 && move < 0.35).length).toBeGreaterThan(
      0.8 * risky.length,
    );
    expect(median(risky)).toBeGreaterThan(0.15);
    expect(median(risky)).toBeLessThan(0.25);
    expect(median(moderate)).toBeGreaterThan(0.015);
    expect(median(moderate)).toBeLessThan(0.045);
    expect(Math.abs(median(conservative))).toBeLessThan(0.003);
    // The euphoria runs on for a few days, then only a small part is given back.
    expect(median(momentum)).toBeGreaterThan(1.03);
    expect(median(kept)).toBeGreaterThan(0.7);
    expect(median(kept)).toBeLessThan(0.95);
    console.log("send-coreweave 2-day return", summarize(moves));
    console.log("send-coreweave on Andes vs the same market without it", {
      "day 7 / day 2": summarize({ [RISKY]: momentum } as Record<FundId, number[]>)[RISKY],
      "day 37 / day 7": summarize({ [RISKY]: kept } as Record<FundId, number[]>)[RISKY],
    });
  });

  it("send-afp sinks the conservative fund for 14 days, barely touching Andes", () => {
    const moves = emptyByFund();
    const recovery: number[] = [];
    const volRatios: number[] = [];
    for (const seed of MANY_SEEDS) {
      const { before, during, after } = runEvent(seed, "send-afp", 14, 60);
      expect(during.length).toBe(14);
      expect(during.every((tick) => tick.events?.[0]?.fundId === CONSERVATIVE)).toBe(true);
      expect(after.every((tick) => !tick.events)).toBe(true);
      for (const id of [RISKY, MODERATE, CONSERVATIVE]) {
        moves[id].push(during.at(-1)!.prices[id] / before.prices[id] - 1);
      }
      // Against the same market without the event: a slow, partial recovery,
      // still well below one and two months after the end.
      const [loss, month, twoMonths] = eventEffect(seed, "send-afp", [14, 44, 74]).map(
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
    expect(Math.min(...moderate)).toBeGreaterThan(-0.07);
    expect(Math.max(...moderate)).toBeLessThan(0.02);
    expect(median(moderate)).toBeLessThan(-0.01);
    expect(median(moderate)).toBeGreaterThan(-0.035);
    // Andes keeps its usual dynamics: no systematic move.
    expect(Math.abs(median(risky))).toBeLessThan(0.05);
    console.log("send-afp 14-day return", summarize(moves));
    console.log("send-afp share of the loss recovered 2 months later", {
      [CONSERVATIVE]: summarize({ [CONSERVATIVE]: recovery } as Record<FundId, number[]>)[
        CONSERVATIVE
      ],
      "daily vol during / after (median)": median(volRatios).toFixed(1),
    });
  });

  it("extends a running event instead of stacking it", () => {
    const market = createMarket(5);
    for (let i = 0; i < WINDOW; i++) market.step();
    const first = market.trigger("send-intel");
    market.step();
    market.step();
    const second = market.trigger("send-intel");
    market.trigger("send-intel");
    const third = market.trigger("send-intel");
    expect(third.startedAt).toBe(first.startedAt);
    expect(third.endsAt).toBe(second.endsAt);
    expect(third.endsAt).toBe(market.now() + 3 * DAY_MS);
    const ticks = Array.from({ length: 10 }, () => market.step());
    expect(ticks.filter((tick) => tick.events).length).toBe(2);
  });

  it("lists overlapping kinds together, each with its own period", () => {
    const market = createMarket(11);
    for (let i = 0; i < WINDOW; i++) market.step();
    const afp = market.trigger("send-afp");
    const ticks = [market.step()];
    const intel = market.trigger("send-intel");
    ticks.push(market.step());
    const coreweave = market.trigger("send-coreweave");
    ticks.push(...Array.from({ length: 18 }, () => market.step()));
    // The AFP drop started two days earlier, Intel one; everything is
    // listed in kind order.
    expect(ticks[0]!.events).toEqual([afp]);
    expect(ticks[1]!.events).toEqual([intel, afp]);
    expect(ticks[2]!.events).toEqual([intel, coreweave, afp]);
    expect(ticks[3]!.events).toEqual([coreweave, afp]);
    for (const tick of ticks.slice(4, 14)) expect(tick.events).toEqual([afp]);
    for (const tick of ticks.slice(14)) expect("events" in tick).toBe(false);
    expect(coreweave.fundId).toBeUndefined();
    expect(intel.fundId).toBe(RISKY);
    expect(afp.fundId).toBe(CONSERVATIVE);
    // The same array is reused while the active set does not change.
    expect(ticks[5]!.events).toBe(ticks[4]!.events);
    expect(Object.isFrozen(ticks[2]!.events)).toBe(true);
    for (const tick of ticks) {
      for (const event of tick.events ?? []) {
        expect(tick.t).toBeGreaterThanOrEqual(event.startedAt);
        expect(tick.t).toBeLessThan(event.endsAt);
      }
    }
  });

  it("re-triggering any kind extends it without stacking its move", () => {
    for (const kind of MARKET_EVENT_KINDS) {
      const days = EVENT_DAYS[kind];
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
        for (let i = 0; i < 4; i++) {
          market.step();
          market.trigger(kind);
          market.trigger(kind);
        }
        const ticks: PriceTick[] = [];
        for (let tick = market.step(); tick.events; tick = market.step()) ticks.push(tick);
        expect(ticks.every((tick) => tick.events!.length === 1)).toBe(true);
        expect(ticks[0]!.events![0]!.startedAt).toBe(first.startedAt);
        expect(ticks.length).toBe(days);
        spammed.push(Math.log(ticks.at(-1)!.prices[fund] / before.prices[fund]));
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
      // The conservative fund never collapses even under repeated AFP drops.
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
    const trend = Object.fromEntries(
      FUNDS.map((fund) => {
        const values = SEEDS.map((seed) => trendStats(series(run(seed, 20 * 365), fund.id), seed));
        const fmt = (key: "trend" | "iid", stat: "autocorrelation" | "varianceRatio") =>
          mean(values.map((value) => value[key][stat])).toFixed(2);
        return [
          fund.name,
          `10d autocorr ${fmt("trend", "autocorrelation")} (i.i.d. ${fmt("iid", "autocorrelation")}) · ` +
            `60d variance ratio ${fmt("trend", "varianceRatio")} (i.i.d. ${fmt("iid", "varianceRatio")})`,
        ];
      }),
    );
    const eventMoves = Object.fromEntries(
      MARKET_EVENT_KINDS.map((kind) => {
        const fund = kind === "send-afp" ? CONSERVATIVE : RISKY;
        const moves = SEEDS.map((seed) => {
          const { before, during } = runEvent(seed, kind, EVENT_DAYS[kind], 0);
          return `${((during.at(-1)!.prices[fund] / before.prices[fund] - 1) * 100).toFixed(1)}%`;
        });
        return [`${kind} (${fund}, ${EVENT_DAYS[kind]}d)`, moves.join(", ")];
      }),
    );
    console.log({
      "corr risky/moderate": correlation(returns[RISKY], returns[MODERATE]).toFixed(2),
      "corr risky/conservative": correlation(returns[RISKY], returns[CONSERVATIVE]).toFixed(2),
      "corr moderate/conservative": correlation(returns[MODERATE], returns[CONSERVATIVE]).toFixed(
        2,
      ),
      "abs-return lag-1 autocorrelation (risky)": absReturnAutocorrelation(
        series(ticks, RISKY),
      ).toFixed(2),
    });
    console.log("trend persistence over 20 years, mean of seeds", trend);
    console.log("event move per seed", eventMoves);
  });
});
