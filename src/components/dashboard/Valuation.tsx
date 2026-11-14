import * as stylex from "@stylexjs/stylex";
import { INITIAL_CAPITAL_CLP } from "../../market/funds";
import { Money, Percent, simDate } from "../../ui/format";

const styles = stylex.create({
  valuation: { textAlign: "right", flexShrink: 0 },
  label: { color: "#6b7a72", fontSize: 13 },
  amount: { fontSize: 32, fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 },
  up: { color: "#2f7d55", fontSize: 13, fontWeight: 600 },
  down: { color: "#b4493f", fontSize: 13, fontWeight: 600 },
});

/** Portfolio value (live, or at the hovered chart day) and its change vs. the initial capital. */
export function Valuation(props: { value: number; at?: number }) {
  const change = () => (props.value / INITIAL_CAPITAL_CLP - 1) * 100;
  const up = () => change() >= -0.05;
  return (
    <div {...stylex.attrs(styles.valuation)}>
      <div {...stylex.attrs(styles.label)}>
        {props.at === undefined
          ? "Valorización actual"
          : `Valorización al ${simDate.format(props.at)}`}
      </div>
      <div {...stylex.attrs(styles.amount)}>
        <Money value={props.value} />
      </div>
      <div {...(up() ? stylex.attrs(styles.up) : stylex.attrs(styles.down))}>
        {up() ? "▲" : "▼"} <Percent value={Math.abs(change())} /> vs. capital inicial
      </div>
    </div>
  );
}
