import * as stylex from "@stylexjs/stylex";
import { FUNDS } from "../../market/funds";
import type { TargetError } from "../../portfolio";
import type { PortfolioState } from "../../state/portfolio";
import { percent } from "../../ui/format";
import { ui } from "../../ui/styles";

const styles = stylex.create({
  error: {
    color: "#b4493f",
    fontSize: 13,
    lineHeight: "20px",
    minHeight: 20,
    margin: "10px 0 0",
  },
  actions: { display: "flex", gap: 12, alignItems: "center", marginTop: 8, flexWrap: "wrap" },
});

/** Validation message (fixed height, so it never shifts the UI) and the actions. */
export function RebalanceControls(props: { state: PortfolioState }) {
  const state = () => props.state;
  const count = () => state().timeline().changes.length;
  return (
    <>
      <p {...stylex.attrs(styles.error)} role="status">
        {state().error() ? describeError(state().error()!) : ""}
      </p>
      <div {...stylex.attrs(styles.actions)}>
        <button
          type="button"
          {...stylex.attrs(ui.button)}
          disabled={!state().plan() || state().plan()!.isEmpty}
          onClick={() => state().rebalance()}
        >
          Rebalancear
        </button>
        <button
          type="button"
          {...stylex.attrs(ui.secondary)}
          onClick={() => state().useCurrentAllocation()}
        >
          Usar % actual
        </button>
        <button
          type="button"
          {...stylex.attrs(ui.secondary)}
          onClick={() => state().resetTargets()}
        >
          Plan inicial
        </button>
        <span {...stylex.attrs(ui.muted)}>
          {count() === 1 ? "1 rebalanceo" : `${count()} rebalanceos`}
        </span>
      </div>
    </>
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
