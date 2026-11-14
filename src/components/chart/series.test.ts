import { describe, expect, it } from "vitest";
import { DAY_MS, FUNDS, HISTORY_WINDOW_MS } from "../../market/funds";
import type { PriceTick } from "../../market/types";
import { Cash, Portfolio, PortfolioTimeline, Stock } from "../../portfolio";
import { buildGeometry, formatAxisMoney, FRAME } from "./geometry";
import { buildSeries } from "./series";

const fund = FUNDS[0];
const portfolio = (shares: number, cash = 0) =>
  new Portfolio({
    stocks: [new Stock({ id: fund.id, name: fund.name, shares })],
    cash: new Cash(cash),
  });
const tick = (t: number, price = 10): PriceTick => ({
  t,
  prices: {
    "andes-arriesgado": price,
    "manquehue-moderado": 20,
    "cristobal-conservador": 30,
  },
});

describe("buildSeries", () => {
  it("handles empty and single-tick histories", () => {
    const timeline = PortfolioTimeline.start(portfolio(2, 7), 10);
    expect(buildSeries([], timeline)).toEqual([]);
    expect(buildSeries([tick(0)], timeline)).toEqual([{ t: 0, values: [20, 0, 0, 7], total: 27 }]);
  });

  it("uses initial holdings for hypothetical history and historical holdings after changes", () => {
    const timeline = PortfolioTimeline.start(portfolio(2, 7), DAY_MS).commit(
      portfolio(1, 17),
      2 * DAY_MS,
    );
    const points = buildSeries(
      [tick(0), tick(DAY_MS), tick(2 * DAY_MS), tick(3 * DAY_MS, 15)],
      timeline,
    );
    expect(points[0].total).toBe(27);
    expect(points.filter((point) => point.t === 2 * DAY_MS).map((point) => point.values)).toEqual([
      [20, 0, 0, 7],
      [10, 0, 0, 17],
    ]);
    expect(points.at(-1)?.total).toBe(32);
  });

  it("interpolates the left boundary and preserves both sides of an off-tick rebalance", () => {
    const timeline = PortfolioTimeline.start(portfolio(2), 0).commit(portfolio(1, 10), 25);
    const points = buildSeries(
      [tick(0, 10), tick(100, 20), tick(HISTORY_WINDOW_MS + 10, 30)],
      timeline,
    );
    expect(points[0].t).toBe(10);
    expect(points[0].total).toBe(22);
    expect(points.filter((point) => point.t === 25).map((point) => point.total)).toEqual([
      25, 22.5,
    ]);
    expect(points.at(-1)?.t).toBe(HISTORY_WINDOW_MS + 10);
  });

  it("keeps only the final commit when multiple rebalances share a timestamp", () => {
    const timeline = PortfolioTimeline.start(portfolio(2), 0)
      .commit(portfolio(1, 10), 50)
      .commit(portfolio(0, 20), 50);
    const points = buildSeries([tick(0), tick(100)], timeline);
    expect(points.filter((point) => point.t === 50).map((point) => point.values)).toEqual([
      [20, 0, 0, 0],
      [0, 0, 0, 20],
    ]);
  });

  it("bounds work to the point budget and keeps the endpoints even with many changes", () => {
    const ticks = Array.from({ length: 10_000 }, (_, i) => tick((i * DAY_MS) / 25));
    let timeline = PortfolioTimeline.start(portfolio(2), 0);
    for (let i = 1; i < 500; i++) timeline = timeline.commit(portfolio(1, i), (i * DAY_MS) / 2);
    for (const limit of [2, 3, 4, 31, 400]) {
      const points = buildSeries(ticks, timeline, limit);
      expect(points.length).toBeLessThanOrEqual(limit);
      expect(points[0].t).toBe(ticks.at(-1)!.t - HISTORY_WINDOW_MS);
      expect(points.at(-1)?.t).toBe(ticks.at(-1)!.t);
      expect(points.every((point, i) => i === 0 || point.t >= points[i - 1].t)).toBe(true);
    }
  });
});

describe("chart geometry", () => {
  it("keeps a fixed year domain and shows only markers within the window", () => {
    const timeline = PortfolioTimeline.start(portfolio(2, 7), -HISTORY_WINDOW_MS - 1)
      .commit(portfolio(1, 17), -10)
      .commit(portfolio(0, 27), 0);
    const geometry = buildGeometry(
      buildSeries([tick(-HISTORY_WINDOW_MS), tick(0)], timeline),
      timeline,
    );
    expect(geometry.split).toBe(FRAME.left);
    expect(geometry.markers.map((marker) => marker.label)).toEqual(["Rebalanceo", "Rebalanceo"]);
    expect(geometry.layers).toHaveLength(4);
    expect(geometry.totalPath).not.toMatch(/NaN|undefined/);
    expect(geometry.latestValue).toBe(27);
  });

  it("handles empty / zero portfolios and formats CLP axes", () => {
    const timeline = PortfolioTimeline.start(portfolio(0), 0);
    expect(buildGeometry([], timeline).latestValue).toBeUndefined();
    expect(buildGeometry(buildSeries([tick(0)], timeline), timeline).totalPath).not.toContain(
      "NaN",
    );
    expect(formatAxisMoney(250_000_000)).toBe("$250 M");
    expect(formatAxisMoney(250_000)).toBe("$250 mil");
  });
});
