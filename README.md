# Moka Portafolio · Solid 2 realtime demo

A portfolio dashboard built with Solid 2: fund prices are simulated on the server and streamed live to every open tab, while each browser keeps its own portfolio and can rebalance it.

Requires Node.js 24+ and pnpm.

```sh
pnpm install
pnpm build
pnpm start   # preview the production build
```

Easter eggs: the market has hidden events based on real news. Type the secret word anywhere on the page (see `src/market/events.ts`), or call `moka.send("<event>")` from the browser console.
