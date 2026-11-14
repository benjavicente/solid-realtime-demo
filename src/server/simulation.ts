import {
  DAY_MS,
  FUNDS,
  HISTORY_WINDOW_MS,
  REAL_MS_PER_TICK,
  SIM_MS_PER_TICK,
  YEAR_MS,
  type FundId,
} from "~/market/funds";
import {
  MARKET_EVENT_KINDS,
  type MarketEvent,
  type MarketEventKind,
  type PriceTick,
} from "~/market/types";

const CAPACITY = HISTORY_WINDOW_MS / SIM_MS_PER_TICK;
const DT = SIM_MS_PER_TICK / YEAR_MS;

/** A fixed epoch and seed make the demo's initial simulated window reproducible. */
export const DEFAULT_SEED = 0x4d41524b;
export const DEFAULT_START = Date.UTC(2020, 0, 1);

/**
 * How each fund moves, on top of the drift, volatility and jumps in `FUNDS`.
 *
 * Daily log-return = trend-adjusted fair-value slope − reversion toward it
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
 *
 * Trends: on top of that curve, the fair value drifts by a persistent trend (a
 * yearly log-drift), so prices move in runs of weeks to months instead of only
 * day-to-day noise.
 * - `trendLoading`: drift per unit of the shared market regime (bull +1,
 *   sideways 0, bear −1.3), so every fund feels the same bull and bear phases.
 * - `trendVolatility`/`trendDays`: stationary deviation and e-folding time of the
 *   fund's own trend, an Ornstein–Uhlenbeck process.
 * - `trendReversionPerYear`: pull of the accumulated trend offset back to the
 *   fair-value curve, so trends never wander off for good.
 * - `minSlopeShare`: the trend never takes the fair value's slope below this share
 *   of the curve's slope (the conservative fund only rises faster or slower).
 */
interface FundDynamics {
  readonly marketWeight: number;
  readonly garchAlpha: number;
  readonly garchBeta: number;
  readonly tailDof: number;
  readonly reversionPerYear: number;
  readonly maxLogGrowth: number;
  readonly trendLoading: number;
  readonly trendVolatility: number;
  readonly trendDays: number;
  readonly trendReversionPerYear: number;
  readonly minSlopeShare?: number;
}

const DYNAMICS: Readonly<Record<FundId, FundDynamics>> = {
  "andes-arriesgado": {
    marketWeight: 0.7,
    garchAlpha: 0.1,
    garchBeta: 0.86,
    tailDof: 4,
    reversionPerYear: 0.5,
    maxLogGrowth: Math.log(5),
    trendLoading: 2,
    trendVolatility: 0.9,
    trendDays: 40,
    trendReversionPerYear: 1.2,
  },
  "manquehue-moderado": {
    marketWeight: 0.6,
    garchAlpha: 0.05,
    garchBeta: 0.9,
    tailDof: 0,
    reversionPerYear: 1,
    maxLogGrowth: Math.log(5),
    trendLoading: 0.4,
    trendVolatility: 0.15,
    trendDays: 45,
    trendReversionPerYear: 1,
  },
  "cristobal-conservador": {
    marketWeight: 0.2,
    garchAlpha: 0,
    garchBeta: 0,
    tailDof: 0,
    reversionPerYear: 25,
    maxLogGrowth: Math.log(4),
    trendLoading: 0.02,
    trendVolatility: 0.01,
    trendDays: 60,
    trendReversionPerYear: 0.5,
    minSlopeShare: 0.3,
  },
};

/**
 * Market regimes shared by every fund: a Markov chain that leaves a regime with
 * probability 1/`days` per day (so it lasts `days` on average) for one of the
 * others. The drift follows the regime's level smoothly over a few days.
 */
const REGIMES = [
  { name: "bull", level: 1, days: 60 },
  { name: "sideways", level: 0, days: 35 },
  { name: "bear", level: -1.3, days: 40 },
] as const;
const REGIME_SMOOTHING_DAYS = 8;

/** GARCH variance stays within these multiples of the fund's long-run volatility. */
const MIN_VOL_RATIO = 0.5;
const MAX_VOL_RATIO = 2.2;

/** How strongly an event moves one fund over its duration. */
interface EventEffect {
  /** Simple return over the event, drawn between `min` and `max`. */
  readonly min: number;
  readonly max: number;
  /** Daily volatility during the event, as a multiple of the fund's current volatility. */
  readonly volatilityBoost: number;
}

/** A phase after an event: `share` of the event's move added over `days`. */
interface Aftermath {
  /** Positive continues the move (momentum); negative gives part of it back. */
  readonly share: number;
  readonly days: number;
}

