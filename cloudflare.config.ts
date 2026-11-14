import { defineConfig } from "cf/config";
import * as entrypoint from "./src/worker.ts" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "solid-realtime-demo",
    entrypoint,
    compatibilityDate: "2026-11-14",
    compatibilityFlags: ["nodejs_compat"],
  },
});
