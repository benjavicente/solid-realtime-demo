import * as stylex from "@stylexjs/stylex";
import { createMemo, createSignal, createStore, For, Loading, onSettled, Show } from "solid-js";
import "./app.css";
import { PortfolioChart } from "./components/chart/PortfolioChart";
import { getPriceHistory, livePrices } from "./market/api";
import {
  CASH_COLOR,
  DAY_MS,
  FUND_IDS,
  FUNDS,
  getFund,
  INITIAL_CAPITAL_CLP,
  INITIAL_PLAN,
  YEAR_MS,
  type FundId,
  type RiskLevel,
} from "./market/funds";
import type { PriceTick } from "./market/types";
import {
  CASH_ID,
  Portfolio,
  PortfolioTimeline,
  type StockDiff,
  type TargetError,
} from "./portfolio";

const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const integer = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const simDate = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "UTC" });

const RISK_LABEL: Record<RiskLevel, string> = {
  high: "Riesgo alto",
  medium: "Riesgo medio",
  low: "Riesgo bajo",
};

const styles = stylex.create({
  page: {
    minHeight: "100vh",
    backgroundColor: "#f6f8f6",
    color: "#2f3b36",
    fontFamily: "system-ui, sans-serif",
  },
  main: { maxWidth: 1440, marginInline: "auto", padding: 24 },
  header: {
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  eyebrow: { margin: 0, color: "#3f6f5a", fontWeight: 600, fontSize: 13 },
  title: { margin: "4px 0 0", fontSize: 26 },
  clock: { textAlign: "right", color: "#6b7a72", fontSize: 13, lineHeight: 1.5 },
  clockDate: { color: "#2f3b36", fontSize: 16, fontWeight: 600 },
  layout: {
    display: "grid",
    gap: 20,
    alignItems: "start",
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 1360px)": "minmax(680px, 1fr) minmax(0, 1.2fr)",
    },
  },
  panel: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e3e8e4",
    borderRadius: 12,
    padding: 20,
    minWidth: 0,
  },
  section: { marginTop: 24 },
  h2: { margin: "0 0 12px", fontSize: 18 },
  tableScroll: { overflowX: "auto" },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
    fontVariantNumeric: "tabular-nums",
  },
  th: {
    textAlign: "right",
    fontWeight: 500,
    color: "#6b7a72",
    fontSize: 12,
    paddingBlock: 6,
    paddingInline: 6,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#e3e8e4",
    whiteSpace: "nowrap",
  },
  td: {
    textAlign: "right",
    paddingBlock: 8,
    paddingInline: 6,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#e3e8e4",
    whiteSpace: "nowrap",
  },
  left: { textAlign: "left" },
  footer: { fontWeight: 600, borderBottomWidth: 0 },
  fund: { display: "flex", alignItems: "center", gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 3, flexShrink: 0 },
  risk: { display: "block", color: "#6b7a72", fontSize: 11 },
  input: {
    width: 52,
    backgroundColor: "#fff",
    color: "#2f3b36",
    paddingBlock: 4,
    paddingInline: 6,
    fontSize: 14,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e3e8e4",
    borderRadius: 6,
  },
  muted: { color: "#6b7a72" },
  buy: { color: "#2f7d55", fontWeight: 600 },
  sell: { color: "#b4493f", fontWeight: 600 },
  error: { color: "#b4493f", fontSize: 13, margin: "10px 0 0" },
  hint: { color: "#6b7a72", fontSize: 13, margin: "10px 0 0", lineHeight: 1.5 },
  actions: { display: "flex", gap: 12, alignItems: "center", marginTop: 16, flexWrap: "wrap" },
  button: {
    paddingBlock: 10,
    paddingInline: 18,
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 8,
    borderWidth: 0,
    color: "#fff",
    backgroundColor: { default: "#3f6f5a", ":disabled": "#b9c4be" },
    cursor: { default: "pointer", ":disabled": "not-allowed" },
  },
  secondary: {
    paddingBlock: 10,
    paddingInline: 14,
    fontSize: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#e3e8e4",
    backgroundColor: "transparent",
    color: "#2f3b36",
    cursor: "pointer",
  },
  loading: { padding: 40, color: "#6b7a72" },
});

