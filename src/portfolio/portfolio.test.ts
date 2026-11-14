import { describe, expect, it } from "vitest";
import { FUNDS, INITIAL_PLAN } from "../market/funds";
import {
  Cash,
  CASH_ID,
  Portfolio,
  RebalancePlan,
  Stock,
  StockDiff,
  type PriceLookup,
} from "./index";

const prices: PriceLookup = { a: 60, b: 40 };
const position = (id: string, shares: number) => new Stock({ id, name: id.toUpperCase(), shares });
const portfolio = (a: number, b: number, cash = 0) =>
  new Portfolio({ stocks: [position("a", a), position("b", b)], cash: new Cash(cash) });
const prepare = (
  current: Portfolio,
  targets: Readonly<Record<string, number>>,
  quotes = prices,
) => {
  const result = Portfolio.rebalance({ portfolio: current, targets, prices: quotes });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.plan;
};

describe("stock and cash", () => {
  it.each([-1, 1.5, NaN, Infinity])("rejects invalid share quantity %s", (shares) => {
    expect(() => position("a", shares)).toThrow();
  });

  it("values positions and rejects missing or unusable quotes", () => {
    const stock = position("a", 3);
    expect(stock.currentPrice(prices)).toBe(60);
    expect(stock.value(prices)).toBe(180);
    const unusable: PriceLookup[] = [{}, { a: 0 }, { a: -1 }, { a: NaN }, { a: Infinity }];
    for (const quotes of unusable) {
      expect(() => stock.currentPrice(quotes)).toThrow();
    }
    expect(() => position("toString", 0).currentPrice({})).toThrow();
  });

  it("rounds cash, keeps its unit price, and copies the concrete position type", () => {
    const cash = new Cash(10.129);
    expect(cash.id).toBe(CASH_ID);
    expect(cash.name).toBe("Caja");
    expect(cash.shares).toBe(10.13);
    expect(new Cash(1.005).shares).toBe(1.01);
    expect(cash.currentPrice()).toBe(1);
    expect(cash.value({})).toBe(10.13);
    expect(cash.withShares(2.555)).toBeInstanceOf(Cash);
    expect(cash.withShares(2.555).shares).toBe(2.56);
    for (const amount of [-0.001, NaN, Infinity]) expect(() => new Cash(amount)).toThrow();
    class DemoStock extends Stock {}
    const stock = new DemoStock({ id: "a", name: "A", shares: 1 });
    expect(stock.withShares(2)).toBeInstanceOf(DemoStock);
    expect(stock.shares).toBe(1);
    expect(Object.isFrozen(stock)).toBe(true);
    expect(Object.isFrozen(cash)).toBe(true);
  });
});

