import { describe, expect, it } from "vitest";
import { Cash, Portfolio, PortfolioTimeline, Stock } from "./index";
import { deserializeTimeline, serializeTimeline } from "./serialization";

const portfolio = (a: number, b: number, cash: number) =>
  new Portfolio({
    stocks: [
      new Stock({ id: "a", name: "A", shares: a }),
      new Stock({ id: "b", name: "B", shares: b }),
    ],
    cash: new Cash(cash),
  });

describe("timeline serialization", () => {
  it("round-trips through JSON", () => {
    const timeline = PortfolioTimeline.start(portfolio(1, 2, 3.5), 100).commit(
      portfolio(4, 0, 0),
      200,
    );
    const restored = deserializeTimeline(JSON.parse(JSON.stringify(serializeTimeline(timeline))));
    expect(restored).toBeInstanceOf(PortfolioTimeline);
    expect(restored!.entries.map((entry) => entry.at)).toEqual([100, 200]);
    expect(restored!.current.shares("a")).toBe(4);
    expect(restored!.at(150).shares("b")).toBe(2);
    expect(restored!.entries[0].portfolio.cash.shares).toBe(3.5);
  });

  it("rejects invalid data instead of throwing", () => {
    expect(deserializeTimeline(null)).toBeUndefined();
    expect(deserializeTimeline({ version: 2, entries: [] })).toBeUndefined();
    expect(deserializeTimeline({ version: 1, entries: [] })).toBeUndefined();
    const fractional = {
      version: 1,
      entries: [{ at: 0, cash: 0, stocks: [{ id: "a", name: "A", shares: 1.5 }] }],
    };
    expect(deserializeTimeline(fractional)).toBeUndefined();
    const backwards = {
      version: 1,
      entries: [
        { at: 10, cash: 0, stocks: [] },
        { at: 5, cash: 0, stocks: [] },
      ],
    };
    expect(deserializeTimeline(backwards)).toBeUndefined();
  });
});
