# Moka Portafolio · Solid 2 realtime demo

A small investment dashboard built with Solid 2. Prices come from a market simulation that lives on the server and is streamed to every open tab, while each browser keeps its own portfolio and can rebalance it against the live prices.

- **Shared server state.** `src/server/simulation.ts` runs one in-memory simulation for the whole process: one simulated day every 2 seconds, starting with a warm-up of three months of history. Each fund follows a geometric Brownian motion with its own drift and volatility, plus a common market shock that moves the funds together. Andes Arriesgado also has occasional jumps. `src/market/api.ts` exposes it as server functions: `livePrices` is a `broadcast()` stream, so every client sees the same tick, and `getPriceHistory` returns the last three months of prices.
- **Client state.** `src/portfolio/` holds the domain model as plain immutable TypeScript classes (`Stock`, `Cash`, `StockDiff`, `Portfolio`, `PortfolioTimeline`). Every client starts with 250.000.000 CLP split 60/30/10 across Andes Arriesgado, Manquehue Moderado and Cristóbal Conservador, at the prices of the moment the page loads.
- **Rebalancing.** `Portfolio.rebalance({ portfolio, prices, targets })` turns target percentages into a list of `StockDiff`s: what to buy or sell of each fund. Only whole shares can be traded, so the method floors each target and then greedily spends the remainder on the fund furthest below its target. Whatever cannot buy a whole share stays in cash. Sales fund the purchases, and there are no fees and no leverage. In the UI the diff list is a memo over the live prices, so it updates with every tick.
- **History.** Applying a rebalance never mutates the portfolio. It appends a new `Portfolio` to the `PortfolioTimeline`, stamped with the simulated time. The chart (`src/components/chart/`) uses that timeline to value every past day with the holdings in effect on that day. It draws one stacked layer per fund, with vertical markers for "Inicio" and each rebalance, and fades the part before page load, which shows the initial portfolio as if it had been held for the whole window. Hovering the chart shows the valuation at that day.

## Requirements

Node.js 24 or newer and pnpm 12.18.0. Enable Corepack and run `corepack prepare pnpm@12.18.0 --activate` if pnpm is not already available.

```sh
pnpm install --frozen-lockfile
pnpm dev            # development server
pnpm test           # unit tests (Vitest) for the portfolio model and chart series
pnpm check          # typecheck, lint, format check, tests and production build
pnpm build && pnpm start   # production Node server (dist/server/node.js)
```

Solid 2 is currently an RC; `solid-js`, `@solidjs/web` and diagnostics are pinned to the same release. The official Vite plugin renders with SSR, provides server functions and emits the Node server entry. The dashboard itself renders in the browser after hydration, because it consumes a continuous stream (the same approach as the client route of Solid's `server-dbmon` example). StyleX compiles the styles, the chart uses the framework-agnostic scales from `@tanstack/charts`, Oxfmt formats the code and Oxlint runs the Solid 2 rule preset.

The simulation is a single in-memory instance, so the demo expects one long-lived Node process. Running it on several instances or serverless isolates would need a shared source of prices.

References: [Solid 2 documentation](https://v2.solidjs.com/), [server-dbmon](https://github.com/solidjs/solid/tree/next/examples/server-dbmon), [StyleX Vite integration](https://stylexjs.com/docs/learn/installation/vite/).
