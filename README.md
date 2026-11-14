# Solid Realtime Demo

A starting point for an interactive, server-driven market simulation. This repository currently contains the application setup; the simulation is still to be implemented.

## Requirements

Node.js 24 or newer and pnpm 12.18.0. Enable Corepack and run `corepack prepare pnpm@12.18.0 --activate` if pnpm is not already available.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm start # preview the Worker after pnpm build
pnpm deploy # build and deploy with cf; requires Cloudflare authentication
```

Solid 2 is currently an RC; `solid-js`, `@solidjs/web`, and diagnostics are pinned to the same release. The official Vite plugin uses SSR and enables server components. StyleX compiles styles through its Vite plugin; Oxfmt formats the project, and Oxlint runs the Solid 2 rule preset through its JavaScript plugin support. `pnpm check` runs type checking, lint, format checking, and production build.

The Cloudflare Vite plugin v2 and `cf` CLI are beta software. `cloudflare.config.ts` configures the Worker, while `src/worker.ts` forwards requests to Solid’s streaming SSR handler. Vite development and preview run in the Workers runtime. Static assets are served by Cloudflare.

The Solid packages include version-matched agent skills and a cheatsheet; see `AGENTS.md`. The intended architecture is a shared server-side price simulation and per-browser interactive state. The `server-dbmon` example on the `next` branch of the Solid repository demonstrates shared live rendering, streaming and cleanup when viewers disconnect. A production deployment must support long-lived streaming responses and ensure disconnects propagate to the server; Worker memory is not shared across isolates or locations and cannot provide a single global simulation; a shared service such as a Durable Object will be needed for that behavior.

References: [Solid 2 documentation](https://v2.solidjs.com/), [Solid 2 RC](https://www.solidjs.com/blog/solid-2-0-rc-the-big-reveal), [StyleX Vite integration](https://stylexjs.com/docs/learn/installation/vite/), [server-dbmon](https://github.com/solidjs/solid/tree/next/examples/server-dbmon).
