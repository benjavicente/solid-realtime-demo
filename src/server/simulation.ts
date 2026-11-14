import {
  FUNDS,
  HISTORY_WINDOW_MS,
  REAL_MS_PER_TICK,
  SIM_MS_PER_TICK,
  YEAR_MS,
  type FundId,
} from "~/market/funds";
import type { PriceTick } from "~/market/types";

const CAPACITY = HISTORY_WINDOW_MS / SIM_MS_PER_TICK;
const DT = SIM_MS_PER_TICK / YEAR_MS;
const COMMON_WEIGHT = 0.6; // Pairwise shock correlation is 0.36.
const INDEPENDENT_WEIGHT = Math.sqrt(1 - COMMON_WEIGHT ** 2);

function createSimulation() {
  let seed = 0x4d41524b;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
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

  // A fixed epoch and seed make the demo's initial simulated year reproducible.
  let time = Date.UTC(2020, 0, 1);
  const prices = Object.fromEntries(FUNDS.map((fund) => [fund.id, fund.initialPrice])) as Record<
    FundId,
    number
  >;
  const history = new Array<PriceTick>(CAPACITY);
  let cursor = 0;
  const watchers = new Set<() => void>();

  function tick() {
    const common = normal();
    for (const fund of FUNDS) {
      const shock = COMMON_WEIGHT * common + INDEPENDENT_WEIGHT * normal();
      let jump = 0;
      const jumps = fund.jumpsPerYear > 0 ? poisson(fund.jumpsPerYear * DT) : 0;
      for (let i = 0; i < jumps; i++) jump += fund.jumpMean + fund.jumpStd * normal();
      // The profiles specify log-return drift; retain unrounded prices internally.
      prices[fund.id] *= Math.exp(
        fund.annualDrift * DT + fund.annualVolatility * Math.sqrt(DT) * shock + jump,
      );
    }
    time += SIM_MS_PER_TICK;
    const rounded = Object.fromEntries(
      FUNDS.map((fund) => [fund.id, Math.max(0.01, Math.round(prices[fund.id] * 100) / 100)]),
    ) as Record<FundId, number>;
    history[cursor] = Object.freeze({ t: time, prices: Object.freeze(rounded) });
    cursor = (cursor + 1) % CAPACITY;
    for (const notify of watchers) notify();
  }

  for (let i = 0; i < CAPACITY; i++) tick();
  const timer = setInterval(tick, REAL_MS_PER_TICK);
  timer.unref();
  return {
    latest: () => history[(cursor + CAPACITY - 1) % CAPACITY]!,
    history: () => [...history.slice(cursor), ...history.slice(0, cursor)],
    watchers,
  };
}

const KEY = Symbol.for("solid-realtime-demo.market-simulation.v1");
const globals = globalThis as typeof globalThis & { [KEY]?: ReturnType<typeof createSimulation> };
const simulation = (globals[KEY] ??= createSimulation());

export function latestTick(): PriceTick {
  return simulation.latest();
}

export function priceHistory(): readonly PriceTick[] {
  return simulation.history();
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
