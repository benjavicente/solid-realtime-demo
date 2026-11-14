import * as stylex from "@stylexjs/stylex";
import "./app.css";

const styles = stylex.create({
  main: { maxWidth: 720, marginInline: "auto", padding: 32, fontFamily: "system-ui, sans-serif" },
  label: { color: "#3569a8", fontWeight: 600 },
});

export default function App() {
  return (
    <main {...stylex.attrs(styles.main)}>
      <p {...stylex.attrs(styles.label)}>Solid 2 · Realtime</p>
      <h1>Realtime market simulation</h1>
      <p>A shared, server-driven market with interactive client-side state.</p>
    </main>
  );
}
