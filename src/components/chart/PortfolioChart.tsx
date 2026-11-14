import * as stylex from "@stylexjs/stylex";
import { createChartSpring } from "@tanstack/charts/spring";
import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  Show,
  untrack,
} from "solid-js";
import { HISTORY_WINDOW_MS, REAL_MS_PER_TICK } from "../../market/funds";
import type { MarketEvent, PriceTick } from "../../market/types";
import type { PortfolioTimeline } from "../../portfolio";
import { EVENT_COPY } from "../../market/events";
import { buildGeometry, FRAME, niceYMax } from "./geometry";
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
  note: { margin: "10px 0 0", fontSize: 12, color: "#68776f", lineHeight: 1.5 },
});

/** A rolling simulated year of holdings valued using their historical allocation. */
export function PortfolioChart(props: PortfolioChartProps) {
  const id = createUniqueId();
  const series = createMemo(() => buildSeries(props.ticks, props.timeline));
  // Distinct market events present in the price history (one per start time).
  const events = createMemo(() => {
    const byStart = new Map<string, MarketEvent>();
    for (const tick of props.ticks)
      for (const event of tick.events ?? []) byStart.set(`${event.kind}-${event.startedAt}`, event);
    return [...byStart.values()];
  });

  // Smooth updates. The value axis eases to its new top with TanStack's
  // framework-agnostic spring, and each new tick slides the plot left by one day
  // over the tick interval, so data streams in from the right instead of jumping.
  const targetYMax = createMemo(() => niceYMax(series()));
  const [yMax, setYMax] = createSignal<number | undefined>(undefined);
  const spring = createChartSpring({ stiffness: 120, damping: 22 });
  let springFrame = 0;
  createEffect(
    () => targetYMax(),
    (to) => {
      cancelAnimationFrame(springFrame);
      // Start from the value on screen; reading it must not re-run this effect.
      const from = untrack(yMax);
      if (from === undefined || reducedMotion()) {
        springFrame = requestAnimationFrame(() => setYMax(to));
        return;
      }
      const started = performance.now();
      const step = (now: number) => {
        const sample = spring.sample(now - started, { from, to });
        setYMax(sample.value);
        if (!sample.done) springFrame = requestAnimationFrame(step);
      };
      springFrame = requestAnimationFrame(step);
      return () => cancelAnimationFrame(springFrame);
    },
  );
  const geometry = createMemo(() =>
    buildGeometry(series(), props.timeline, events(), yMax() ?? targetYMax()),
  );

  let slide: SVGGElement | undefined;
  createEffect(
    () => props.ticks[props.ticks.length - 1]?.t,
    (t, previous) => {
      if (!slide || t === undefined || previous === undefined || t <= previous) return;
      // After a long pause (e.g. a background tab) just jump to the new state.
      if (t - previous > 3 * DAY || reducedMotion()) return;
      const dx = ((t - previous) / HISTORY_WINDOW_MS) * (FRAME.right - FRAME.left);
      slide.animate([{ transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }], {
        duration: REAL_MS_PER_TICK,
        easing: "linear",
      });
    },
  );
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
        <title id={`${id}-title`}>Valor del portafolio durante los últimos 3 meses</title>
        <desc id={`${id}-description`}>
          Áreas apiladas por fondo y caja, de abajo hacia arriba en el orden de la lista de stocks.
          La zona tenue anterior al inicio muestra una simulación de la distribución inicial.
        </desc>
        <defs>
          <clipPath id={`${id}-past`}>
            <rect x={0} y={FRAME.top} width={geometry().split} height={FRAME.bottom - FRAME.top} />
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
        </g>
        <clipPath id={`${id}-plot`}>
          <rect x={FRAME.left} y={0} width={FRAME.right - FRAME.left} height={FRAME.height} />
        </clipPath>
        <g clip-path={`url(#${id}-plot)`}>
          <g ref={(el: SVGGElement) => (slide = el)}>
            <g font-size="12" fill="#68776f">
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
                    {(layer) => (
                      <path
                        d={layer().path}
                        fill={layer().color}
                        stroke="#fff"
                        stroke-width="1.5"
                        stroke-linejoin="round"
                      />
                    )}
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
            <For each={geometry().bands} keyed={false}>
              {(band) => (
                <g pointer-events="none">
                  <title>{EVENT_COPY[band().kind].title}</title>
                  <rect
                    x={band().x}
                    y={FRAME.top}
                    width={band().width}
                    height={FRAME.bottom - FRAME.top}
                    fill="#1f4a3b"
                    fill-opacity="0.08"
                  />
                  <text x={band().x + 4} y={FRAME.top + 14} fill="#1f4a3b" font-size="11">
                    {EVENT_COPY[band().kind].icon}
                  </text>
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
          </g>
        </g>
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
      <p {...stylex.attrs(styles.note)}>
        Antes de «Inicio», la zona tenue supone que mantuviste la distribución inicial.
      </p>
    </section>
  );
}

export default PortfolioChart;

const DAY = 24 * 60 * 60 * 1000;

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
