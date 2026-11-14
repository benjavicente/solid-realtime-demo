import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";
import stylex from "@stylexjs/unplugin";

export default defineConfig({
  resolve: {
    alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  plugins: [
    stylex.vite({ useCSSLayers: true }),
    solid({
      // Keep tracing available without loading performance tracks on every demo reload.
      performanceTracks: process.env.SOLID_PERFORMANCE_TRACKS === "1",
      start: { app: "src/app.tsx", nodeServer: true },
      ssr: true,
      serverFunctions: { components: true },
    }),
  ],
});
