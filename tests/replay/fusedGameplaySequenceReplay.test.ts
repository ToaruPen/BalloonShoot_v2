import { describe, expect, it } from "vitest";
import {
  createGameEngine,
  registerShot
} from "../../src/features/gameplay/domain/createGameEngine";
import {
  createFusedGameInputAdapter,
  readFusedGameInput
} from "../../src/features/gameplay/domain/fusedGameInput";
import type { FusedGameInputFrame } from "../../src/shared/types/fusion";
import {
  createAimFrame,
  createTriggerFrame
} from "../unit/features/input-fusion/testFactory";

const createFusedFrame = (
  patch: Partial<FusedGameInputFrame> = {}
): FusedGameInputFrame => ({
  fusionTimestampMs: 10,
  fusionMode: "frontOnlyAim",
  timeDeltaBetweenLanesMs: undefined,
  aim: createAimFrame(10, {
    aimPointViewport: { x: 120, y: 120 },
    aimPointNormalized: { x: 0.25, y: 0.25 }
  }),
  trigger: undefined,
  shotFired: false,
  inputConfidence: 0.8,
  frontSource: {
    laneRole: "frontAim",
    frameTimestamp: createAimFrame(10).timestamp,
    frameAgeMs: 0,
    laneHealth: "tracking",
    availability: "available",
    rejectReason: "none"
  },
  sideSource: {
    laneRole: "sideTrigger",
    frameTimestamp: undefined,
    frameAgeMs: undefined,
    laneHealth: "notStarted",
    availability: "unavailable",
    rejectReason: "sideMissing"
  },
  fusionRejectReason: "sideMissing",
  ...patch
});

describe("fused gameplay sequence replay", () => {
  it("replays fused input through score, combo, and shot consumption", () => {
    const engine = createGameEngine({ width: 320, height: 240 });
    const adapter = createFusedGameInputAdapter();
    engine.forceBalloons([
      {
        id: "hit-target",
        x: 120,
        y: 120,
        radius: 32,
        vy: 0,
        size: "normal",
        alive: true
      }
    ]);

    const shotFrame = createFusedFrame({
      fusionTimestampMs: 20,
      fusionMode: "pairedFrontAndSide",
      timeDeltaBetweenLanesMs: 0,
      trigger: createTriggerFrame(20, {
        triggerEdge: "shotCommitted",
        triggerPulled: true
      }),
      sideSource: {
        laneRole: "sideTrigger",
        frameTimestamp: createTriggerFrame(20).timestamp,
        frameAgeMs: 0,
        laneHealth: "tracking",
        availability: "available",
        rejectReason: "none"
      },
      fusionRejectReason: "none",
      shotFired: true
    });
    const sequence = [
      createFusedFrame(),
      shotFrame,
      shotFrame,
      createFusedFrame({
        fusionTimestampMs: 30,
        fusionMode: "sideOnlyTriggerDiagnostic",
        aim: undefined,
        trigger: createTriggerFrame(30, {
          triggerEdge: "shotCommitted",
          triggerPulled: true
        }),
        shotFired: true
      }),
      createFusedFrame({
        fusionTimestampMs: 40,
        fusionMode: "noUsableInput",
        aim: undefined,
        trigger: undefined,
        shotFired: false,
        fusionRejectReason: "frontMissing"
      }),
      createFusedFrame({
        fusionTimestampMs: 50,
        fusionMode: "pairedFrontAndSide",
        aim: createAimFrame(50, {
          aimPointViewport: { x: 300, y: 200 },
          aimPointNormalized: { x: 0.9, y: 0.8 }
        }),
        trigger: createTriggerFrame(50, {
          triggerEdge: "shotCommitted",
          triggerPulled: true
        }),
        sideSource: {
          laneRole: "sideTrigger",
          frameTimestamp: createTriggerFrame(50).timestamp,
          frameAgeMs: 0,
          laneHealth: "tracking",
          availability: "available",
          rejectReason: "none"
        },
        fusionRejectReason: "none",
        shotFired: true
      })
    ];

    const outcomes = sequence.map((frame) => {
      const input = readFusedGameInput(adapter, frame);

      return input.shot === undefined ? "no-shot" : registerShot(engine, input.shot).kind;
    });

    expect(outcomes).toEqual([
      "no-shot",
      "hit",
      "no-shot",
      "no-shot",
      "no-shot",
      "miss"
    ]);
    expect(engine.score).toBe(1);
    expect(engine.combo).toBe(0);
    expect(engine.multiplier).toBe(1);
    expect(engine.balloons).toEqual([
      {
        id: "hit-target",
        x: 120,
        y: 120,
        radius: 32,
        vy: 0,
        size: "normal",
        alive: false
      }
    ]);
  });
});
