import { describe, expect, it } from "vitest";
import type { FusedGameInputFrame } from "../../../../src/shared/types/fusion";
import {
  createFusedGameInputAdapter,
  readFusedGameInput
} from "../../../../src/features/gameplay/domain/fusedGameInput";
import {
  createAimFrame,
  createTriggerFrame
} from "../input-fusion/testFactory";

const createFusedFrame = (
  patch: Partial<FusedGameInputFrame> = {}
): FusedGameInputFrame => ({
  fusionTimestampMs: 120,
  fusionMode: "pairedFrontAndSide",
  timeDeltaBetweenLanesMs: 8,
  aim: createAimFrame(112),
  trigger: createTriggerFrame(120, {
    triggerEdge: "shotCommitted",
    triggerPulled: true
  }),
  shotFired: true,
  inputConfidence: 0.9,
  frontSource: {
    laneRole: "frontAim",
    frameTimestamp: createAimFrame(112).timestamp,
    frameAgeMs: 8,
    laneHealth: "tracking",
    availability: "available",
    rejectReason: "none"
  },
  sideSource: {
    laneRole: "sideTrigger",
    frameTimestamp: createTriggerFrame(120).timestamp,
    frameAgeMs: 0,
    laneHealth: "tracking",
    availability: "available",
    rejectReason: "none"
  },
  fusionRejectReason: "none",
  ...patch
});

describe("fusedGameInput", () => {
  it("turns one paired shotFired frame into exactly one shot action", () => {
    const adapter = createFusedGameInputAdapter();
    const frame = createFusedFrame();

    expect(readFusedGameInput(adapter, frame).shot).toEqual({
      x: 320,
      y: 180
    });
    expect(readFusedGameInput(adapter, frame).shot).toBeUndefined();
  });

  it("allows front-only aim movement but never fires", () => {
    const adapter = createFusedGameInputAdapter();
    const result = readFusedGameInput(
      adapter,
      createFusedFrame({
        fusionMode: "frontOnlyAim",
        trigger: undefined,
        shotFired: true
      })
    );

    expect(result.crosshair).toEqual({ x: 320, y: 180 });
    expect(result.shot).toBeUndefined();
  });

  it("ignores side-only trigger diagnostic frames for gameplay shots", () => {
    const adapter = createFusedGameInputAdapter();
    const result = readFusedGameInput(
      adapter,
      createFusedFrame({
        fusionMode: "sideOnlyTriggerDiagnostic",
        aim: undefined,
        shotFired: true
      })
    );

    expect(result.crosshair).toBeUndefined();
    expect(result.shot).toBeUndefined();
  });

  it("hides crosshair when aim is unavailable", () => {
    const adapter = createFusedGameInputAdapter();
    const result = readFusedGameInput(
      adapter,
      createFusedFrame({
        aim: createAimFrame(112, { aimAvailability: "unavailable" }),
        shotFired: false
      })
    );

    expect(result.crosshair).toBeUndefined();
    expect(result.shot).toBeUndefined();
  });

  it("preserves explicit degraded status without diagnostic labels", () => {
    const adapter = createFusedGameInputAdapter();
    const result = readFusedGameInput(
      adapter,
      createFusedFrame({
        fusionMode: "noUsableInput",
        aim: undefined,
        trigger: undefined,
        shotFired: false,
        fusionRejectReason: "laneFailed"
      })
    );

    expect(result.status).toEqual({
      kind: "inputPreparing",
      reason: "laneFailed"
    });
  });
});
