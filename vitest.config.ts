import "dotenv/config";
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    globals: true,
    testTimeout: 10_000,
    /** Hooks de setup (p. ej. beforeAll con BD + consumer) pueden superar 10s en integración. */
    hookTimeout: 120_000,
    setupFiles: ["./vitest.setup.ts"],
    environment: "node",
  },
});
