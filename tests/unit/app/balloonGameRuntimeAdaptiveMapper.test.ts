import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("balloonGameRuntime side-trigger mapper wiring", () => {
  it("uses the r9 cycle-driven side-trigger mapper in the game runtime", () => {
    const source = readFileSync("src/app/balloonGameRuntime.ts", "utf8");

    expect(source).toContain("createCycleDrivenSideTriggerMapper");
    expect(source).not.toContain("createSideTriggerMapper()");
  });
});
