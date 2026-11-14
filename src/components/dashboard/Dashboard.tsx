import * as stylex from "@stylexjs/stylex";
import { createSignal } from "solid-js";
import type { PriceTick } from "../../market/types";
import { createMarketFeed } from "../../state/market";
import { useMarketEvents } from "../../state/market-events";
import { createPortfolioState } from "../../state/portfolio";
import { PortfolioChart, type SeriesPoint } from "../chart/PortfolioChart";
import { ui } from "../../ui/styles";
import { Brand } from "./Brand";
import { ChangesTable } from "./ChangesTable";
import { Layout } from "./Layout";
import { MarketAlerts } from "./MarketAlerts";
import { RebalanceControls } from "./RebalanceControls";
import { SimClock } from "./SimClock";
import { StocksTable } from "./StocksTable";
import { Topbar } from "./Topbar";
import { Valuation } from "./Valuation";

const styles = stylex.create({
  chartArea: { paddingTop: 24, paddingBottom: 6, paddingInline: 8, minWidth: 0 },
});

/**
 * Composes the dashboard: shared market state from the server, the client's
 * portfolio state, and the UI pieces that read them.
 */
export function Dashboard(props: { history: readonly PriceTick[] }) {
  const market = createMarketFeed(() => props.history);
  const portfolio = createPortfolioState(market);
  useMarketEvents();

  // The chart sample under the pointer, shown as the top-right valuation.
  const [hovered, setHovered] = createSignal<SeriesPoint | undefined>(undefined);

  return (
    <Layout
      sidebar={
        <>
          <Brand onRestart={portfolio.restart} />
          <StocksTable state={portfolio} />
          <RebalanceControls state={portfolio} />
          <ChangesTable plan={portfolio.plan()} />
        </>
      }
    >
      <Topbar
        title="Evolución del portafolio"
        aside={<Valuation value={hovered()?.total ?? portfolio.total()} at={hovered()?.t} />}
      >
        <SimClock now={market.tick().t} startedAt={portfolio.timeline().startedAt} />
        <MarketAlerts events={market.tick().events ?? []} now={market.tick().t} />
      </Topbar>
      <div {...stylex.attrs(styles.chartArea)}>
        <PortfolioChart
          ticks={market.ticks()}
          timeline={portfolio.timeline()}
          onHover={setHovered}
        />
      </div>
    </Layout>
  );
}

/** Server-rendered placeholder with the page frame, shown until the dashboard is ready. */
export function DashboardShell() {
  return (
    <Layout
      sidebar={
        <>
          <Brand />
          <p {...stylex.attrs(ui.hint)} role="status">
            Cargando…
          </p>
        </>
      }
    >
      <Topbar title="Evolución del portafolio" />
    </Layout>
  );
}
