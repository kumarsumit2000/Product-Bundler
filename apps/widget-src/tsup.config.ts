import { defineConfig } from "tsup";

export default defineConfig({
  entry: { widget: "src/widget.ts" },
  outDir: "../../extensions/theme-app-extension/assets",
  format: ["iife"],
  globalName: "Pumper",
  minify: true,
  treeshake: true,
  sourcemap: false,
  clean: false,
  target: "es2018",
  // Output: assets/widget.global.js — tsup names IIFE outputs `<entry>.global.js`.
  // The .liquid blocks reference `widget.js`, so we rename via outExtension below.
  outExtension({ format }) {
    return { js: format === "iife" ? ".js" : ".js" };
  },
});
