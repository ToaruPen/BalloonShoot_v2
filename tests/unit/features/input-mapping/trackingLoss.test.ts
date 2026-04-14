import { describe, expect, it } from "vitest";
import type { ConditionedTriggerState } from "../../../../src/features/input-mapping/conditionTriggerSignal";
import { asDetection, createThumbTriggerFrame, withThumbTriggerPose } from "./thumbTriggerTestHelper";
import { gameConfig } from "../../../../src/shared/config/gameConfig";
import { mapHandToGameInput, type GameInputFrame } from "../../../../src/features/input-mapping/mapHandToGameInput";
import {
  advanceShotIntentState,
  type ShotIntentInput,
  type ShotIntentState
} from "../../../../src/features/input-mapping/shotIntentStateMachine";
const createConditioned = (
  overrides: Partial<ConditionedTriggerState> = {}
): ConditionedTriggerState => ({
  scalar: 0,
  latched: false,
  edge: "none",
  releaseReady: true,
  ...overrides
});

const createInput = (overrides: Partial<ShotIntentInput> = {}): ShotIntentInput => ({
  trackingPresent: true,
  fireEligible: true,
  conditionedTrigger: createConditioned(),
  triggerConfidence: 1,
  gunPoseConfidence: 0.6,
  rawTriggerState: "open",
  ...overrides
});

const runSequence = (steps: Partial<ShotIntentInput>[]): ReturnType<typeof advanceShotIntentState>[] => {
  const results: ReturnType<typeof advanceShotIntentState>[] = [];
  let state: ShotIntentState | undefined;

  for (const step of steps) {
    const result = advanceShotIntentState(state, createInput(step));
    results.push(result);
    state = result.state;
  }

  return results;
};

const canvasSize = { width: 1280, height: 720 };

const createArmedRuntime = (): GameInputFrame["runtime"] => {
  const openDetection = asDetection(
    withThumbTriggerPose(createThumbTriggerFrame("open"), "open")
  );
  const first = mapHandToGameInput(openDetection, canvasSize, undefined, gameConfig.input);
  const second = mapHandToGameInput(openDetection, canvasSize, first.runtime, gameConfig.input);
  const third = mapHandToGameInput(openDetection, canvasSize, second.runtime, gameConfig.input);

  return third.runtime;
};

describe("tracking loss", () => {
  it("drops armed intent on tracking loss and requires a fresh open cycle after recovery", () => {
    const [first, second, third, fourth, fifth] = runSequence([
      { fireEligible: true },
      { trackingPresent: false, fireEligible: false },
      { trackingPresent: true, fireEligible: false },
      { trackingPresent: true, fireEligible: true },
      {
        conditionedTrigger: createConditioned({
          edge: "pull",
          latched: true,
          scalar: 1,
          releaseReady: false
        }),
        rawTriggerState: "pulled"
      }
    ]);

    expect(first?.state.phase).toBe("armed");
    expect(second?.state.phase).toBe("tracking_lost");
    expect(fourth?.shotFired).toBe(false);
    expect(third?.state.phase).toBe("idle");
    expect(fourth?.state.phase).toBe("armed");
    expect(fifth?.state.phase).toBe("cooldown");
    expect(fifth?.shotFired).toBe(true);
  });

  it("turns missing tracking into tracking_lost and clears the crosshair", () => {
    const result = mapHandToGameInput(undefined, canvasSize, createArmedRuntime());

    expect(result.runtime.phase).toBe("tracking_lost");
    expect(result.runtime.rejectReason).toBe("tracking_lost");
    expect(result.shotFired).toBe(false);
    expect(result.crosshair).toBeUndefined();
    expect(result.runtime.crosshair).toBeUndefined();
  });
});
