import { describe, expect, it } from "vitest";
import { getFrontAimFilterConfig } from "../../../../src/features/front-aim";
import { getSideTriggerFilterConfig } from "../../../../src/features/side-trigger";
import { gameConfig } from "../../../../src/shared/config/gameConfig";

describe("side trigger filter config", () => {
  it("exposes a side-owned neutral hand filter config", () => {
    expect(getSideTriggerFilterConfig()).toEqual({
      minCutoff: gameConfig.input.handFilterMinCutoff,
      beta: gameConfig.input.handFilterBeta,
      dCutoff: gameConfig.input.handFilterDCutoff
    });
    expect(getSideTriggerFilterConfig).not.toBe(getFrontAimFilterConfig);
  });
});
