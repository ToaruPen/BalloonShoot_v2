import { defineConfig } from "vitest/config";

// Dedicated config for the benchmark replays. Invoke with:
//   npm run test:replay
// Fixtures live under tests/fixtures/videos/*.landmarks.json and are
// regenerated via scripts/bench/extract.mjs (see tests/fixtures/videos/README.md).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/bench/**/*.bench.test.ts"],
    testTimeout: 60_000
  }
});
