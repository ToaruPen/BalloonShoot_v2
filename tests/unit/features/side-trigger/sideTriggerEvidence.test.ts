import { describe, expect, it } from "vitest";
import { defaultSideTriggerCalibration } from "../../../../src/features/side-trigger";
import { extractSideTriggerEvidence } from "../../../../src/features/side-trigger/sideTriggerEvidence";
import {
  createSideDetection,
  openWorldLandmarks,
  pulledWorldLandmarks
} from "./testFactory";

describe("extractSideTriggerEvidence", () => {
  it("uses world landmarks to score open trigger posture as release evidence", () => {
    const evidence = extractSideTriggerEvidence(
      createSideDetection({ worldLandmarks: openWorldLandmarks() }),
      defaultSideTriggerCalibration
    );

    expect(evidence.usedWorldLandmarks).toBe(true);
    expect(evidence.releaseEvidenceScalar).toBeGreaterThan(0.7);
    expect(evidence.pullEvidenceScalar).toBeLessThan(0.5);
    expect(evidence.triggerPostureConfidence).toBeGreaterThan(0.8);
  });

  it("uses world landmarks to score pulled trigger posture as pull evidence", () => {
    const evidence = extractSideTriggerEvidence(
      createSideDetection({ worldLandmarks: pulledWorldLandmarks() }),
      defaultSideTriggerCalibration
    );

    expect(evidence.usedWorldLandmarks).toBe(true);
    expect(evidence.pullEvidenceScalar).toBeGreaterThan(0.7);
    expect(evidence.releaseEvidenceScalar).toBeLessThan(0.5);
    expect(evidence.shotCandidateConfidence).toBeGreaterThan(0.7);
  });

  it.each(["frontLike", "tooOccluded", "lost"] as const)(
    "rejects commit confidence when side view quality is %s",
    (sideViewQuality) => {
      const evidence = extractSideTriggerEvidence(
        createSideDetection({
          worldLandmarks: pulledWorldLandmarks(),
          sideViewQuality
        }),
        defaultSideTriggerCalibration
      );

      expect(evidence.rejectReason).toBe("sideViewQualityRejected");
      expect(evidence.shotCandidateConfidence).toBeLessThan(0.5);
    }
  );

  it("returns explicit unavailable evidence when world landmarks are missing", () => {
    const evidence = extractSideTriggerEvidence(
      createSideDetection({ worldLandmarks: undefined }),
      defaultSideTriggerCalibration
    );

    expect(evidence.usedWorldLandmarks).toBe(false);
    expect(evidence.rejectReason).toBe("worldLandmarksUnavailable");
    expect(evidence.pullEvidenceScalar).toBe(0);
    expect(evidence.releaseEvidenceScalar).toBe(0);
  });

  it("lowers shot candidate confidence for low hand confidence", () => {
    const evidence = extractSideTriggerEvidence(
      createSideDetection({
        worldLandmarks: pulledWorldLandmarks(),
        handPresenceConfidence: 0.2
      }),
      defaultSideTriggerCalibration
    );

    expect(evidence.rejectReason).toBe("lowHandConfidence");
    expect(evidence.shotCandidateConfidence).toBeLessThan(0.3);
  });

  it("maps calibrated pulled pose closer to maximum pull evidence", () => {
    const evidence = extractSideTriggerEvidence(
      createSideDetection({ worldLandmarks: pulledWorldLandmarks() }),
      {
        openPose: { normalizedThumbDistance: 1.4 },
        pulledPose: { normalizedThumbDistance: 0.25 }
      }
    );

    expect(evidence.pullEvidenceScalar).toBeGreaterThan(0.95);
    expect(evidence.releaseEvidenceScalar).toBeLessThan(0.1);
  });

  it("maps calibrated open pose closer to maximum release evidence", () => {
    const evidence = extractSideTriggerEvidence(
      createSideDetection({ worldLandmarks: openWorldLandmarks() }),
      {
        openPose: { normalizedThumbDistance: 1.4 },
        pulledPose: { normalizedThumbDistance: 0.25 }
      }
    );

    expect(evidence.releaseEvidenceScalar).toBeGreaterThan(0.95);
    expect(evidence.pullEvidenceScalar).toBeLessThan(0.1);
  });
});
