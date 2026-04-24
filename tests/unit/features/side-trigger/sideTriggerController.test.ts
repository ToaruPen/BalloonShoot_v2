import { describe, expect, it } from "vitest";
import { createSideTriggerController } from "../../../../src/features/side-trigger/sideTriggerController";
import { defaultSideTriggerTuning } from "../../../../src/features/side-trigger/sideTriggerConfig";
import type {
  HandLandmarkSet,
  SideHandDetection,
  SideViewQuality
} from "../../../../src/shared/types/hand";

const makeDetection = (
  timestampMs: number,
  thumbDistance: number,
  options: {
    readonly streamId?: string;
    readonly geometryScale?: number;
    readonly sideViewQuality?: SideViewQuality;
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
    sideViewQuality: options.sideViewQuality ?? "good",
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

const timestamp = (frameTimestampMs: number) => ({
  frameTimestampMs,
  timestampSource: "performanceNowAtCallback" as const,
  presentedFrames: undefined,
  receivedAtPerformanceMs: frameTimestampMs
});

const update = (
  controller: ReturnType<typeof createSideTriggerController>,
  timestampMs: number,
  thumbDistance: number,
  options?: Parameters<typeof makeDetection>[2]
) =>
  controller.update({
    detection: makeDetection(timestampMs, thumbDistance, options),
    tuning: defaultSideTriggerTuning,
    sliderInDefaultRange: true
  });

const acceptCycleWithFinalPull = (
  controller: ReturnType<typeof createSideTriggerController>
) => {
  for (let i = 0; i < 15; i++) {
    update(controller, i * 30, 1.2);
  }
  update(controller, 450, 0.2);
  update(controller, 470, 0.2);
  update(controller, 510, 0.2);
  update(controller, 550, 0.6);
  update(controller, 590, 1.1);
  update(controller, 630, 1.2);
  update(controller, 670, 1.2);
  update(controller, 710, 1.2);
  update(controller, 750, 0.2);
  return update(controller, 795, 0.2);
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

  it("armed=false: detection drives dwell counter but triggerEdge stays 'none'", () => {
    const controller = createSideTriggerController();

    update(controller, 0, 1.2);
    update(controller, 16, 1.2);
    update(controller, 32, 0.2);
    const out = update(controller, 48, 0.2);

    expect(out.controllerTelemetry.controllerArmed).toBe(false);
    expect(out.controllerTelemetry.triggerEdge).toBe("none");
    expect(out.triggerFrame?.triggerEdge).toBe("none");
    expect(out.controllerTelemetry.fsmPhase).toBe("SideTriggerPullCandidate");
    expect(out.controllerTelemetry.dwellFrameCounts.pullDwellFrames).toBe(2);
  });

  it("initial armed=false; after first accepted cycle telemetry shows controllerArmed=true", () => {
    const controller = createSideTriggerController();

    const out = acceptCycleWithFinalPull(controller);

    expect(out.controllerTelemetry.controllerArmed).toBe(true);
    expect(out.controllerTelemetry.justArmed).toBe(true);
    expect(out.cycleEvent?.kind).toBe("accepted");
  });

  it("justArmed frame masks detection and triggerEdge even with strong pull pose", () => {
    const controller = createSideTriggerController();

    const out = acceptCycleWithFinalPull(controller);

    expect(out.controllerTelemetry.justArmed).toBe(true);
    expect(out.controllerTelemetry.triggerEdge).toBe("none");
    expect(out.triggerFrame?.triggerEdge).toBe("none");
  });

  it("First accepted cycle → armed=true: next frame can immediately emit pull edge if dwell already satisfied", () => {
    const controller = createSideTriggerController();

    const justArmed = acceptCycleWithFinalPull(controller);
    const out = update(controller, 811, 0.2);

    expect(
      justArmed.controllerTelemetry.dwellFrameCounts.pullDwellFrames
    ).toBeGreaterThanOrEqual(defaultSideTriggerTuning.minPullDwellFrames);
    expect(out.controllerTelemetry.controllerArmed).toBe(true);
    expect(out.controllerTelemetry.triggerEdge).toBe("shotCommitted");
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

  it("handLoss reset (1500ms gap) sets calibrationStatus back to defaultWide", () => {
    const controller = createSideTriggerController();
    acceptCycleWithFinalPull(controller);

    const out = controller.update({
      detection: undefined,
      tuning: defaultSideTriggerTuning,
      timestamp: timestamp(2_295),
      sliderInDefaultRange: true
    });

    expect(out.controllerTelemetry.resetReason).toBe("handLoss");
    expect(out.controllerTelemetry.controllerArmed).toBe(false);
    expect(out.controllerTelemetry.calibrationStatus).toBe("defaultWide");
  });

  it("handLoss reset fires once until a new usable hand is observed", () => {
    const controller = createSideTriggerController();
    update(controller, 0, 1.2);

    const firstLoss = controller.update({
      detection: undefined,
      tuning: defaultSideTriggerTuning,
      timestamp: timestamp(1_600),
      sliderInDefaultRange: true
    });
    const stillLost = controller.update({
      detection: undefined,
      tuning: defaultSideTriggerTuning,
      timestamp: timestamp(1_700),
      sliderInDefaultRange: true
    });
    const stillLostLater = controller.update({
      detection: undefined,
      tuning: defaultSideTriggerTuning,
      timestamp: timestamp(1_800),
      sliderInDefaultRange: true
    });

    expect(firstLoss.controllerTelemetry.resetReason).toBe("handLoss");
    expect(stillLost.controllerTelemetry.resetReason).toBeUndefined();
    expect(stillLostLater.controllerTelemetry.resetReason).toBeUndefined();
  });

  it("geometryJump reset", () => {
    const controller = createSideTriggerController();
    update(controller, 0, 1.2);

    const out = update(controller, 16, 1.2, { geometryScale: 2 });

    expect(out.controllerTelemetry.resetReason).toBe("geometryJump");
    expect(out.controllerTelemetry.controllerArmed).toBe(false);
  });

  it("sourceChanged reset", () => {
    const controller = createSideTriggerController();
    update(controller, 0, 1.2, { streamId: "stream-a" });

    const out = update(controller, 16, 1.2, { streamId: "stream-b" });

    expect(out.controllerTelemetry.resetReason).toBe("sourceChanged");
    expect(out.controllerTelemetry.controllerArmed).toBe(false);
  });
});

describe("sideTriggerController reset priority", () => {
  it("orders reset reasons as sourceChanged > geometryJump > handLoss > manualOverrideEntered", () => {
    const sourceOverGeometry = createSideTriggerController();
    update(sourceOverGeometry, 0, 1.2, { streamId: "stream-a" });
    const sourceOverGeometryOut = sourceOverGeometry.update({
      detection: makeDetection(16, 1.2, {
        geometryScale: 2,
        streamId: "stream-b"
      }),
      tuning: defaultSideTriggerTuning,
      sliderInDefaultRange: false
    });

    const sourceOverHandLoss = createSideTriggerController();
    update(sourceOverHandLoss, 0, 1.2, { streamId: "stream-a" });
    const sourceOverHandLossOut = sourceOverHandLoss.update({
      detection: makeDetection(1_600, 1.2, {
        sideViewQuality: "lost",
        streamId: "stream-b"
      }),
      tuning: defaultSideTriggerTuning,
      sliderInDefaultRange: false
    });

    const geometryOverManual = createSideTriggerController();
    update(geometryOverManual, 0, 1.2);
    const geometryOverManualOut = geometryOverManual.update({
      detection: makeDetection(16, 1.2, { geometryScale: 2 }),
      tuning: defaultSideTriggerTuning,
      sliderInDefaultRange: false
    });

    const handLossOverManual = createSideTriggerController();
    update(handLossOverManual, 0, 1.2);
    const handLossOverManualOut = handLossOverManual.update({
      detection: undefined,
      tuning: defaultSideTriggerTuning,
      timestamp: timestamp(1_600),
      sliderInDefaultRange: false
    });

    expect(sourceOverGeometryOut.controllerTelemetry.resetReason).toBe(
      "sourceChanged"
    );
    expect(sourceOverHandLossOut.controllerTelemetry.resetReason).toBe(
      "sourceChanged"
    );
    expect(geometryOverManualOut.controllerTelemetry.resetReason).toBe(
      "geometryJump"
    );
    expect(handLossOverManualOut.controllerTelemetry.resetReason).toBe(
      "handLoss"
    );
  });
});
