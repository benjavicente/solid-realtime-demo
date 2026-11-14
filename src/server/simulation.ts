import {
  DAY_MS,
  FUNDS,
  HISTORY_WINDOW_MS,
  REAL_MS_PER_TICK,
  SIM_MS_PER_TICK,
  YEAR_MS,
  type FundId,
} from "~/market/funds";
import type { MarketEvent, MarketEventKind, PriceTick } from "~/market/types";

const CAPACITY = HISTORY_WINDOW_MS / SIM_MS_PER_TICK;
const DT = SIM_MS_PER_TICK / YEAR_MS;

/** A fixed epoch and seed make the demo's initial simulated window reproducible. */
export const DEFAULT_SEED = 0x4d41524b;
export const DEFAULT_START = Date.UTC(2020, 0, 1);

/**
 * How each fund moves, on top of the drift, volatility and jumps in `FUNDS`.
 *
 * Daily log-return = fair-value slope − reversion toward the fair value
 *                  + σₜ·(market shock mixed with an idiosyncratic shock) + jumps.
 *
 * - `marketWeight`: loading on the shared market shock, so funds co-move.
 * - `garchAlpha`/`garchBeta`: GARCH(1,1) on the daily variance (0/0 = constant
 *   volatility). Large moves, including jumps, raise the next days' volatility.
 * - `tailDof`: degrees of freedom of the Student-t idiosyncratic shock (0 = normal).
 * - `reversionPerYear`: pull of the log-price toward the fair value. Strong for the
 *   conservative fund so it hugs a gently rising line; weak for the others, only
 *   enough to keep them from wandering off over a long-running process.
 * - `maxLogGrowth`: the fair value starts growing at `annualDrift` and levels off
 *   at `initialPrice · e^maxLogGrowth`, so hours of uptime never explode prices.
 */
interface FundDynamics {
  readonly marketWeight: number;
  readonly garchAlpha: number;
  readonly garchBeta: number;
  readonly tailDof: number;
  readonly reversionPerYear: number;
  readonly maxLogGrowth: number;
}

const DYNAMICS: Readonly<Record<FundId, FundDynamics>> = {
  "andes-arriesgado": {
    marketWeight: 0.7,
    garchAlpha: 0.1,
    garchBeta: 0.86,
    tailDof: 4,
    reversionPerYear: 0.5,
    maxLogGrowth: Math.log(5),
  },
  "manquehue-moderado": {
    marketWeight: 0.6,
    garchAlpha: 0.05,
    garchBeta: 0.9,
    tailDof: 0,
    reversionPerYear: 1,
    maxLogGrowth: Math.log(5),
  },
  "cristobal-conservador": {
    marketWeight: 0.2,
    garchAlpha: 0,
    garchBeta: 0,
    tailDof: 0,
    reversionPerYear: 25,
    maxLogGrowth: Math.log(4),
  },
};

/** GARCH variance stays within these multiples of the fund's long-run volatility. */
const MIN_VOL_RATIO = 0.5;
const MAX_VOL_RATIO = 3;

/** "send-spy": a leak hits Andes Arriesgado for a week, then it partially recovers. */
const SPY = {
  fundId: "andes-arriesgado" as FundId,
  days: 7,
  /** Price lost over the event, drawn uniformly; noise moves the result a little. */
  minLoss: 0.15,
  maxLoss: 0.28,
  /** Daily volatility during the event, as a multiple of the current GARCH volatility. */
  volatilityBoost: 1.5,
  /** Never push the fund below this fraction of its fair value. */
  floorRatio: 0.3,
  /** Share of the loss recovered over the following days. */
  reboundShare: 0.35,
  reboundDays: 12,
};

function createRandom(seed: number) {
  let state = seed | 0;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
  /** Student-t with `dof` degrees of freedom, scaled to unit variance (dof > 2). */
  const studentT = (dof: number) => {
    let chi2 = 0;
    for (let i = 0; i < dof; i++) chi2 += normal() ** 2;
    return (normal() / Math.sqrt(chi2 / dof)) * Math.sqrt((dof - 2) / dof);
  };
  const poisson = (rate: number) => {
    const limit = Math.exp(-rate);
    let product = 1;
    let count = 0;
    do {
      product *= random();
      count++;
    } while (product > limit);
    return count - 1;
  };
  return { random, normal, studentT, poisson };
}

