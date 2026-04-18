import { describe, expect, it } from "vitest";
import {
  createSideTriggerMapper,
  defaultSideTriggerCalibration,
  defaultSideTriggerTuning
} from "../../../../src/features/side-trigger";
import {
  createSideDetection,
  openWorldLandmarks,
  pulledWorldLandmarks,
  testTimestamp
} from "./testFactory";

const feedOpenPose = (mapper: ReturnType<typeof createSideTriggerMapper>) =>
  mapper.update({
    detection: createSideDetection({ worldLandmarks: openWorldLandmarks() }),
    calibration: defaultSideTriggerCalibration,
    tuning: defaultSideTriggerTuning
  });

const feedPulledPose = (
  mapper: ReturnType<typeof createSideTriggerMapper>,
  frameTimestampMs = 1010
) =>
  mapper.update({
    detection: createSideDetection({
      worldLandmarks: pulledWorldLandmarks(),
      timestamp: testTimestamp(frameTimestampMs)
    }),
    calibration: defaultSideTriggerCalibration,
    tuning: defaultSideTriggerTuning
  });

describe("createSideTriggerMapper", () => {
  it("copies FrameTimestamp from SideHandDetection into TriggerInputFrame", () => {
    const mapper = createSideTriggerMapper();
    const timestamp = testTimestamp(1234);
    const result = mapper.update({
      detection: createSideDetection({
        worldLandmarks: openWorldLandmarks(),
        timestamp
      }),
      calibration: defaultSideTriggerCalibration,
      tuning: defaultSideTriggerTuning
    });

    expect(result.triggerFrame?.timestamp).toBe(timestamp);
    expect(result.triggerFrame?.laneRole).toBe("sideTrigger");
    expect(result.triggerFrame?.triggerAvailability).toBe("available");
  });

  it("emits shotCommitted once for a valid pull sequence", () => {
    const mapper = createSideTriggerMapper();

    feedOpenPose(mapper);
    expect(feedPulledPose(mapper, 1010).triggerFrame?.triggerEdge).toBe(
      "pullStarted"
    );
    expect(feedPulledPose(mapper, 1020).triggerFrame?.triggerEdge).toBe(
      "shotCommitted"
    );
    expect(feedPulledPose(mapper, 1030).triggerFrame?.triggerEdge).toBe("none");
  });

  it("does not commit when side view quality is rejected", () => {
    const mapper = createSideTriggerMapper();

    feedOpenPose(mapper);
    const result = mapper.update({
      detection: createSideDetection({
        worldLandmarks: pulledWorldLandmarks(),
        sideViewQuality: "frontLike"
      }),
      calibration: defaultSideTriggerCalibration,
      tuning: defaultSideTriggerTuning
    });

    expect(result.triggerFrame?.triggerEdge).not.toBe("shotCommitted");
    expect(result.triggerFrame?.triggerAvailability).toBe("unavailable");
    expect(result.telemetry.lastRejectReason).toBe("sideViewQualityRejected");
  });

  it("resets phase when the side stream changes", () => {
    const mapper = createSideTriggerMapper();

    feedOpenPose(mapper);
    feedPulledPose(mapper, 1010);
    expect(feedPulledPose(mapper, 1020).triggerFrame?.triggerEdge).toBe(
      "shotCommitted"
    );

    const result = mapper.update({
      detection: createSideDetection({
        streamId: "replacement-side-stream",
        worldLandmarks: pulledWorldLandmarks(),
        timestamp: testTimestamp(2000)
      }),
      calibration: defaultSideTriggerCalibration,
      tuning: defaultSideTriggerTuning
    });

    expect(result.triggerFrame?.sideTriggerPhase).toBe(
      "SideTriggerPoseSearching"
    );
    expect(result.triggerFrame?.triggerEdge).toBe("none");
  });

  it("returns unavailable telemetry without fabricating a frame when no timestamp exists", () => {
    const mapper = createSideTriggerMapper();
    const result = mapper.update({
      detection: undefined,
      calibration: defaultSideTriggerCalibration,
      tuning: defaultSideTriggerTuning
    });

    expect(result.triggerFrame).toBeUndefined();
    expect(result.telemetry.triggerAvailability).toBe("unavailable");
    expect(result.telemetry.phase).toBe("SideTriggerNoHand");
    expect(result.telemetry.calibrationStatus).toBe("default");
    expect(result.telemetry.calibration).toEqual(defaultSideTriggerCalibration);
  });

  it("forwards calibration into evidence extraction on each update", () => {
    const mapper = createSideTriggerMapper();

    const result = mapper.update({
      detection: createSideDetection({
        worldLandmarks: pulledWorldLandmarks()
      }),
      calibration: {
        openPose: { normalizedThumbDistance: 1.4 },
        pulledPose: { normalizedThumbDistance: 0.25 }
      },
      tuning: defaultSideTriggerTuning
    });

    expect(result.telemetry.pullEvidenceScalar).toBeGreaterThan(0.95);
    expect(result.telemetry.calibrationStatus).toBe("liveTuning");
  });
});
