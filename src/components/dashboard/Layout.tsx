import * as stylex from "@stylexjs/stylex";
import type { JSX } from "@solidjs/web";

const styles = stylex.create({
  page: {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 1200px)": "minmax(700px, 46%) minmax(0, 1fr)",
    },
    backgroundColor: "#f6f8f6",
    color: "#2f3b36",
    fontFamily: "system-ui, sans-serif",
  },
  sidebar: {
    backgroundColor: "#ffffff",
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: "#e3e8e4",
    padding: 24,
    minWidth: 0,
  },
  workspace: { minWidth: 0, display: "flex", flexDirection: "column" },
});

/** Two-column page: a white sidebar on the left and the workspace on the right. */
export function Layout(props: { sidebar: JSX.Element; children: JSX.Element }) {
  return (
    <div {...stylex.attrs(styles.page)}>
      <aside {...stylex.attrs(styles.sidebar)} aria-label="Distribución">
        {props.sidebar}
      </aside>
      <main {...stylex.attrs(styles.workspace)}>{props.children}</main>
    </div>
  );
}