interface EventSpec {
  /** The fund the event targets; undefined for market-wide events. */
  readonly fundId?: FundId;
  readonly days: number;
  readonly effects: Partial<Record<FundId, EventEffect>>;
  /** What follows the event, phase after phase. */
  readonly aftermath: readonly Aftermath[];
}

const EVENTS: Readonly<Record<MarketEventKind, EventSpec>> = {
  /**
   * 27 Jan 2025: DeepSeek's low-cost R1 model sent Nvidia down ~17% in a day
   * (~US$589 billion, the largest one-day loss of market value ever) and the
   * Nasdaq down more than 3%. The tech-heavy Andes crashes over two days; Nvidia
   * won back a good part of it over the following weeks.
   */
  "send-deepseek": {
    fundId: "andes-arriesgado",
    days: 2,
    effects: {
      "andes-arriesgado": { min: -0.2, max: -0.14, volatilityBoost: 1.2 },
      "manquehue-moderado": { min: -0.03, max: -0.01, volatilityBoost: 1.2 },
    },
    aftermath: [{ share: -0.45, days: 21 }],
  },
  /**
   * 25 May 2023: Nvidia guided US$11 billion of revenue (vs ~US$7.2 billion
   * expected) on AI demand and rose ~24% in a day, adding ~US$184 billion and
   * lifting the Nasdaq. The euphoria runs on for a few days, then a small part is
   * given back.
   */
  "send-nvidia": {
    days: 2,
    effects: {
      "andes-arriesgado": { min: 0.15, max: 0.25, volatilityBoost: 1.2 },
      "manquehue-moderado": { min: 0.02, max: 0.04, volatilityBoost: 1.2 },
    },
    aftermath: [
      { share: 0.08, days: 5 },
      { share: -0.2, days: 30 },
    ],
  },
  /**
   * July 2020, Chile: Ley 21.248 allowed the first 10% withdrawal from AFP pension
   * funds. Paying it forced bond sales, which hit the conservative funds (D and E)
   * hardest; Andes is left to its own dynamics.
   */
  "send-afp": {
    fundId: "cristobal-conservador",
    days: 14,
    effects: {
      "cristobal-conservador": { min: -0.08, max: -0.05, volatilityBoost: 4 },
      "manquehue-moderado": { min: -0.03, max: -0.01, volatilityBoost: 1.2 },
    },
    aftermath: [{ share: -0.35, days: 30 }],
  },
};

/** Share of an event's deviation from its planned path corrected each day. */
const BRIDGE_PULL = 0.5;
/** Funds in one event draw correlated intensities; this is the per-fund spread. */
const EFFECT_JITTER = 0.2;
/** An event never pushes a fund outside these multiples of its fair value. */
const EVENT_FLOOR_RATIO = 0.3;
const EVENT_CEILING_RATIO = 3;
/** Hard bounds of a fund's accumulated event offset, whatever is triggered. */
const MIN_EVENT_LOG = Math.log(0.35);
const MAX_EVENT_LOG = Math.log(2.5);
/** Once nothing drives it, the remaining event offset fades with this e-folding time. */
const EVENT_MEMORY_DAYS = 120;

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

/** An active event's push on one fund: it steers `cumulative` toward `target`. */
interface Bridge {
  /** Log-return of the fund attributed to this event since it started. */
  cumulative: number;
  /** The part of `cumulative` the event itself added; partly given back afterwards. */
  offset: number;
  target: number;
  readonly volatilityBoost: number;
}

interface Episode {
  event: MarketEvent;
  readonly bridges: Map<FundId, Bridge>;
}

/**
 * The market model without timers or history, so tests can run it for simulated
 * years. Each `step()` advances one simulated day and returns its frozen tick.
 *
 * A fund's log-price is its base process plus an event offset. Events only move
 * the offset, so the base keeps its usual dynamics (and noise) underneath; the
 * offset fades once no event or aftermath is driving it.
 */
