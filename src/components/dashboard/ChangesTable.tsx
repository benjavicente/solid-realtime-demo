import * as stylex from "@stylexjs/stylex";
import { For, Show } from "solid-js";
import { CASH_COLOR, getFund, type FundId } from "../../market/funds";
import { CASH_ID, type RebalancePlan, type StockDiff } from "../../portfolio";
import { integer, Money, percent, Percent, Swatch } from "../../ui/format";
import { ui } from "../../ui/styles";

const styles = stylex.create({
  section: { marginTop: 28 },
  buy: { color: "#2f7d55", fontWeight: 600 },
  sell: { color: "#b4493f", fontWeight: 600 },
});

/** What would be bought or sold right now to reach the targets (live). */
export function ChangesTable(props: { plan: RebalancePlan | undefined }) {
  return (
    <div {...stylex.attrs(styles.section)}>
      <h2 {...stylex.attrs(ui.h2)}>Cambios</h2>
      <Show
        when={props.plan}
        fallback={<p {...stylex.attrs(ui.hint)}>Ajusta los % objetivo para ver los cambios.</p>}
      >
        {(plan) => (
          <>
            <div {...stylex.attrs(ui.tableScroll)}>
              <table {...stylex.attrs(ui.table)}>
                <thead>
                  <tr>
                    <th {...stylex.attrs(ui.th, ui.left)}>Fondo</th>
                    <th {...stylex.attrs(ui.th, ui.left)}>Acción</th>
                    <th {...stylex.attrs(ui.th)}>Cuotas</th>
                    <th {...stylex.attrs(ui.th)}>Monto</th>
                    <th {...stylex.attrs(ui.th)}>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={plan().diffs} keyed={(diff: StockDiff) => diff.stockId}>
                    {(diff) => <DiffRow diff={diff()} />}
                  </For>
                </tbody>
              </table>
            </div>
            <p {...stylex.attrs(ui.hint)}>
              Solo cuotas enteras, sin comisiones: las ventas financian las compras y lo que no
              alcanza para una cuota queda en caja. Los montos se recalculan con cada precio que
              llega del servidor.
            </p>
          </>
        )}
      </Show>
    </div>
  );
}

function DiffRow(props: { diff: StockDiff }) {
  const isCash = () => props.diff.stockId === CASH_ID;
  const color = () => (isCash() ? CASH_COLOR : getFund(props.diff.stockId as FundId).color);
  const actionLabel = () =>
    isCash()
      ? "Saldo final"
      : { buy: "Comprar", sell: "Vender", hold: "Mantener" }[props.diff.action];
  // StyleX needs static arguments, so each tone is a separate call.
  const actionAttrs = () =>
    isCash() || props.diff.action === "hold"
      ? stylex.attrs(ui.td, ui.left, ui.muted)
      : props.diff.action === "buy"
        ? stylex.attrs(ui.td, ui.left, styles.buy)
        : stylex.attrs(ui.td, ui.left, styles.sell);
  return (
    <tr>
      <td {...stylex.attrs(ui.td, ui.left)}>
        <span {...stylex.attrs(ui.fund)}>
          <Swatch color={color()} />
          {props.diff.name}
        </span>
      </td>
      <td {...actionAttrs()}>{actionLabel()}</td>
      <td {...stylex.attrs(ui.td)}>
        {isCash()
          ? ""
          : `${props.diff.deltaShares > 0 ? "+" : ""}${integer.format(props.diff.deltaShares)}`}
      </td>
      <td {...stylex.attrs(ui.td)}>
        {isCash() ? (
          <Money value={props.diff.price * props.diff.sharesAfter} />
        ) : (
          <Money value={Math.abs(props.diff.amount)} />
        )}
      </td>
      <td {...stylex.attrs(ui.td)}>
        <Show when={!isCash()}>
          <Percent value={props.diff.resultingPercent} />
          <span {...stylex.attrs(ui.muted)}> / {percent.format(props.diff.targetPercent)} %</span>
        </Show>
      </td>
    </tr>
  );
}
