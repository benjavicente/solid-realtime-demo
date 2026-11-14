import { createEffect, createMemo, createSignal, createStore } from "solid-js";
import { FUND_IDS, FUNDS, INITIAL_CAPITAL_CLP, INITIAL_PLAN, type FundId } from "../market/funds";
import type { PriceTick } from "../market/types";
import { deserializeTimeline, Portfolio, PortfolioTimeline, serializeTimeline } from "../portfolio";
import type { MarketFeed } from "./market";
import { loadState, saveState } from "./storage";

/** A new portfolio: the initial capital invested per the plan at `tick`'s prices. */
export function freshTimeline(tick: PriceTick): PortfolioTimeline {
  return PortfolioTimeline.start(
    Portfolio.fromPlan({
      capital: INITIAL_CAPITAL_CLP,
      plan: INITIAL_PLAN,
      prices: tick.prices,
      funds: FUNDS,
    }),
    tick.t,
  );
}

/**
 * Client state: the portfolio history, the target inputs and everything derived
 * from them at the live prices. Persisted in localStorage.
 */
export function createPortfolioState(market: MarketFeed) {
  const saved = loadState();

  // Every rebalance appends a new immutable portfolio stamped with the simulated time.
  const [timeline, setTimeline] = createSignal(() => {
    const loaded = market.history();
    const latest = loaded[loaded.length - 1];
    const restored = saved && deserializeTimeline(saved.timeline);
    // Only reuse a history that fits the server's clock (it restarts from its
    // epoch when the server process restarts).
    if (restored && restored.entries[restored.entries.length - 1].at <= latest.t) return restored;
    return freshTimeline(latest);
  });

  // Target inputs are kept as typed text; parsing happens in a memo.
  const [targets, setTargets] = createStore<Record<FundId, string>>(
    Object.fromEntries(
      FUND_IDS.map((id) => [id, saved?.targets?.[id] ?? String(INITIAL_PLAN[id])]),
    ) as Record<FundId, string>,
  );
  const parsedTargets = createMemo(() =>
    Object.fromEntries(
      FUND_IDS.map((id) => [id, targets[id].trim() === "" ? 0 : Number(targets[id])]),
    ),
  );

  const prices = () => market.tick().prices;
  const portfolio = () => timeline().current;
  const total = createMemo(() => portfolio().totalValue(prices()));
  const allocation = createMemo(() => portfolio().allocation(prices()));
  const targetSum = createMemo(() =>
    Object.values(parsedTargets()).reduce(
      (sum, value) => sum + (Number.isFinite(value) ? value : 0),
      0,
    ),
  );

  // Reactive to every price tick: what would be bought or sold right now.
  const result = createMemo(() =>
    Portfolio.rebalance({ portfolio: portfolio(), prices: prices(), targets: parsedTargets() }),
  );
  const plan = createMemo(() => {
    const value = result();
    return value.ok ? value.plan : undefined;
  });
  const error = createMemo(() => {
    const value = result();
    return value.ok ? undefined : value.error;
  });

  createEffect(
    () => ({ timeline: serializeTimeline(timeline()), targets: { ...targets } }),
    (state) => {
      saveState(state);
    },
  );

  const setTarget = (id: FundId, value: string) => {
    setTargets((draft) => {
      draft[id] = value;
    });
  };
  const resetTargets = () => {
    setTargets((draft) => {
      for (const id of FUND_IDS) draft[id] = String(INITIAL_PLAN[id]);
    });
  };
  const useCurrentAllocation = () => {
    // Fund weights rescaled to 100 % (cash excluded) and rounded to 0.1 %; the
    // rounding remainder goes to the largest fund so the targets sum exactly 100.
    const weights = FUND_IDS.map((id) => allocation()[id]);
    const sum = weights.reduce((total, weight) => total + weight, 0) || 1;
    const tenths = weights.map((weight) => Math.round((weight / sum) * 1000));
    const largest = tenths.indexOf(Math.max(...tenths));
    tenths[largest] += 1000 - tenths.reduce((total, value) => total + value, 0);
    setTargets((draft) => {
      FUND_IDS.forEach((id, i) => {
        draft[id] = String(tenths[i] / 10);
      });
    });
  };
  const rebalance = () => {
    const value = result();
    if (!value.ok || value.plan.isEmpty) return;
    const at = market.tick().t;
    // Guard against a clock that went back (server restart, see createMarketFeed).
    if (at < timeline().entries[timeline().entries.length - 1].at) return;
    setTimeline((current) => current.commit(current.current.apply(value.plan), at));
  };
  const restart = () => {
    setTimeline(freshTimeline(market.tick()));
    resetTargets();
  };

  return {
    timeline,
    targets,
    prices,
    portfolio,
    total,
    allocation,
    targetSum,
    plan,
    error,
    setTarget,
    resetTargets,
    useCurrentAllocation,
    rebalance,
    restart,
  };
}

export type PortfolioState = ReturnType<typeof createPortfolioState>;
