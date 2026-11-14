import * as stylex from "@stylexjs/stylex";
import { For } from "solid-js";
import { CASH_COLOR, FUNDS } from "../../market/funds";
import type { PortfolioState } from "../../state/portfolio";
import { integer, Money, Percent, Swatch } from "../../ui/format";
import { ui } from "../../ui/styles";

const styles = stylex.create({
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
});

/** Holdings at live prices, with the target % input of each fund. */
export function StocksTable(props: { state: PortfolioState }) {
  const state = () => props.state;
  return (
    <>
      <h2 {...stylex.attrs(ui.h2)}>Stocks</h2>
      <div {...stylex.attrs(ui.tableScroll)}>
        <table {...stylex.attrs(ui.table)}>
          <thead>
            <tr>
              <th {...stylex.attrs(ui.th, ui.left)}>Fondo</th>
              <th {...stylex.attrs(ui.th)}>Cuotas</th>
              <th {...stylex.attrs(ui.th)}>Precio</th>
              <th {...stylex.attrs(ui.th)}>Valorización</th>
              <th {...stylex.attrs(ui.th)}>% actual</th>
              <th {...stylex.attrs(ui.th)}>% objetivo</th>
            </tr>
          </thead>
          <tbody>
            <For each={FUNDS}>
              {(fund) => (
                <tr>
                  <td {...stylex.attrs(ui.td, ui.left)}>
                    <span {...stylex.attrs(ui.fund)}>
                      <Swatch color={fund.color} />
                      {fund.name}
                    </span>
                  </td>
                  <td {...stylex.attrs(ui.td)}>
                    {integer.format(state().portfolio().shares(fund.id))}
                  </td>
                  <td {...stylex.attrs(ui.td)}>
                    <Money value={state().prices()[fund.id]} />
                  </td>
                  <td {...stylex.attrs(ui.td)}>
                    <Money
                      value={state().portfolio().shares(fund.id) * state().prices()[fund.id]}
                    />
                  </td>
                  <td {...stylex.attrs(ui.td)}>
                    <Percent value={state().allocation()[fund.id]} />
                  </td>
                  <td {...stylex.attrs(ui.td)}>
                    <input
                      {...stylex.attrs(styles.input)}
                      type="number"
                      inputmode="decimal"
                      min="0"
                      max="100"
                      step="1"
                      aria-label={`% objetivo de ${fund.name}`}
                      value={state().targets[fund.id]}
                      onInput={(event) => state().setTarget(fund.id, event.currentTarget.value)}
                    />{" "}
                    %
                  </td>
                </tr>
              )}
            </For>
            <tr>
              <td {...stylex.attrs(ui.td, ui.left)}>
                <span {...stylex.attrs(ui.fund)}>
                  <Swatch color={CASH_COLOR} />
                  Caja
                </span>
              </td>
              <td {...stylex.attrs(ui.td)} />
              <td {...stylex.attrs(ui.td)} />
              <td {...stylex.attrs(ui.td)}>
                <Money value={state().portfolio().cash.shares} />
              </td>
              {/* Cash has no target: it only holds what whole shares can't absorb. */}
              <td {...stylex.attrs(ui.td)} />
              <td {...stylex.attrs(ui.td)} />
            </tr>
            <tr>
              <td {...stylex.attrs(ui.td, ui.left, ui.footer)}>Total</td>
              <td {...stylex.attrs(ui.td, ui.footer)} />
              <td {...stylex.attrs(ui.td, ui.footer)} />
              <td {...stylex.attrs(ui.td, ui.footer)}>
                <Money value={state().total()} />
              </td>
              <td {...stylex.attrs(ui.td, ui.footer)}>100 %</td>
              <td {...stylex.attrs(ui.td, ui.footer)}>
                <Percent value={state().targetSum()} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