export default function App() {
  // The market is a live server stream, so the dashboard renders in the browser
  // once hydrated (same approach as Solid's server-dbmon client route).
  const [running, setRunning] = createSignal(false);
  onSettled(() => {
    // StyleX serves its CSS through a dev-only runtime; builds emit a stylesheet.
    if (import.meta.env.DEV) void import("virtual:stylex:runtime");
    setRunning(true);
  });
  return (
    <div {...stylex.attrs(styles.page)}>
      <main {...stylex.attrs(styles.main)}>
        <Show when={running()} fallback={<p {...stylex.attrs(styles.loading)}>Cargando…</p>}>
          <Loading fallback={<p {...stylex.attrs(styles.loading)}>Conectando al mercado…</p>}>
            <Dashboard />
          </Loading>
        </Show>
      </main>
    </div>
  );
}

function Dashboard() {
  // Global server state: one price stream shared by every client.
  const history = createMemo(() => getPriceHistory());
  const tick = createMemo(() => livePrices());

  // The year of prices the chart needs: the history fetched once on load plus
  // every live tick, trimmed to a sliding one-year window.
  const ticks = createMemo<readonly PriceTick[]>((prev) => {
    const base = prev ?? history();
    const live = tick();
    const last = base[base.length - 1];
    if (last && live.t <= last.t) return base;
    const start = live.t - YEAR_MS;
    let first = 0;
    while (first < base.length && base[first].t < start) first++;
    return [...base.slice(first), live];
  });

  // Client state: the portfolio history. It starts with 250M CLP invested per
  // the plan at the prices at load time; every rebalance appends a new
  // immutable portfolio stamped with the simulated time.
  const [timeline, setTimeline] = createSignal(() => {
    const loaded = history();
    const prices = loaded[loaded.length - 1];
    return PortfolioTimeline.start(
      Portfolio.fromPlan({
        capital: INITIAL_CAPITAL_CLP,
        plan: INITIAL_PLAN,
        prices: prices.prices,
        funds: FUNDS,
      }),
      prices.t,
    );
  });

  // Target inputs are kept as typed text; parsing happens in a memo.
  const [targets, setTargets] = createStore<Record<FundId, string>>(
    Object.fromEntries(FUND_IDS.map((id) => [id, String(INITIAL_PLAN[id])])) as Record<
      FundId,
      string
    >,
  );
  const parsedTargets = createMemo(() =>
    Object.fromEntries(
      FUND_IDS.map((id) => [id, targets[id].trim() === "" ? 0 : Number(targets[id])]),
    ),
  );

  const prices = () => tick().prices;
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

  const rebalance = () => {
    const value = result();
    if (!value.ok || value.plan.isEmpty) return;
    const at = tick().t;
    setTimeline((current) => current.commit(current.current.apply(value.plan), at));
  };
  const resetTargets = () => {
    setTargets((draft) => {
      for (const id of FUND_IDS) draft[id] = String(INITIAL_PLAN[id]);
    });
  };
  const useCurrent = () => {
    setTargets((draft) => {
      for (const id of FUND_IDS) draft[id] = String(Math.round(allocation()[id] * 10) / 10);
    });
  };

  const day = () => Math.floor((tick().t - timeline().startedAt) / DAY_MS);

  return (
    <>
      <header {...stylex.attrs(styles.header)}>
        <div>
          <p {...stylex.attrs(styles.eyebrow)}>Solid 2 · Mercado en tiempo real</p>
          <h1 {...stylex.attrs(styles.title)}>Portafolio · {money.format(total())}</h1>
        </div>
        <div {...stylex.attrs(styles.clock)}>
          <div {...stylex.attrs(styles.clockDate)}>{simDate.format(tick().t)}</div>
          <div>
            Día {day()} desde que llegaste · 4 h simuladas por segundo · mismos precios para todos
          </div>
        </div>
      </header>

      <div {...stylex.attrs(styles.layout)}>
        <section {...stylex.attrs(styles.panel)} aria-label="Distribución">
          <h2 {...stylex.attrs(styles.h2)}>Stocks</h2>
          <div {...stylex.attrs(styles.tableScroll)}>
            <table {...stylex.attrs(styles.table)}>
              <thead>
                <tr>
                  <th {...stylex.attrs(styles.th, styles.left)}>Fondo</th>
                  <th {...stylex.attrs(styles.th)}>Cuotas</th>
                  <th {...stylex.attrs(styles.th)}>Precio</th>
                  <th {...stylex.attrs(styles.th)}>Valorización</th>
                  <th {...stylex.attrs(styles.th)}>% actual</th>
                  <th {...stylex.attrs(styles.th)}>% objetivo</th>
                </tr>
              </thead>
              <tbody>
                <For each={FUNDS}>
                  {(fund) => (
                    <tr>
                      <td {...stylex.attrs(styles.td, styles.left)}>
                        <span {...stylex.attrs(styles.fund)}>
                          <Swatch color={fund.color} />
                          <span>
                            {fund.name}
                            <span {...stylex.attrs(styles.risk)}>{RISK_LABEL[fund.risk]}</span>
                          </span>
                        </span>
                      </td>
                      <td {...stylex.attrs(styles.td)}>
                        {integer.format(portfolio().shares(fund.id))}
                      </td>
                      <td {...stylex.attrs(styles.td)}>{money.format(prices()[fund.id])}</td>
                      <td {...stylex.attrs(styles.td)}>
                        {money.format(portfolio().shares(fund.id) * prices()[fund.id])}
                      </td>
                      <td {...stylex.attrs(styles.td)}>
                        {percent.format(allocation()[fund.id])} %
                      </td>
                      <td {...stylex.attrs(styles.td)}>
                        <input
                          {...stylex.attrs(styles.input)}
                          type="number"
                          inputmode="decimal"
                          min="0"
                          max="100"
                          step="1"
                          aria-label={`% objetivo de ${fund.name}`}
                          value={targets[fund.id]}
                          onInput={(event) => {
                            const value = event.currentTarget.value;
                            setTargets((draft) => {
                              draft[fund.id] = value;
                            });
                          }}
                        />{" "}
                        %
                      </td>
                    </tr>
                  )}
                </For>
                <tr>
                  <td {...stylex.attrs(styles.td, styles.left)}>
                    <span {...stylex.attrs(styles.fund)}>
                      <Swatch color={CASH_COLOR} />
                      <span>
                        Caja
                        <span {...stylex.attrs(styles.risk)}>Lo que no alcanza para una cuota</span>
                      </span>
                    </span>
                  </td>
                  <td {...stylex.attrs(styles.td, styles.muted)}>—</td>
                  <td {...stylex.attrs(styles.td, styles.muted)}>—</td>
                  <td {...stylex.attrs(styles.td)}>{money.format(portfolio().cash.shares)}</td>
                  <td {...stylex.attrs(styles.td)}>{percent.format(allocation()[CASH_ID])} %</td>
                  <td {...stylex.attrs(styles.td, styles.muted)}>0 %</td>
                </tr>
                <tr>
                  <td {...stylex.attrs(styles.td, styles.left, styles.footer)}>Total</td>
                  <td {...stylex.attrs(styles.td, styles.footer)} />
                  <td {...stylex.attrs(styles.td, styles.footer)} />
                  <td {...stylex.attrs(styles.td, styles.footer)}>{money.format(total())}</td>
                  <td {...stylex.attrs(styles.td, styles.footer)}>100 %</td>
                  <td {...stylex.attrs(styles.td, styles.footer)}>
                    {percent.format(targetSum())} %
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <Show when={error()}>
            {(value) => <p {...stylex.attrs(styles.error)}>{describeError(value())}</p>}
          </Show>

          <div {...stylex.attrs(styles.section)}>
            <h2 {...stylex.attrs(styles.h2)}>Cambios</h2>
            <Show
              when={plan()}
              fallback={
                <p {...stylex.attrs(styles.hint)}>Ajusta los % objetivo para ver los cambios.</p>
              }
            >
              {(current) => (
                <>
                  <div {...stylex.attrs(styles.tableScroll)}>
                    <table {...stylex.attrs(styles.table)}>
                      <thead>
                        <tr>
                          <th {...stylex.attrs(styles.th, styles.left)}>Fondo</th>
                          <th {...stylex.attrs(styles.th, styles.left)}>Acción</th>
                          <th {...stylex.attrs(styles.th)}>Cuotas</th>
                          <th {...stylex.attrs(styles.th)}>Monto</th>
                          <th {...stylex.attrs(styles.th)}>Resultado</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={current().diffs} keyed={(diff: StockDiff) => diff.stockId}>
                          {(diff) => <DiffRow diff={diff()} />}
                        </For>
                      </tbody>
                    </table>
                  </div>
                  <p {...stylex.attrs(styles.hint)}>
                    Solo cuotas enteras, sin comisiones: las ventas financian las compras y lo que
                    no alcanza para una cuota queda en caja. Los montos se recalculan con cada
                    precio que llega del servidor.
                  </p>
                </>
              )}
            </Show>
            <div {...stylex.attrs(styles.actions)}>
              <button
                type="button"
                {...stylex.attrs(styles.button)}
                disabled={!plan() || plan()!.isEmpty}
                onClick={rebalance}
              >
                Rebalancear
              </button>
              <button type="button" {...stylex.attrs(styles.secondary)} onClick={useCurrent}>
                Usar % actual
              </button>
              <button type="button" {...stylex.attrs(styles.secondary)} onClick={resetTargets}>
                Plan inicial
              </button>
              <span {...stylex.attrs(styles.muted)}>
                {timeline().changes.length === 1
                  ? "1 rebalanceo"
                  : `${timeline().changes.length} rebalanceos`}
              </span>
            </div>
          </div>
        </section>

        <section {...stylex.attrs(styles.panel)}>
          <PortfolioChart ticks={ticks()} timeline={timeline()} />
        </section>
      </div>
    </>
  );
}

