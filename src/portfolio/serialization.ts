import { Portfolio } from "./portfolio";
import { Cash, Stock } from "./stock";
import { PortfolioTimeline } from "./timeline";

/**
 * Plain-JSON form of a timeline, so a browser can keep its portfolio history
 * across reloads (e.g. in localStorage). Only data is stored; the immutable
 * classes are rebuilt (and re-validated) when reading it back.
 */
export interface SerializedTimeline {
  readonly version: 1;
  readonly entries: readonly {
    readonly at: number;
    readonly cash: number;
    readonly stocks: readonly {
      readonly id: string;
      readonly name: string;
      readonly shares: number;
    }[];
  }[];
}

export function serializeTimeline(timeline: PortfolioTimeline): SerializedTimeline {
  return {
    version: 1,
    entries: timeline.entries.map(({ portfolio, at }) => ({
      at,
      cash: portfolio.cash.shares,
      stocks: portfolio.stocks.map(({ id, name, shares }) => ({ id, name, shares })),
    })),
  };
}

/**
 * Rebuild a timeline from stored JSON. Returns `undefined` for anything that is
 * not a valid timeline (wrong version, bad shares, non-chronological entries…)
 * instead of throwing, so callers can simply start over.
 */
export function deserializeTimeline(data: unknown): PortfolioTimeline | undefined {
  try {
    const value = data as SerializedTimeline;
    if (value?.version !== 1 || !Array.isArray(value.entries) || !value.entries.length)
      return undefined;
    const entries: SerializedTimeline["entries"] = value.entries;
    let timeline: PortfolioTimeline | undefined;
    for (const entry of entries) {
      const portfolio = new Portfolio({
        stocks: entry.stocks.map((stock) => new Stock(stock)),
        cash: new Cash(entry.cash),
      });
      timeline = timeline
        ? timeline.commit(portfolio, entry.at)
        : PortfolioTimeline.start(portfolio, entry.at);
    }
    return timeline;
  } catch {
    return undefined;
  }
}
