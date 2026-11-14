import * as stylex from "@stylexjs/stylex";
import { For } from "solid-js";
import { DAY_MS } from "../../market/funds";
import { EVENT_COPY } from "../../market/events";
import type { MarketEvent } from "../../market/types";

const styles = stylex.create({
  alert: {
    margin: "8px 8px 0 0",
    paddingBlock: 6,
    paddingInline: 10,
    borderRadius: 6,
    backgroundColor: "#e2ece6",
    color: "#1f4a3b",
    fontSize: 13,
    display: "inline-block",
  },
});

/** One notice per active market event (the hidden easter eggs). */
export function MarketAlerts(props: { events: readonly MarketEvent[]; now: number }) {
  return (
    <For each={props.events}>
      {(event) => (
        <p {...stylex.attrs(styles.alert)} role="status">
          {EVENT_COPY[event.kind].icon} {EVENT_COPY[event.kind].message} ·{" "}
          {daysLeft(event.endsAt, props.now)}
        </p>
      )}
    </For>
  );
}

function daysLeft(endsAt: number, now: number): string {
  const days = Math.max(0, Math.ceil((endsAt - now) / DAY_MS));
  return days === 1 ? "queda 1 día" : `quedan ${days} días`;
}
