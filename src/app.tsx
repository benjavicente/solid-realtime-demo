import * as stylex from "@stylexjs/stylex";
import { createSignal, Loading, onSettled, Show } from "solid-js";
import "./app.css";
import { Dashboard } from "./components/dashboard/Dashboard";

const styles = stylex.create({
  loading: { padding: 40, color: "#6b7a72", fontFamily: "system-ui, sans-serif" },
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
    <Show when={running()} fallback={<p {...stylex.attrs(styles.loading)}>Cargando…</p>}>
      <Loading fallback={<p {...stylex.attrs(styles.loading)}>Conectando al mercado…</p>}>
        <Dashboard />
      </Loading>
    </Show>
  );
}
