import { Cash, CASH_ID, Stock, type PriceLookup } from "./stock";
import { StockDiff } from "./stock-diff";

export type TargetError =
  | { kind: "sum"; total: number; difference: number }
  | { kind: "invalid"; stockId: string };
export type RebalanceResult = { ok: true; plan: RebalancePlan } | { ok: false; error: TargetError };

/** An immutable trade preview, in holding order with cash last. */
export class RebalancePlan {
  readonly diffs: readonly StockDiff[];
  readonly totalValue: number;

  /** Copy the trade list so later caller mutations cannot change this preview. */
  constructor(init: { diffs: readonly StockDiff[]; totalValue: number }) {
    this.diffs = Object.freeze([...init.diffs]);
    this.totalValue = init.totalValue;
    Object.freeze(this);
  }

  /** Whether applying this preview leaves every holding unchanged. */
  get isEmpty(): boolean {
    return this.diffs.every((diff) => diff.action === "hold");
  }
}

/** Immutable fund positions plus the uninvested CLP balance. */
export class Portfolio {
  readonly stocks: readonly Stock[];
  readonly cash: Cash;

  /** Require distinct fund ids so allocation and trade lookup remain unambiguous. */
  constructor(init: { stocks: readonly Stock[]; cash?: Cash }) {
    const ids = new Set<string>();
    for (const stock of init.stocks) {
      if (stock.id === CASH_ID || ids.has(stock.id))
        throw new Error(`Duplicate or reserved stock id: ${stock.id}`);
      ids.add(stock.id);
    }
    this.stocks = Object.freeze([...init.stocks]);
    this.cash = init.cash ?? new Cash(0);
    Object.freeze(this);
  }

  /** List every position, including cash even when its balance is zero. */
  holdings(): readonly Stock[] {
    return Object.freeze([...this.stocks, this.cash]);
  }

  /** Read a position's quantity, with absent funds treated as zero. */
  shares(id: string): number {
    return id === CASH_ID
      ? this.cash.shares
      : (this.stocks.find((stock) => stock.id === id)?.shares ?? 0);
  }

  /** Mark all holdings to the supplied price snapshot. */
  totalValue(prices: PriceLookup): number {
    return this.holdings().reduce((total, stock) => total + stock.value(prices), 0);
  }

  /** Return percentages including cash; an empty portfolio has all-zero weights. */
  allocation(prices: PriceLookup): Readonly<Record<string, number>> {
    const total = this.totalValue(prices);
    return Object.freeze(
      Object.fromEntries(
        this.holdings().map((stock) => [
          stock.id,
          total === 0 ? 0 : (stock.value(prices) / total) * 100,
        ]),
      ),
    );
  }

  /** Invest initial capital using exactly the same whole-share rules as later trades. */
  static fromPlan(input: {
    capital: number;
    plan: Readonly<Record<string, number>>;
    prices: PriceLookup;
    funds: readonly { id: string; name: string }[];
  }): Portfolio {
    const portfolio = new Portfolio({
      stocks: input.funds.map((fund) => new Stock({ ...fund, shares: 0 })),
      cash: new Cash(input.capital),
    });
    const result = Portfolio.rebalance({ portfolio, prices: input.prices, targets: input.plan });
    if (!result.ok)
      throw new RangeError(`Invalid initial allocation: ${JSON.stringify(result.error)}`);
    return portfolio.apply(result.plan);
  }

