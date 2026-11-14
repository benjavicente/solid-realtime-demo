import { describe, expect, it } from "vitest";
import { Cash, Portfolio, PortfolioTimeline } from "./index";

const holding = (cash: number) => new Portfolio({ stocks: [], cash: new Cash(cash) });

describe("portfolio timeline", () => {
  it("finds holdings before, between, at and after commits", () => {
    const first = holding(10);
    const second = holding(20);
    const third = holding(30);
    const timeline = PortfolioTimeline.start(first, 100).commit(second, 200).commit(third, 300);
    expect(timeline.startedAt).toBe(100);
    expect(timeline.current).toBe(third);
    for (const t of [-Infinity, 0, 100, 199]) expect(timeline.at(t)).toBe(first);
    for (const t of [200, 250, 299]) expect(timeline.at(t)).toBe(second);
    for (const t of [300, 500, Infinity]) expect(timeline.at(t)).toBe(third);
    expect(timeline.changes).toEqual([
      { portfolio: second, at: 200 },
      { portfolio: third, at: 300 },
    ]);
  });

  it("uses the last entry for equal timestamps and keeps previous histories immutable", () => {
    const first = holding(10);
    const next = holding(20);
    const original = PortfolioTimeline.start(first, 100);
    const changed = original.commit(next, 100);
    expect(original.current).toBe(first);
    expect(original.entries).toHaveLength(1);
    expect(original.changes).toEqual([]);
    expect(changed.at(99)).toBe(first);
    expect(changed.at(100)).toBe(next);
    for (const value of [changed, changed.entries, ...changed.entries, changed.changes])
      expect(Object.isFrozen(value)).toBe(true);
  });

  it("rejects backwards or non-finite commit times", () => {
    const first = holding(10);
    const timeline = PortfolioTimeline.start(first, 100);
    for (const at of [99, NaN, Infinity]) expect(() => timeline.commit(first, at)).toThrow();
    expect(() => PortfolioTimeline.start(first, NaN)).toThrow();
    expect(() => timeline.at(NaN)).toThrow();
  });

  it("matches a linear lookup across a long history", () => {
    let timeline = PortfolioTimeline.start(holding(0), 0);
    for (let i = 1; i <= 1000; i++) timeline = timeline.commit(holding(i), i * 10);
    for (let t = -5; t <= 10_005; t += 17) {
      expect(timeline.at(t).cash.shares).toBe(Math.max(0, Math.min(1000, Math.floor(t / 10))));
    }
  });
});
