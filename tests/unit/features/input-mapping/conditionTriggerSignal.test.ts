import { describe, expect, it } from "vitest";
import {
  createInitialConditionedTriggerState,
  updateConditionedTriggerSignal
} from "../../../../src/features/input-mapping/conditionTriggerSignal";

describe("conditionTriggerSignal", () => {
  it("emits a pull edge only once for a sustained pull", () => {
    let state = createInitialConditionedTriggerState();

    state = updateConditionedTriggerSignal(state, {
      rawState: "open",
      rawCosine: -0.4,
      pullFloor: -0.12,
      releaseFloor: -0.28
    });
    state = updateConditionedTriggerSignal(state, {
      rawState: "pulled",
      rawCosine: -0.18,
      pullFloor: -0.12,
      releaseFloor: -0.28
    });
    const committed = updateConditionedTriggerSignal(state, {
      rawState: "pulled",
      rawCosine: -0.08,
      pullFloor: -0.12,
      releaseFloor: -0.28
    });

    expect(committed.edge).toBe("pull");
    expect(committed.latched).toBe(true);
    expect(committed.scalar).toBeGreaterThan(0.9);

    const held = updateConditionedTriggerSignal(committed, {
      rawState: "pulled",
      rawCosine: -0.03,
      pullFloor: -0.12,
      releaseFloor: -0.28
    });

    expect(held.edge).toBe("none");
    expect(held.latched).toBe(true);
  });

  it("requires a release before a second pull edge can commit", () => {
    let state = createInitialConditionedTriggerState();

    state = updateConditionedTriggerSignal(state, {
      rawState: "pulled",
      rawCosine: -0.05,
      pullFloor: -0.12,
      releaseFloor: -0.28
    });
    expect(state.edge).toBe("pull");

    state = updateConditionedTriggerSignal(state, {
      rawState: "pulled",
      rawCosine: -0.02,
      pullFloor: -0.12,
      releaseFloor: -0.28
    });
    expect(state.edge).toBe("none");

    state = updateConditionedTriggerSignal(state, {
      rawState: "open",
      rawCosine: -0.4,
      pullFloor: -0.12,
      releaseFloor: -0.28
    });
    expect(state.edge).toBe("release");
    expect(state.latched).toBe(false);

    state = updateConditionedTriggerSignal(state, {
      rawState: "pulled",
      rawCosine: -0.04,
      pullFloor: -0.12,
      releaseFloor: -0.28
    });
    expect(state.edge).toBe("pull");
  });

  it("accepts a near-pull scalar when raw trigger state already crossed the pull threshold", () => {
    const state = updateConditionedTriggerSignal(createInitialConditionedTriggerState(), {
      rawState: "pulled",
      rawCosine: -0.13,
      pullFloor: -0.12,
      releaseFloor: -0.28
    });

    expect(state.scalar).toBeGreaterThanOrEqual(0.9);
    expect(state.scalar).toBeLessThan(1);
    expect(state.edge).toBe("pull");
    expect(state.latched).toBe(true);
  });
});
