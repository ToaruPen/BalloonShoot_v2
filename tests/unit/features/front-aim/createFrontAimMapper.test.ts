import { describe, expect, it } from "vitest";
import {
  createFrontAimMapper,
  FRONT_AIM_LOST_FRAME_GRACE_FRAMES
} from "../../../../src/features/front-aim";
import { createFrontDetection, testTimestamp } from "./testFactory";

const viewportSize = { width: 640, height: 480 };

describe("createFrontAimMapper", () => {
  it("starts with a cold-start frame and then tracks", () => {
    const mapper = createFrontAimMapper();
    const firstDetection = createFrontDetection({
      timestamp: testTimestamp(1000)
    });
    const secondDetection = createFrontDetection({
      timestamp: testTimestamp(1016)
    });

    const first = mapper.update({
      detection: firstDetection,
      viewportSize
    });
    const second = mapper.update({
      detection: secondDetection,
      viewportSize
    });

    expect(first.aimFrame?.aimSmoothingState).toBe("coldStart");
    expect(first.aimFrame?.timestamp).toBe(firstDetection.timestamp);
    expect(first.aimFrame?.laneRole).toBe("frontAim");
    expect(second.aimFrame?.aimSmoothingState).toBe("tracking");
    expect(second.aimFrame?.timestamp).toBe(secondDetection.timestamp);
    expect(second.aimFrame?.laneRole).toBe("frontAim");
  });

  it("holds a recent aim estimate during brief hand loss", () => {
    const mapper = createFrontAimMapper();
    mapper.update({ detection: createFrontDetection(), viewportSize });

    const lost = mapper.update({ detection: undefined, viewportSize });

    expect(lost.aimFrame?.aimAvailability).toBe("estimatedFromRecentFrame");
    expect(lost.aimFrame?.aimSmoothingState).toBe("recoveringAfterLoss");
    expect(lost.aimFrame?.frontHandDetected).toBe(false);
    expect(lost.telemetry.lastLostReason).toBe("handNotDetected");
  });

  it("keeps a recent aim estimate for transient hand loss without explicit rejection", () => {
    const mapper = createFrontAimMapper();
    const tracked = mapper.update({
      detection: createFrontDetection(),
      viewportSize
    });

    const transientLoss = mapper.update({ detection: undefined, viewportSize });

    expect(tracked.aimFrame?.aimAvailability).toBe("available");
    expect(transientLoss.aimFrame?.aimAvailability).toBe(
      "estimatedFromRecentFrame"
    );
  });

  it("expires the aim estimate after the grace window", () => {
    const mapper = createFrontAimMapper();
    mapper.update({ detection: createFrontDetection(), viewportSize });

    for (let i = 0; i < FRONT_AIM_LOST_FRAME_GRACE_FRAMES; i += 1) {
      mapper.update({ detection: undefined, viewportSize });
    }
    const expired = mapper.update({ detection: undefined, viewportSize });

    expect(expired.aimFrame).toBeUndefined();
    expect(expired.telemetry.aimAvailability).toBe("unavailable");
    expect(expired.telemetry.lastLostReason).toBe("handNotDetected");
  });

  it("resets smoothing when the stream changes", () => {
    const mapper = createFrontAimMapper();
    mapper.update({ detection: createFrontDetection(), viewportSize });
    mapper.update({ detection: createFrontDetection(), viewportSize });
    const replacementDetection = createFrontDetection({
      streamId: "replacement-stream"
    });

    const afterStreamChange = mapper.update({
      detection: replacementDetection,
      viewportSize
    });

    expect(afterStreamChange.aimFrame?.aimSmoothingState).toBe("coldStart");
    expect(afterStreamChange.aimFrame?.timestamp).toBe(
      replacementDetection.timestamp
    );
    expect(afterStreamChange.aimFrame?.laneRole).toBe("frontAim");
  });

  it("rejects low-confidence posture without using the recent estimate", () => {
    const mapper = createFrontAimMapper();
    mapper.update({ detection: createFrontDetection(), viewportSize });

    const lowConfidence = mapper.update({
      detection: createFrontDetection({ handPresenceConfidence: 0.1 }),
      viewportSize
    });

    expect(lowConfidence.aimFrame).toBeUndefined();
    expect(lowConfidence.telemetry.aimAvailability).toBe("unavailable");
    expect(lowConfidence.telemetry.lastLostReason).toBe("lowHandConfidence");
  });

  it("clears the recent aim estimate after explicit tracking loss", () => {
    const mapper = createFrontAimMapper();
    const tracked = mapper.update({
      detection: createFrontDetection(),
      viewportSize
    });
    const trackingLost = mapper.update({
      detection: createFrontDetection({ trackingQuality: "lost" }),
      viewportSize
    });

    const noDetectionAfterRejection = mapper.update({
      detection: undefined,
      viewportSize
    });

    expect(tracked.aimFrame?.aimAvailability).toBe("available");
    expect(trackingLost.aimFrame).toBeUndefined();
    expect(trackingLost.telemetry.aimAvailability).toBe("unavailable");
    expect(trackingLost.telemetry.lastLostReason).toBe("trackingQualityLost");
    expect(noDetectionAfterRejection.aimFrame).toBeUndefined();
    expect(noDetectionAfterRejection.telemetry.aimAvailability).toBe(
      "unavailable"
    );
  });
});