  /**
   * Prepare trades from a shared valuation without mutating the current positions.
   *
   * The portfolio is valued at the given prices (funds + cash) and that total is
   * redistributed according to `targets` (percent per fund; cash is implicitly 0%):
   *
   * 1. Each fund gets `floor(targetValue / price)` whole shares.
   * 2. The leftover is spent greedily, one share at a time, on the affordable fund
   *    furthest below its target value, until no share fits.
   * 3. Whatever remains stays as cash, so cash only holds what whole shares cannot absorb.
   *
   * Sales fund purchases (the total never changes), there are no fees and no leverage.
   * The result is a list of `StockDiff`s: what to buy or sell of each holding.
   */
  static rebalance(input: {
    portfolio: Portfolio;
    prices: PriceLookup;
    targets: Readonly<Record<string, number>>;
  }): RebalanceResult {
    const { portfolio, prices, targets } = input;
    const ids = new Set(portfolio.stocks.map((stock) => stock.id));
    let targetTotal = 0;
    for (const [stockId, percent] of Object.entries(targets)) {
      if (!ids.has(stockId) || !Number.isFinite(percent) || percent < 0 || percent > 100) {
        return { ok: false, error: { kind: "invalid", stockId } };
      }
      targetTotal += percent;
    }
    if (Math.abs(100 - targetTotal) > 0.01 + 1e-12)
      return {
        ok: false,
        error: { kind: "sum", total: targetTotal, difference: 100 - targetTotal },
      };

    const total = portfolio.totalValue(prices);
    const quotes = portfolio.stocks.map((stock) => stock.currentPrice(prices));
    const targetValues = portfolio.stocks.map((stock) => (total * (targets[stock.id] ?? 0)) / 100);
    const quantities = targetValues.map((value, i) => Math.floor(value / quotes[i]));
    let remaining = total - quantities.reduce((sum, shares, i) => sum + shares * quotes[i], 0);

    // Floor each target to whole shares, then spend the remainder on the largest
    // affordable deficit. Strict comparisons preserve holding order for ties.
    // A tolerated percentage excess can overfund the floors: sell the least
    // underweight shares first so even such inputs never require leverage.
    while (remaining < 0) {
      let candidate = -1;
      for (let i = 0; i < quantities.length; i++) {
        if (
          quantities[i] > 0 &&
          (candidate === -1 ||
            quantities[i] * quotes[i] - targetValues[i] >
              quantities[candidate] * quotes[candidate] - targetValues[candidate])
        )
          candidate = i;
      }
      quantities[candidate]--;
      remaining += quotes[candidate];
    }
    while (true) {
      let candidate = -1;
      for (let i = 0; i < quantities.length; i++) {
        if (
          quotes[i] <= remaining &&
          (candidate === -1 ||
            targetValues[i] - quantities[i] * quotes[i] >
              targetValues[candidate] - quantities[candidate] * quotes[candidate])
        )
          candidate = i;
      }
      if (candidate === -1) break;
      quantities[candidate]++;
      remaining -= quotes[candidate];
    }
    const cash = new Cash(remaining);
    const diffs = portfolio.holdings().map((stock, i) => {
      const price = stock.currentPrice(prices);
      const sharesAfter = stock.id === CASH_ID ? cash.shares : quantities[i];
      return new StockDiff({
        stockId: stock.id,
        name: stock.name,
        price,
        sharesBefore: stock.shares,
        sharesAfter,
        targetPercent: targets[stock.id] ?? 0,
        resultingPercent: total === 0 ? 0 : ((sharesAfter * price) / total) * 100,
      });
    });
    return { ok: true, plan: new RebalancePlan({ diffs, totalValue: total }) };
  }

  /** Apply a preview only when it contains exactly this portfolio's holding ids. */
  apply(plan: RebalancePlan): Portfolio {
    const diffs = new Map(plan.diffs.map((diff) => [diff.stockId, diff]));
    const holdings = this.holdings();
    if (
      diffs.size !== holdings.length ||
      plan.diffs.length !== holdings.length ||
      holdings.some((stock) => !diffs.has(stock.id))
    )
      throw new Error("Plan stock ids do not match portfolio holdings");
    return new Portfolio({
      stocks: this.stocks.map((stock) => stock.withShares(diffs.get(stock.id)!.sharesAfter)),
      cash: this.cash.withShares(diffs.get(CASH_ID)!.sharesAfter),
    });
  }
}
