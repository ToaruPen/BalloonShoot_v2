import { describe, expect, it } from "vitest";
import { createSideTriggerController } from "../../../../src/features/side-trigger/sideTriggerController";
import { defaultSideTriggerTuning } from "../../../../src/features/side-trigger/sideTriggerConfig";
import type {
  HandLandmarkSet,
  SideHandDetection
} from "../../../../src/shared/types/hand";

const makeDetection = (
  timestampMs: number,
  thumbDistance: number
): SideHandDetection => {
  const wrist = { x: 0, y: 0, z: 0 };
  const thumbTip = { x: thumbDistance, y: 0, z: 0 };
  const indexMcp = { x: 1, y: 0, z: 0 };
  const middleMcp = { x: 1, y: 0.1, z: 0 };
  const pinkyMcp = { x: 1, y: 0.3, z: 0 };
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
    streamId: "stream",
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

describe("sideTriggerController armed gate", () => {
  it("initial frame では armed=false、triggerEdge='none'", () => {
    const controller = createSideTriggerController();
    const out = controller.update({
      detection: makeDetection(0, 1.0),
      tuning: defaultSideTriggerTuning,
      sliderInDefaultRange: true
    });
    expect(out.controllerTelemetry.controllerArmed).toBe(false);
    expect(out.controllerTelemetry.triggerEdge).toBe("none");
  });

  it("resetSignal=manualOverrideEntered frame では calibrationStatus=manualOverride、triggerEdge='none'", () => {
    const controller = createSideTriggerController();
    // prime some frames to establish state
    for (let i = 0; i < 5; i++) {
      controller.update({
        detection: makeDetection(i * 10, 1.0),
        tuning: defaultSideTriggerTuning,
        sliderInDefaultRange: true
      });
    }
    const out = controller.update({
      detection: makeDetection(60, 1.0),
      tuning: defaultSideTriggerTuning,
      sliderInDefaultRange: false
    });
    expect(out.controllerTelemetry.resetReason).toBe("manualOverrideEntered");
    expect(out.controllerTelemetry.calibrationStatus).toBe("manualOverride");
    expect(out.controllerTelemetry.triggerEdge).toBe("none");
  });
});
