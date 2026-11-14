import { createMemo, createSignal, Loading, onSettled, Show } from "solid-js";
import "./app.css";
import { Dashboard, DashboardShell } from "./components/dashboard/Dashboard";
import { getPriceHistory } from "./market/api";

// Start dev CSS loading with the module graph, before hydration settles
// (StyleX serves its CSS through a dev-only runtime; builds emit a stylesheet).
if (import.meta.env.DEV) void import("virtual:stylex:runtime");

export default function App() {
  // SSR resolves the history and ships it in the hydration payload, so the
  // browser doesn't need a round trip before the first paint.
  const history = createMemo(() => getPriceHistory());
  // The live market is a continuous stream, so the interactive dashboard (and
  // its localStorage state) starts in the browser once hydrated, like the
  // client route of Solid's server-dbmon example. Until then the server-rendered
  // shell shows the page frame.
  const [running, setRunning] = createSignal(false);
  onSettled(() => {
    setRunning(true);
  });
  return (
    <Loading fallback={<DashboardShell />}>
      <Show when={history().length > 0 && running()} fallback={<DashboardShell />}>
        <Dashboard history={history()} />
      </Show>
    </Loading>
  );
}
