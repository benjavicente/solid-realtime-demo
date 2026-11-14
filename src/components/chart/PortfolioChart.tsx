import * as stylex from "@stylexjs/stylex";
import { createMemo, createSignal, createUniqueId, For, Show } from "solid-js";
import type { PriceTick } from "../../market/types";
import type { PortfolioTimeline } from "../../portfolio";
import { buildGeometry, FRAME, LAYERS } from "./geometry";
import { buildSeries, type SeriesPoint } from "./series";

export { buildSeries, type SeriesPoint } from "./series";

export interface PortfolioChartProps {
  readonly ticks: readonly PriceTick[];
  readonly timeline: PortfolioTimeline;
  /** Called with the sample under the pointer, or `undefined` when it leaves. */
  readonly onHover?: (point: SeriesPoint | undefined) => void;
}

const styles = stylex.create({
  root: { width: "100%", minWidth: 0, fontFamily: "inherit", color: "#35443e" },
  chart: { display: "block", width: "100%", height: "auto", overflow: "visible" },
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 16,
    listStyle: "none",
    padding: 0,
    margin: "12px 0 0",
    fontSize: 12,
  },
  legendItem: { display: "flex", alignItems: "center", gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3, flexShrink: 0 },
  note: { margin: "10px 0 0", fontSize: 12, color: "#68776f", lineHeight: 1.5 },
});

/** A rolling simulated year of holdings valued using their historical allocation. */
export function PortfolioChart(props: PortfolioChartProps) {
  const id = createUniqueId();
  const series = createMemo(() => buildSeries(props.ticks, props.timeline));
  const geometry = createMemo(() => buildGeometry(series(), props.timeline));
  // Hovered sample, tracked by timestamp so it survives new ticks while the
  // pointer rests (as long as the sample is still in the window).
  const [hoveredT, setHoveredT] = createSignal<number | undefined>(undefined);
  const hovered = createMemo(() => {
    const t = hoveredT();
    return t === undefined ? undefined : geometry().anchors.find((anchor) => anchor.point.t === t);
  });
  const handlePointer = (event: PointerEvent & { currentTarget: SVGSVGElement }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * FRAME.width;
    const anchors = geometry().anchors;
    if (!anchors.length || x < FRAME.left - 8 || x > FRAME.right + 8) return clearHover();
    let nearest = anchors[0];
    for (const anchor of anchors)
      if (Math.abs(anchor.x - x) < Math.abs(nearest.x - x)) nearest = anchor;
    setHoveredT(nearest.point.t);
    props.onHover?.(nearest.point);
  };
  const clearHover = () => {
    setHoveredT(undefined);
    props.onHover?.(undefined);
  };
  return (
    <section {...stylex.attrs(styles.root)} aria-label="Evolución del portafolio">
      <svg
        {...stylex.attrs(styles.chart)}
        viewBox={`0 0 ${FRAME.width} ${FRAME.height}`}
        role="img"
        aria-labelledby={`${id}-title ${id}-description`}
        onPointerMove={handlePointer}
        onPointerLeave={clearHover}
      >
        <title id={`${id}-title`}>Valor del portafolio durante el último año</title>
        <desc id={`${id}-description`}>
          Áreas apiladas por fondo y caja, de abajo hacia arriba en el orden de la leyenda. La zona
          tenue anterior al inicio muestra una simulación de la distribución inicial.
        </desc>
        <defs>
          <clipPath id={`${id}-past`}>
            <rect
              x={FRAME.left}
              y={FRAME.top}
              width={geometry().split - FRAME.left}
              height={FRAME.bottom - FRAME.top}
            />
          </clipPath>
          <clipPath id={`${id}-live`}>
            <rect
              x={geometry().split}
              y={FRAME.top}
              width={FRAME.right - geometry().split}
              height={FRAME.bottom - FRAME.top}
            />
          </clipPath>
        </defs>
        <g font-size="12" fill="#68776f">
          <For each={geometry().yTicks} keyed={false}>
            {(tick) => (
              <g>
                <line
                  x1={FRAME.left}
                  x2={FRAME.right}
                  y1={tick().y}
                  y2={tick().y}
                  stroke="#e7ece8"
                />
                <text x={FRAME.left - 12} y={tick().y + 4} text-anchor="end">
                  {tick().label}
                </text>
              </g>
            )}
          </For>
          <For each={geometry().xTicks} keyed={false}>
            {(tick) => (
              <g>
                <line
                  x1={tick().x}
                  x2={tick().x}
                  y1={FRAME.bottom}
                  y2={FRAME.bottom + 5}
                  stroke="#bac5bd"
                />
                <text x={tick().x} y={FRAME.bottom + 25} text-anchor="middle">
                  {tick().label}
                </text>
              </g>
            )}
          </For>
        </g>
        <For each={["past", "live"]}>
          {(period) => (
            <g clip-path={`url(#${id}-${period})`} opacity={period === "past" ? 0.34 : 1}>
              <For each={geometry().layers} keyed={false}>
                {(layer) => <path d={layer().path} fill={layer().color} />}
              </For>
              <path
                d={geometry().totalPath}
                fill="none"
                stroke="#556b60"
                stroke-width="2"
                stroke-linejoin="round"
              />
            </g>
          )}
        </For>
        <For each={geometry().markers} keyed={false}>
          {(marker, index) => (
            <g>
              <title>{marker().label}</title>
              <line
                x1={marker().x}
                x2={marker().x}
                y1={FRAME.top}
                y2={FRAME.bottom}
                stroke="#68776f"
                stroke-width="1"
                stroke-dasharray="4 5"
              />
              <text
                x={marker().x > FRAME.right - 90 ? marker().x - 5 : marker().x + 5}
                y={20 + (index % 2) * 16}
                text-anchor={marker().x > FRAME.right - 90 ? "end" : "start"}
                fill="#68776f"
                font-size="11"
              >
                {marker().label}
              </text>
            </g>
          )}
        </For>
        <Show when={hovered()}>
          {(anchor) => (
            <g pointer-events="none">
              <line
                x1={anchor().x}
                x2={anchor().x}
                y1={FRAME.top}
                y2={FRAME.bottom}
                stroke="#35443e"
                stroke-opacity="0.5"
              />
              <circle
                cx={anchor().x}
                cy={anchor().y}
                r="4.5"
                fill="#fff"
                stroke="#35443e"
                stroke-width="2"
              />
            </g>
          )}
        </Show>
        <Show when={!series().length}>
          <text
            x={(FRAME.left + FRAME.right) / 2}
            y={220}
            text-anchor="middle"
            fill="#68776f"
            font-size="16"
          >
            Esperando precios…
          </text>
        </Show>
      </svg>
      <ul {...stylex.attrs(styles.legend)} aria-label="Capas de abajo hacia arriba">
        <For each={LAYERS}>
          {(layer) => (
            <li {...stylex.attrs(styles.legendItem)}>
              <svg {...stylex.attrs(styles.swatch)} viewBox="0 0 10 10" aria-hidden="true">
                <rect width="10" height="10" rx="3" fill={layer.color} />
              </svg>
              {layer.name}
            </li>
          )}
        </For>
      </ul>
      <p {...stylex.attrs(styles.note)}>
        Último año · CLP · Fechas simuladas. Antes de «Inicio», la zona tenue supone que mantuviste
        la distribución inicial.
      </p>
    </section>
  );
}

export default PortfolioChart;
