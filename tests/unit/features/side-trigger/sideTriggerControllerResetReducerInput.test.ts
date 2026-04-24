import { describe, expect, it, vi } from "vitest";
import { createSideTriggerController } from "../../../../src/features/side-trigger/sideTriggerController";
import { defaultSideTriggerTuning } from "../../../../src/features/side-trigger/sideTriggerConfig";
import type * as CalibrationReducerModule from "../../../../src/features/side-trigger/sideTriggerCalibrationReducer";
import type { ResetReason } from "../../../../src/features/side-trigger/sideTriggerTelemetryTypes";
import type {
  HandLandmarkSet,
  SideHandDetection
} from "../../../../src/shared/types/hand";

const calibrationReducerInputs = vi.hoisted(() => [] as unknown[][]);

vi.mock(
  "../../../../src/features/side-trigger/sideTriggerCalibrationReducer",
  async (importOriginal) => {
    const actual = await importOriginal<typeof CalibrationReducerModule>();

    return {
      ...actual,
      updateCalibrationReducer: vi.fn(
        (...args: Parameters<typeof actual.updateCalibrationReducer>) => {
          calibrationReducerInputs.push([args[1]]);
          return actual.updateCalibrationReducer(...args);
        }
      )
    };
  }
);

const makeDetection = (
  timestampMs: number,
  thumbDistance: number,
  options: {
    readonly streamId?: string;
    readonly geometryScale?: number;
  } = {}
): SideHandDetection => {
  const geometryScale = options.geometryScale ?? 1;
  const wrist = { x: 0, y: 0, z: 0 };
  const thumbTip = { x: thumbDistance * geometryScale, y: 0, z: 0 };
  const indexMcp = { x: geometryScale, y: 0, z: 0 };
  const middleMcp = { x: 0, y: 0, z: 0 };
  const pinkyMcp = { x: 0, y: geometryScale * 0.3, z: 0 };
  const landmarks: HandLandmarkSet = {
    wrist,
    thumbIp: thumbTip,
    thumbTip,
    indexMcp,
    indexTip: indexMcp,
    middleMcp,
    middleTip: middleMcp,
    ringTip: middleMcp,
    pinkyMcp,
    pinkyTip: pinkyMcp
  };
  return {
    laneRole: "sideTrigger",
    deviceId: "dev",
    streamId: options.streamId ?? "stream",
    timestamp: {
      frameTimestampMs: timestampMs,
      timestampSource: "performanceNowAtCallback",
      presentedFrames: undefined,
      receivedAtPerformanceMs: timestampMs
    },
    handPresenceConfidence: 0.9,
    sideViewQuality: "good",
    rawFrame: {
      width: 640,
      height: 480,
      landmarks,
      worldLandmarks: landmarks
    },
    filteredFrame: {
      width: 640,
      height: 480,
      landmarks
    }
  };
};

const update = (
  controller: ReturnType<typeof createSideTriggerController>,
  detection: SideHandDetection,
  sliderInDefaultRange: boolean
) =>
  controller.update({
    detection,
    tuning: defaultSideTriggerTuning,
    sliderInDefaultRange
  });

describe("sideTriggerController reset reducer input", () => {
  it.each<{
    readonly name: string;
    readonly resetReason: ResetReason;
    readonly prime: SideHandDetection;
    readonly reset: SideHandDetection;
  }>([
    {
      name: "geometryJump",
      resetReason: "geometryJump",
      prime: makeDetection(0, 1.2),
      reset: makeDetection(16, 1.2, { geometryScale: 2 })
    },
    {
      name: "sourceChanged",
      resetReason: "sourceChanged",
      prime: makeDetection(0, 1.2, { streamId: "stream-a" }),
      reset: makeDetection(16, 1.2, { streamId: "stream-b" })
    }
  ])(
    "passes real $name reset reason and slider state to the calibration reducer",
    ({ prime, reset, resetReason }) => {
      calibrationReducerInputs.length = 0;
      const controller = createSideTriggerController();
      update(controller, prime, true);

      const out = update(controller, reset, false);
      const resetInputs = calibrationReducerInputs
        .map(([input]) => input)
        .filter(
          (input): input is {
            readonly resetSignal: ResetReason;
            readonly sliderInDefaultRange: boolean;
          } =>
            typeof input === "object" &&
            input !== null &&
            "resetSignal" in input
        );

      expect(out.controllerTelemetry.resetReason).toBe(resetReason);
      expect(resetInputs.at(-1)).toMatchObject({
        resetSignal: resetReason,
        sliderInDefaultRange: false
      });
    }
  );
});