describe("portfolio", () => {
  it("provides ordered holdings, shares, total value and allocation including cash", () => {
    const current = portfolio(1, 1, 20);
    expect(current.holdings().map((stock) => stock.id)).toEqual(["a", "b", "cash"]);
    expect(current.shares("cash")).toBe(20);
    expect(current.shares("a")).toBe(1);
    expect(current.shares("absent")).toBe(0);
    expect(current.totalValue(prices)).toBe(120);
    expect(current.allocation(prices).a).toBe(50);
    expect(current.allocation(prices).b).toBeCloseTo(100 / 3);
    expect(current.allocation(prices).cash).toBeCloseTo(100 / 6);
    expect(portfolio(0, 0).allocation(prices)).toEqual({ a: 0, b: 0, cash: 0 });
    expect(Object.isFrozen(current.allocation(prices))).toBe(true);
    expect(new Portfolio({ stocks: [] }).totalValue({})).toBe(0);
  });

  it("rejects duplicate and reserved fund ids", () => {
    expect(() => new Portfolio({ stocks: [position("a", 1), position("a", 2)] })).toThrow();
    expect(() => new Portfolio({ stocks: [new Cash(0)] })).toThrow();
  });

  it.each([
    [{ a: 30, b: 60 }, 90, 10],
    [{ a: 60, b: 60 }, 120, -20],
  ] as const)("reports the target sum and its signed difference", (targets, total, difference) => {
    expect(Portfolio.rebalance({ portfolio: portfolio(1, 1), prices, targets })).toEqual({
      ok: false,
      error: { kind: "sum", total, difference },
    });
  });

  it.each([-1, NaN, 101, Infinity])("rejects invalid target %s", (percent) => {
    expect(
      Portfolio.rebalance({ portfolio: portfolio(1, 1), prices, targets: { a: percent, b: 100 } }),
    ).toEqual({ ok: false, error: { kind: "invalid", stockId: "a" } });
  });

  it.each(["cash", "unknown"])("rejects a target outside the fund holdings: %s", (id) => {
    expect(
      Portfolio.rebalance({ portfolio: portfolio(1, 1), prices, targets: { a: 100, [id]: 0 } }),
    ).toEqual({ ok: false, error: { kind: "invalid", stockId: id } });
  });

  it("treats omitted held targets as zero and includes a cash diff last", () => {
    const plan = prepare(portfolio(1, 1), { a: 100 });
    expect(plan.diffs.map((diff) => diff.stockId)).toEqual(["a", "b", "cash"]);
    expect(plan.diffs[1].targetPercent).toBe(0);
    expect(plan.diffs[2].targetPercent).toBe(0);
  });

  it("reports no trades for an exactly balanced holding", () => {
    const plan = prepare(portfolio(2, 2), { a: 60, b: 40 });
    expect(plan.isEmpty).toBe(true);
    expect(plan.diffs.every((diff) => diff.action === "hold")).toBe(true);
  });

  it("sells positions to fund purchases without extra cash", () => {
    const current = portfolio(4, 0);
    const plan = prepare(current, { a: 0, b: 100 });
    expect(plan.diffs.map((diff) => diff.action)).toEqual(["sell", "buy", "hold"]);
    expect(plan.diffs[0].deltaShares).toBe(-4);
    expect(plan.diffs[0].amount).toBe(-240);
    expect(plan.diffs[1].amount).toBe(240);
    expect(plan.diffs[1].resultingPercent).toBe(100);
    expect(current.apply(plan).shares("b")).toBe(6);
  });

  it("spends the remainder on the largest affordable deficit, breaking ties by holding order", () => {
    const quotes = { a: 10, b: 10 };
    const next = portfolio(0, 0, 30).apply(prepare(portfolio(0, 0, 30), { a: 50, b: 50 }, quotes));
    expect(next.shares("a")).toBe(2);
    expect(next.shares("b")).toBe(1);
    const unequal = portfolio(0, 0, 100);
    const changed = unequal.apply(prepare(unequal, { a: 70, b: 30 }, { a: 60, b: 30 }));
    expect(changed.shares("a")).toBe(1);
    expect(changed.shares("b")).toBe(1);
    expect(changed.cash.shares).toBe(10);
  });

  it("conserves value, buys only whole shares and leaves no affordable share", () => {
    for (const quotes of [prices, { a: 17.25, b: 3.75 }, { a: 800, b: 500 }]) {
      for (let cash = 0; cash < 150; cash += 7) {
        for (const a of [0, 10, 50, 99, 100]) {
          const current = portfolio(3, 9, cash + 0.13);
          const plan = prepare(current, { a, b: 100 - a }, quotes);
          const changed = current.apply(plan);
          expect(changed.totalValue(quotes)).toBeCloseTo(current.totalValue(quotes), 8);
          expect(
            changed.stocks.every((stock) => Number.isInteger(stock.shares) && stock.shares >= 0),
          ).toBe(true);
          expect(changed.cash.shares).toBeGreaterThanOrEqual(0);
          expect(changed.cash.shares).toBeLessThan(Math.min(quotes.a, quotes.b));
          expect(plan.diffs.reduce((sum, diff) => sum + diff.resultingPercent, 0)).toBeCloseTo(
            100,
            8,
          );
        }
      }
    }
  });

  it("accepts sums within tolerance without leverage, including floors above available capital", () => {
    const current = portfolio(0, 0, 1_000_000);
    for (const targets of [
      { a: 50, b: 49.99 },
      { a: 50, b: 50.01 },
    ]) {
      const quotes = { a: 1, b: 1 };
      const next = current.apply(prepare(current, targets, quotes));
      expect(next.totalValue(quotes)).toBe(1_000_000);
      expect(next.cash.shares).toBe(0);
    }
  });

  it("handles zero capital", () => {
    const plan = prepare(portfolio(0, 0), { a: 50, b: 50 });
    expect(plan.isEmpty).toBe(true);
    expect(plan.totalValue).toBe(0);
    expect(plan.diffs.every((diff) => diff.resultingPercent === 0)).toBe(true);
  });

  it("copies and freezes collections and leaves the original unchanged when applying", () => {
    const stocks = [position("a", 4), position("b", 0)];
    const current = new Portfolio({ stocks });
    stocks.pop();
    const plan = prepare(current, { a: 0, b: 100 });
    const changed = current.apply(plan);
    expect(changed).not.toBe(current);
    expect(current.shares("a")).toBe(4);
    expect(current.shares("b")).toBe(0);
    expect(current.stocks).toHaveLength(2);
    for (const value of [
      current,
      current.stocks,
      current.holdings(),
      plan,
      plan.diffs,
      ...plan.diffs,
      changed,
      changed.cash,
    ])
      expect(Object.isFrozen(value)).toBe(true);
    const diffs = [...plan.diffs];
    const copy = new RebalancePlan({ diffs, totalValue: plan.totalValue });
    diffs.pop();
    expect(copy.diffs).toHaveLength(3);
    expect(() => {
      (current.stocks as Stock[]).push(position("c", 1));
    }).toThrow();
  });

  it("rejects plans with missing, foreign or duplicate holding ids", () => {
    const current = portfolio(1, 1);
    const plan = prepare(current, { a: 50, b: 50 });
    for (const diffs of [
      plan.diffs.slice(1),
      [...plan.diffs, plan.diffs[0]],
      [plan.diffs[0], plan.diffs[0], plan.diffs[2]],
      [new StockDiff({ ...plan.diffs[0], stockId: "other" }), ...plan.diffs.slice(1)],
    ]) {
      expect(() =>
        current.apply(new RebalancePlan({ diffs, totalValue: plan.totalValue })),
      ).toThrow();
    }
  });

  it("starts the demo at approximately 10/30/60 from 250 million CLP", () => {
    const quotes = Object.fromEntries(FUNDS.map((fund) => [fund.id, fund.initialPrice]));
    const initial = Portfolio.fromPlan({
      capital: 250_000_000,
      plan: INITIAL_PLAN,
      prices: quotes,
      funds: FUNDS,
    });
    const allocation = initial.allocation(quotes);
    for (const fund of FUNDS)
      expect(Math.abs(allocation[fund.id] - INITIAL_PLAN[fund.id])).toBeLessThan(0.1);
    expect(initial.totalValue(quotes)).toBe(250_000_000);
    expect(initial.cash.shares).toBeLessThan(1000);
    expect(() =>
      Portfolio.fromPlan({
        capital: 100,
        plan: { a: 40 },
        prices,
        funds: [{ id: "a", name: "A" }],
      }),
    ).toThrow();
  });
});
