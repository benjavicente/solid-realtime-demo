import * as stylex from "@stylexjs/stylex";
import { ui } from "../../ui/styles";

const styles = stylex.create({
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 28,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: "#3f6f5a",
  },
  icon: { width: 30, height: 30, flexShrink: 0 },
});

/** "Moka Portafolio" brand with the restart button at the end of the row. */
export function Brand(props: { onRestart: () => void }) {
  return (
    <div {...stylex.attrs(styles.row)}>
      <p {...stylex.attrs(styles.brand)}>
        <svg {...stylex.attrs(styles.icon)} viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="m7.025 11.825l.825-1.7q.25-.525.738-.825T9.65 9H11V2h7l-1 2l1 2h-5v3h1.275q.575 0 1.038.3t.737.8l.875 1.75l-3 2L12 12.875l-1.925.975zM2 22l4.125-8.375l3.8 2.525L12 15.125l2.075 1.025l3.75-2.475L22 22z"
          />
        </svg>
        Moka Portafolio
      </p>
      <button type="button" {...stylex.attrs(ui.secondary)} onClick={() => props.onRestart()}>
        Reiniciar
      </button>
    </div>
  );
}