/**
 * The market model without timers or history, so tests can run it for simulated
 * years. Each `step()` advances one simulated day and returns its frozen tick.
 */
export function createMarket(seed = DEFAULT_SEED, start = DEFAULT_START) {
  const { random, normal, studentT, poisson } = createRandom(seed);
  const funds = FUNDS.map((profile) => {
    const dynamics = DYNAMICS[profile.id];
    const longRunVariance = profile.annualVolatility ** 2 * DT;
    return {
      profile,
      dynamics,
      longRunVariance,
      omega: longRunVariance * (1 - dynamics.garchAlpha - dynamics.garchBeta),
      logPrice: Math.log(profile.initialPrice),
      variance: longRunVariance,
    };
  });
  let time = start;
  let event: MarketEvent | undefined;
  /** Log-return accumulated by the spied fund during the event, and its target. */
  let spy = { cumulative: 0, target: 0 };
  let rebound = { dailyDrift: 0, days: 0 };

  function fairValue(fund: (typeof funds)[number], years: number) {
    const { annualDrift, initialPrice } = fund.profile;
    const cap = fund.dynamics.maxLogGrowth;
    const decay = Math.exp((-annualDrift * years) / cap);
    return { log: Math.log(initialPrice) + cap * (1 - decay), slope: annualDrift * decay };
  }

  function step(): PriceTick {
    time += SIM_MS_PER_TICK;
    if (event && time >= event.endsAt) {
      const dailyDrift = (-SPY.reboundShare * spy.cumulative) / SPY.reboundDays;
      rebound = { dailyDrift, days: SPY.reboundDays };
      event = undefined;
    }
    const active = event && time >= event.startedAt ? event : undefined;
    const years = (time - start) / YEAR_MS;
    const market = normal();

    for (const fund of funds) {
      const { profile, dynamics } = fund;
      const idiosyncratic = dynamics.tailDof > 0 ? studentT(dynamics.tailDof) : normal();
      const weight = dynamics.marketWeight;
      const shock = weight * market + Math.sqrt(1 - weight ** 2) * idiosyncratic;
      const sigma = Math.sqrt(fund.variance);
      let innovation: number;
      let logReturn: number;

      if (active && active.fundId === profile.id) {
        // A bridge toward the drawn loss: each day closes the remaining gap evenly,
        // while boosted noise keeps the path jagged and the final loss uncertain.
        const daysLeft = Math.round((active.endsAt - time) / SIM_MS_PER_TICK);
        innovation = SPY.volatilityBoost * sigma * shock;
        logReturn = (spy.target - spy.cumulative) / daysLeft + innovation;
        spy.cumulative += logReturn;
      } else {
        const fair = fairValue(fund, years);
        const deviation = fund.logPrice - fair.log;
        // The cubic term only matters far from fair value: it bounds the long run.
        const reversion = dynamics.reversionPerYear * deviation * (1 + 3 * deviation ** 2);
        let jump = 0;
        const jumps = profile.jumpsPerYear > 0 ? poisson(profile.jumpsPerYear * DT) : 0;
        for (let i = 0; i < jumps; i++) jump += profile.jumpMean + profile.jumpStd * normal();
        // Compensate the jumps' mean so the expected log-return stays `annualDrift`.
        const drift = fair.slope - profile.jumpsPerYear * profile.jumpMean - reversion;
        innovation = sigma * shock + jump;
        logReturn = drift * DT + innovation;
        if (rebound.days > 0 && profile.id === SPY.fundId) {
          logReturn += rebound.dailyDrift;
          rebound.days--;
        }
      }

      fund.logPrice += logReturn;
      if (dynamics.garchAlpha > 0 || dynamics.garchBeta > 0) {
        const next =
          fund.omega + dynamics.garchAlpha * innovation ** 2 + dynamics.garchBeta * fund.variance;
        fund.variance = Math.min(
          MAX_VOL_RATIO ** 2 * fund.longRunVariance,
          Math.max(MIN_VOL_RATIO ** 2 * fund.longRunVariance, next),
        );
      }
    }

    const prices = Object.fromEntries(
      funds.map((fund) => [
        fund.profile.id,
        Math.max(0.01, Math.round(Math.exp(fund.logPrice) * 100) / 100),
      ]),
    ) as Record<FundId, number>;
    return Object.freeze(
      active
        ? { t: time, prices: Object.freeze(prices), event: active }
        : { t: time, prices: Object.freeze(prices) },
    );
  }

  function trigger(kind: MarketEventKind): MarketEvent {
    switch (kind) {
      case "send-spy": {
        const nextTick = time + SIM_MS_PER_TICK;
        // Re-sending a spy extends the current event instead of stacking another.
        const startedAt = event ? event.startedAt : nextTick;
        event = Object.freeze({
          kind,
          fundId: SPY.fundId,
          startedAt,
          endsAt: nextTick + SPY.days * DAY_MS,
        });
        const fund = funds.find((candidate) => candidate.profile.id === SPY.fundId)!;
        const loss = SPY.minLoss + (SPY.maxLoss - SPY.minLoss) * random();
        const deviation = fund.logPrice - fairValue(fund, (time - start) / YEAR_MS).log;
        const floor = Math.log(SPY.floorRatio) - deviation;
        spy = { cumulative: 0, target: Math.min(-0.03, Math.max(Math.log(1 - loss), floor)) };
        rebound = { dailyDrift: 0, days: 0 };
        return event;
      }
    }
  }

  return { step, trigger, now: () => time };
}

