import { describe, expect, it } from "vitest";
import type { ConditionedTriggerState } from "../../../../src/features/input-mapping/conditionTriggerSignal";
import {
  advanceShotIntentState,
  type ShotIntentInput,
  type ShotIntentResult,
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

const runSequence = (
  steps: Partial<ShotIntentInput>[],
  tuning?: Parameters<typeof advanceShotIntentState>[2]
): ShotIntentResult[] => {
  const results: ShotIntentResult[] = [];
  let state: ShotIntentState | undefined;

  for (const step of steps) {
    const result = advanceShotIntentState(state, createInput(step), tuning);
    results.push(result);
    state = result.state;
  }

  return results;
};

describe("ShotIntentStateMachine", () => {
  it("stays idle until fire eligibility is true, then arms", () => {
    const [first, second] = runSequence([
      { fireEligible: false },
      { fireEligible: true }
    ]);

    expect(first?.state.phase).toBe("idle");
    expect(first?.state.rejectReason).toBe("waiting_for_fire_eligibility");
    expect(second?.state.phase).toBe("armed");
    expect(second?.state.rejectReason).toBe("waiting_for_pull_edge");
  });

  it("commits exactly once on a pull edge and enters cooldown", () => {
    const [first, second, third] = runSequence([
      { conditionedTrigger: createConditioned() },
      {
        conditionedTrigger: createConditioned({
          edge: "pull",
          latched: true,
          scalar: 1,
          releaseReady: false
        }),
        rawTriggerState: "pulled"
      },
      {
        conditionedTrigger: createConditioned({
          edge: "none",
          latched: true,
          scalar: 1,
          releaseReady: false
        }),
        rawTriggerState: "pulled"
      }
    ]);

    expect(first?.state.phase).toBe("armed");
    expect(first?.shotFired).toBe(false);
    expect(second?.shotFired).toBe(true);
    expect(second?.state.phase).toBe("cooldown");
    expect(third?.shotFired).toBe(false);
    expect(third?.state.phase).toBe("cooldown");
  });

  it("blocks an immediate refire until release and cooldown both clear", () => {
    const results = runSequence(
      [
        { conditionedTrigger: createConditioned() },
        {
          conditionedTrigger: createConditioned({
            edge: "pull",
            latched: true,
            scalar: 1,
            releaseReady: false
          }),
          rawTriggerState: "pulled"
        },
        {
          conditionedTrigger: createConditioned({
            edge: "pull",
            latched: true,
            scalar: 1,
            releaseReady: false
          }),
          rawTriggerState: "pulled"
        },
        {
          conditionedTrigger: createConditioned({ edge: "release", latched: false, scalar: 0 }),
          rawTriggerState: "open"
        },
        {
          conditionedTrigger: createConditioned({ edge: "pull", latched: true, scalar: 1 }),
          rawTriggerState: "pulled"
        }
      ],
      { fireCooldownFrames: 2 }
    );

    expect(results.filter((result) => result.shotFired)).toHaveLength(1);
    expect(results[2]?.state.rejectReason).toBe("cooldown");
    expect(results[4]?.shotFired).toBe(false);
  });

  it("enters tracking_lost immediately and rearms only after tracking returns", () => {
    const [first, second, third, fourth] = runSequence([
      { fireEligible: true },
      { trackingPresent: false, fireEligible: false },
      { trackingPresent: true, fireEligible: false },
      { trackingPresent: true, fireEligible: true }
    ]);

    expect(first?.state.phase).toBe("armed");
    expect(second?.state.phase).toBe("tracking_lost");
    expect(second?.state.rejectReason).toBe("tracking_lost");
    expect(third?.state.phase).toBe("idle");
    expect(fourth?.state.phase).toBe("armed");
  });
});
