import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // Benchmark replays are opt-in via `pnpm vitest run tests/bench` — heavy
    // fixture JSON and gitignored, not meant to run in the normal suite.
    testTimeout: 20_000
  }
});
