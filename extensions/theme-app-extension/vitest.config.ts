import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Prefer .ts sources over compiled .js so vitest doesn't pick up
    // the tsup-compiled IIFE widget.js instead of widget.ts when running tests.
    extensions: [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs", ".json"],
  },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["assets/**/*.test.ts"],
  },
});
