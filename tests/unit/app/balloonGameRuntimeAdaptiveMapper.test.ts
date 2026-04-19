import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("balloonGameRuntime side-trigger mapper wiring", () => {
  it("uses the adaptive side-trigger wrapper in the game runtime", () => {
    const source = readFileSync("src/app/balloonGameRuntime.ts", "utf8");

    expect(source).toContain("createAdaptiveSideTriggerMapper");
    expect(source).not.toContain("createSideTriggerMapper()");
  });
});
