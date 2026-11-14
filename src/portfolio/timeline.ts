import type { Portfolio } from "./portfolio";

export interface TimelineEntry {
  readonly portfolio: Portfolio;
  /** Simulated milliseconds. */
  readonly at: number;
}

/** Immutable position history for valuing chart samples at their simulated times. */
export class PortfolioTimeline {
  readonly entries: readonly TimelineEntry[];

  private constructor(entries: readonly TimelineEntry[]) {
    this.entries = Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
    Object.freeze(this);
  }

  /** Record the initial holding, also used for hypothetical samples before start. */
  static start(portfolio: Portfolio, at: number): PortfolioTimeline {
    if (!Number.isFinite(at)) throw new RangeError("Timeline time must be finite");
    return new PortfolioTimeline([{ portfolio, at }]);
  }

  /** Append a snapshot; equal timestamps use the most recently committed holding. */
  commit(portfolio: Portfolio, at: number): PortfolioTimeline {
    if (!Number.isFinite(at) || at < this.entries[this.entries.length - 1].at)
      throw new RangeError("Timeline commits must be chronological");
    return new PortfolioTimeline([...this.entries, { portfolio, at }]);
  }

  /** The most recently committed portfolio. */
  get current(): Portfolio {
    return this.entries[this.entries.length - 1].portfolio;
  }

  /** The first recorded simulated time. */
  get startedAt(): number {
    return this.entries[0].at;
  }

  /** Find the last snapshot at or before t in logarithmic time. */
  at(t: number): Portfolio {
    if (Number.isNaN(t)) throw new RangeError("Timeline query must not be NaN");
    let low = 0;
    let high = this.entries.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (this.entries[middle].at <= t) low = middle + 1;
      else high = middle;
    }
    return this.entries[Math.max(0, low - 1)].portfolio;
  }

  /** Committed changes after the initial holding. */
  get changes(): readonly TimelineEntry[] {
    return Object.freeze(this.entries.slice(1));
  }
}
