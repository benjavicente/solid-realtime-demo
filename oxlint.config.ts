import { defineConfig } from "oxlint";
import solid from "eslint-plugin-solid/configs/v2";

export default defineConfig({
  ignorePatterns: ["dist/**", "references/**"],
  plugins: ["typescript"],
  jsPlugins: ["eslint-plugin-solid"],
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx"],
      rules: solid.rules,
    },
  ],
});