function startSimulation() {
  const market = createMarket();
  const history = new Array<PriceTick>(CAPACITY);
  let cursor = 0;
  const watchers = new Set<() => void>();

  function tick() {
    history[cursor] = market.step();
    cursor = (cursor + 1) % CAPACITY;
    for (const notify of watchers) notify();
  }

  for (let i = 0; i < CAPACITY; i++) tick();
  const timer = setInterval(tick, REAL_MS_PER_TICK);
  timer.unref();
  return {
    latest: () => history[(cursor + CAPACITY - 1) % CAPACITY]!,
    history: () => [...history.slice(cursor), ...history.slice(0, cursor)],
    trigger: market.trigger,
    watchers,
  };
}

const KEY = Symbol.for("solid-realtime-demo.market-simulation.v4");
const globals = globalThis as typeof globalThis & { [KEY]?: ReturnType<typeof startSimulation> };
const simulation = (globals[KEY] ??= startSimulation());

export function latestTick(): PriceTick {
  return simulation.latest();
}

export function priceHistory(): readonly PriceTick[] {
  return simulation.history();
}

/**
 * Starts a shared market event from the next tick on; every viewer sees it. Ticks
 * with `startedAt <= t < endsAt` carry the event. Triggering again while one is
 * active (or pending) extends it to a full period from the next tick.
 */
export function triggerMarketEvent(kind: MarketEventKind): MarketEvent {
  return simulation.trigger(kind);
}

/** Every viewer sees the demo's current tick; slow viewers skip intermediate ticks. */
export async function* watchPrices(signal?: AbortSignal): AsyncGenerator<PriceTick> {
  if (signal?.aborted) return;
  let wake: (() => void) | undefined;
  let dirty = false;
  const notify = () => {
    dirty = true;
    wake?.();
  };
  const stop = () => {
    simulation.watchers.delete(notify);
    signal?.removeEventListener("abort", stop);
    wake?.();
  };
  simulation.watchers.add(notify);
  signal?.addEventListener("abort", stop, { once: true });
  try {
    yield latestTick();
    while (!signal?.aborted) {
      if (!dirty) await new Promise<void>((resolve) => (wake = resolve));
      wake = undefined;
      if (signal?.aborted) return;
      dirty = false;
      yield latestTick();
    }
  } finally {
    stop();
  }
}
