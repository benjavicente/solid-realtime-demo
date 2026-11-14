import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import solid from "@solidjs/vite-plugin";
import stylex from "@stylexjs/unplugin";

export default defineConfig({
  plugins: [
    cloudflare(),
    stylex.vite({ useCSSLayers: true }),
    solid({ start: true, ssr: true, serverFunctions: { components: true } }),
  ],
});
