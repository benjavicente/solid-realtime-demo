import * as stylex from "@stylexjs/stylex";
import { AnimatedNumber } from "../components/AnimatedNumber";

export const integer = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
export const percent = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
export const simDate = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "UTC" });

const MONEY_FORMAT = { style: "currency", currency: "CLP", maximumFractionDigits: 0 } as const;
const PERCENT_FORMAT = { minimumFractionDigits: 1, maximumFractionDigits: 1 } as const;

/** CLP amount whose digits roll to each new value. */
export function Money(props: { value: number }) {
  return <AnimatedNumber value={props.value} format={MONEY_FORMAT} />;
}

/** Percentage with one decimal, animated the same way. */
export function Percent(props: { value: number }) {
  return <AnimatedNumber value={props.value} format={PERCENT_FORMAT} suffix=" %" />;
}

const styles = stylex.create({
  swatch: { width: 10, height: 10, borderRadius: 3, flexShrink: 0 },
});

/** Small color square identifying a fund (or cash). */
export function Swatch(props: { color: string }) {
  return (
    <svg {...stylex.attrs(styles.swatch)} viewBox="0 0 10 10" aria-hidden="true">
      <rect width="10" height="10" rx="3" fill={props.color} />
    </svg>
  );
}