export function createMarket(seed = DEFAULT_SEED, start = DEFAULT_START) {
  const { random, normal, studentT, poisson } = createRandom(seed);
  // Events draw from their own stream, so triggering one leaves the base path as is.
  const eventRandom = createRandom(seed ^ 0x45564e54).random;
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
      eventLog: 0,
      /** The fund's own trend (yearly log-drift) and the offset trends added so far. */
      trend: 0,
      trendLog: 0,
      trendPersistence: Math.exp(-1 / dynamics.trendDays),
      trendSlope: 0,
      aftermaths: new Map<MarketEventKind, { dailyDrift: number; days: number }[]>(),
    };
  });
  let regime = Math.floor(random() * REGIMES.length);
  let marketTrend = REGIMES[regime]!.level;
  const byId = new Map(funds.map((fund) => [fund.profile.id, fund]));
  let time = start;
  const episodes = new Map<MarketEventKind, Episode>();
  let lastEvents: readonly MarketEvent[] = [];

  /** The capped growth curve, shifted by the trend offset. */
  function fairValue(fund: (typeof funds)[number], years: number) {
    const { annualDrift, initialPrice } = fund.profile;
    const cap = fund.dynamics.maxLogGrowth;
    const decay = Math.exp((-annualDrift * years) / cap);
    return {
      log: Math.log(initialPrice) + cap * (1 - decay) + fund.trendLog,
      slope: annualDrift * decay,
    };
  }

  /** Moves the shared regime and every fund's trend one day forward. */
  function stepTrends(years: number) {
    if (random() < 1 / REGIMES[regime]!.days) {
      regime = (regime + 1 + Math.floor(random() * (REGIMES.length - 1))) % REGIMES.length;
    }
    marketTrend +=
      (REGIMES[regime]!.level - marketTrend) * (1 - Math.exp(-1 / REGIME_SMOOTHING_DAYS));
    for (const fund of funds) {
      const { dynamics, trendPersistence: phi } = fund;
      fund.trend = phi * fund.trend + Math.sqrt(1 - phi ** 2) * dynamics.trendVolatility * normal();
      const curveSlope = fairValue(fund, years).slope;
      const offset = fund.trendLog;
      // The cubic term only matters for large offsets: it bounds the long run.
      let slope =
        dynamics.trendLoading * marketTrend +
        fund.trend -
        dynamics.trendReversionPerYear * offset * (1 + 8 * offset ** 2);
      if (dynamics.minSlopeShare !== undefined) {
        slope = Math.max(slope, (dynamics.minSlopeShare - 1) * curveSlope);
      }
      fund.trendLog += slope * DT;
      fund.trendSlope = slope;
    }
  }

  function activeEvents(): readonly MarketEvent[] | undefined {
    const active: MarketEvent[] = [];
    for (const kind of MARKET_EVENT_KINDS) {
      const event = episodes.get(kind)?.event;
      if (event && time >= event.startedAt) active.push(event);
    }
    if (active.length === 0) return undefined;
    // Reuse the previous array while the same events stay active.
    const same =
      active.length === lastEvents.length && active.every((event, i) => event === lastEvents[i]);
    if (!same) lastEvents = Object.freeze(active);
    return lastEvents;
  }

  function step(): PriceTick {
    time += SIM_MS_PER_TICK;
    for (const [kind, episode] of episodes) {
      if (time < episode.event.endsAt) continue;
      const spec = EVENTS[kind];
      for (const [fundId, bridge] of episode.bridges) {
        const phases = spec.aftermath.map(({ share, days }) => ({
          dailyDrift: (share * bridge.offset) / days,
          days,
        }));
        byId.get(fundId)!.aftermaths.set(kind, phases);
      }
      episodes.delete(kind);
    }
    const events = activeEvents();
    const years = (time - start) / YEAR_MS;
    stepTrends(years);
    const market = normal();

    for (const fund of funds) {
      const { profile, dynamics } = fund;
      const idiosyncratic = dynamics.tailDof > 0 ? studentT(dynamics.tailDof) : normal();
      const weight = dynamics.marketWeight;
      const shock = weight * market + Math.sqrt(1 - weight ** 2) * idiosyncratic;
      const sigma = Math.sqrt(fund.variance);

      const fair = fairValue(fund, years);
      const deviation = fund.logPrice - fair.log;
      // The cubic term only matters far from fair value: it bounds the long run.
      const reversion = dynamics.reversionPerYear * deviation * (1 + 3 * deviation ** 2);
      let jump = 0;
      const jumps = profile.jumpsPerYear > 0 ? poisson(profile.jumpsPerYear * DT) : 0;
      for (let i = 0; i < jumps; i++) jump += profile.jumpMean + profile.jumpStd * normal();
      // Compensate the jumps' mean so the expected log-return follows the fair value.
      const drift =
        fair.slope + fund.trendSlope - profile.jumpsPerYear * profile.jumpMean - reversion;
      let innovation = sigma * shock + jump;
      const baseReturn = drift * DT + innovation;
      fund.logPrice += baseReturn;

      // Events and their aftermath move the offset on top of the base.
      const bridges: Bridge[] = [];
      const planned: { expected: number; daily: number }[] = [];
      for (const { event, bridges: byFund } of episodes.values()) {
        const bridge = byFund.get(profile.id);
        if (!bridge || time < event.startedAt) continue;
        const length = event.endsAt - event.startedAt;
        const progress = (time - event.startedAt + SIM_MS_PER_TICK) / length;
        bridges.push(bridge);
        planned.push({
          expected: bridge.target * progress,
          daily: (bridge.target * SIM_MS_PER_TICK) / length,
        });
      }
      let eventReturn = 0;
      for (const [kind, phases] of fund.aftermaths) {
        const phase = phases[0]!;
        eventReturn += phase.dailyDrift;
        if (--phase.days <= 0) phases.shift();
        if (phases.length === 0) fund.aftermaths.delete(kind);
      }
      if (bridges.length > 0) {
        // Each bridge follows a straight path to its target, pulling part of the
        // way back each day after noise knocks it off. Everything else that moved
        // the fund today is shared among the bridges, so the overall move ends
        // near the targets without pinning the last day. Boosted noise keeps the
        // path jagged.
        const boost = Math.max(...bridges.map((bridge) => bridge.volatilityBoost));
        const noise = (boost - 1) * sigma * shock;
        const pushes = bridges.map(
          (bridge, i) =>
            BRIDGE_PULL * (planned[i]!.expected - bridge.cumulative) +
            (1 - BRIDGE_PULL) * planned[i]!.daily,
        );
        const pushed = pushes.reduce((sum, push) => sum + push, 0);
        const shared = (baseReturn + eventReturn + noise) / bridges.length;
        bridges.forEach((bridge, i) => {
          bridge.cumulative += pushes[i]! + shared;
          bridge.offset += pushes[i]! + noise / bridges.length;
        });
        eventReturn += pushed + noise;
        innovation += noise;
      } else if (fund.aftermaths.size === 0 && eventReturn === 0) {
        eventReturn = -fund.eventLog * (1 - Math.exp(-1 / EVENT_MEMORY_DAYS));
      }
      fund.eventLog = Math.min(MAX_EVENT_LOG, Math.max(MIN_EVENT_LOG, fund.eventLog + eventReturn));

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
        Math.max(0.01, Math.round(Math.exp(fund.logPrice + fund.eventLog) * 100) / 100),
      ]),
    ) as Record<FundId, number>;
    return Object.freeze(
      events
        ? { t: time, prices: Object.freeze(prices), events }
        : { t: time, prices: Object.freeze(prices) },
    );
  }

  function trigger(kind: MarketEventKind): MarketEvent {
    const spec = EVENTS[kind];
    const nextTick = time + SIM_MS_PER_TICK;
    const running = episodes.get(kind);
    // Re-sending a running event extends it to a full period from the next tick,
    // keeping its progress; its move is redrawn but never exceeds one event's range.
    const event: MarketEvent = Object.freeze({
      kind,
      ...(spec.fundId ? { fundId: spec.fundId } : {}),
      startedAt: running ? running.event.startedAt : nextTick,
      endsAt: nextTick + spec.days * DAY_MS,
    });
    const episode: Episode = running ?? { event, bridges: new Map() };
    episode.event = event;
    const years = (time - start) / YEAR_MS;
    const intensity = eventRandom();

    for (const [fundId, effect] of Object.entries(spec.effects) as [FundId, EventEffect][]) {
      const fund = byId.get(fundId)!;
      const share = Math.min(1, Math.max(0, intensity + EFFECT_JITTER * (eventRandom() - 0.5)));
      const drawn = Math.log(1 + effect.min + (effect.max - effect.min) * share);
      const bridge = episode.bridges.get(fundId);
      const cumulative = bridge?.cumulative ?? 0;
      // Keep the fund within the event bounds around its fair value.
      const deviation = fund.logPrice + fund.eventLog - fairValue(fund, years).log;
      const floor = cumulative + Math.log(EVENT_FLOOR_RATIO) - deviation;
      const ceiling = cumulative + Math.log(EVENT_CEILING_RATIO) - deviation;
      // Even when squeezed by the bounds, the event still moves the fund its way.
      const minimal = 0.2 * Math.abs(Math.log(1 + (effect.min + effect.max) / 2));
      let target = Math.min(ceiling, Math.max(floor, drawn));
      target = drawn < 0 ? Math.min(-minimal, target) : Math.max(minimal, target);
      if (bridge) {
        if (Math.abs(target) > Math.abs(bridge.target)) bridge.target = target;
      } else {
        episode.bridges.set(fundId, {
          cumulative: 0,
          offset: 0,
          target,
          volatilityBoost: effect.volatilityBoost,
        });
        fund.aftermaths.delete(kind);
      }
    }
    episodes.set(kind, episode);
    return event;
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

const KEY = Symbol.for("solid-realtime-demo.market-simulation.v6");
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
 * with `startedAt <= t < endsAt` list the event in `events`. Different kinds can
 * overlap; triggering a kind that is already active extends it to a full period
 * from the next tick instead of stacking a second one.
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
