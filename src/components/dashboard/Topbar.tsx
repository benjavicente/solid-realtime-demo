import * as stylex from "@stylexjs/stylex";
import type { JSX } from "@solidjs/web";

const styles = stylex.create({
  topbar: {
    display: "flex",
    flexWrap: "nowrap",
    gap: 16,
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingBlock: 20,
    paddingInline: 28,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#e3e8e4",
  },
  info: { minWidth: 0 },
  title: { margin: 0, fontSize: 18 },
});

/** Workspace header: title and details on the left, an aside (valuation) on the right. */
export function Topbar(props: { title: string; children?: JSX.Element; aside: JSX.Element }) {
  return (
    <header {...stylex.attrs(styles.topbar)}>
      <div {...stylex.attrs(styles.info)}>
        <h1 {...stylex.attrs(styles.title)}>{props.title}</h1>
        {props.children}
      </div>
      {props.aside}
    </header>
  );
}
