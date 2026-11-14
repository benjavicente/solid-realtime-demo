import * as stylex from "@stylexjs/stylex";
import { DAY_MS } from "../../market/funds";
import { simDate } from "../../ui/format";

const styles = stylex.create({
  clock: { margin: "6px 0 0", color: "#6b7a72", fontSize: 13, lineHeight: 1.5 },
});

/** Simulated date and how many simulated days since this portfolio started. */
export function SimClock(props: { now: number; startedAt: number }) {
  const day = () => Math.floor((props.now - props.startedAt) / DAY_MS);
  return (
    <p {...stylex.attrs(styles.clock)}>
      {simDate.format(props.now)} · día {day()} desde que llegaste
    </p>
  );
}
