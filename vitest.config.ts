import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests cover plain TypeScript (portfolio model, chart series), so they
// run without the Solid/StyleX Vite plugins and their dev servers.
export default defineConfig({
  resolve: {
    alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
