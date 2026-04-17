import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/replay/**/*.test.ts"],
    testTimeout: 5_000
  }
});