function DiffRow(props: { diff: StockDiff }) {
  const color = () =>
    props.diff.stockId === CASH_ID ? CASH_COLOR : getFund(props.diff.stockId as FundId).color;
  const actionLabel = () =>
    props.diff.stockId === CASH_ID
      ? "Saldo final"
      : { buy: "Comprar", sell: "Vender", hold: "Mantener" }[props.diff.action];
  const isCash = () => props.diff.stockId === CASH_ID;
  const actionAttrs = () =>
    isCash() || props.diff.action === "hold"
      ? stylex.attrs(styles.td, styles.left, styles.muted)
      : props.diff.action === "buy"
        ? stylex.attrs(styles.td, styles.left, styles.buy)
        : stylex.attrs(styles.td, styles.left, styles.sell);
  return (
    <tr>
      <td {...stylex.attrs(styles.td, styles.left)}>
        <span {...stylex.attrs(styles.fund)}>
          <Swatch color={color()} />
          {props.diff.name}
        </span>
      </td>
      <td {...actionAttrs()}>{actionLabel()}</td>
      <td {...stylex.attrs(styles.td)}>
        {isCash()
          ? "—"
          : `${props.diff.deltaShares > 0 ? "+" : ""}${integer.format(props.diff.deltaShares)}`}
      </td>
      <td {...stylex.attrs(styles.td)}>
        {isCash()
          ? money.format(props.diff.price * props.diff.sharesAfter)
          : money.format(Math.abs(props.diff.amount))}
      </td>
      <td {...stylex.attrs(styles.td)}>
        {percent.format(props.diff.resultingPercent)} %
        <span {...stylex.attrs(styles.muted)}> / {percent.format(props.diff.targetPercent)} %</span>
      </td>
    </tr>
  );
}

function Swatch(props: { color: string }) {
  return (
    <svg {...stylex.attrs(styles.swatch)} viewBox="0 0 10 10" aria-hidden="true">
      <rect width="10" height="10" rx="3" fill={props.color} />
    </svg>
  );
}

function describeError(error: TargetError): string {
  if (error.kind === "invalid") {
    const name = FUNDS.find((fund) => fund.id === error.stockId)?.name ?? error.stockId;
    return `El % objetivo de ${name} debe estar entre 0 y 100.`;
  }
  const gap = percent.format(Math.abs(error.difference));
  return error.difference > 0
    ? `Los % objetivo suman ${percent.format(error.total)} %: faltan ${gap} % para llegar a 100 %.`
    : `Los % objetivo suman ${percent.format(error.total)} %: sobran ${gap} %.`;
}
