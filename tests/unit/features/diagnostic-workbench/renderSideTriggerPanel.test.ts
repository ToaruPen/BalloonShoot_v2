import { describe, expect, it } from "vitest";
import { renderSideTriggerPanel } from "../../../../src/features/diagnostic-workbench/renderSideTriggerPanel";
import type {
  SideTriggerPhase,
  TriggerInputFrame
} from "../../../../src/shared/types/trigger";
import { testTimestamp } from "../side-trigger/testFactory";

const createFrame = (
  phase: SideTriggerPhase,
  edge: TriggerInputFrame["triggerEdge"] = "none"
): TriggerInputFrame => ({
  laneRole: "sideTrigger",
  timestamp: testTimestamp(),
  triggerAvailability: "available",
  sideTriggerPhase: phase,
  triggerEdge: edge,
  triggerPulled: phase === "SideTriggerPulledLatched",
  shotCandidateConfidence: 0.876,
  sideHandDetected: true,
  sideViewQuality: "good",
  dwellFrameCounts: {
    pullDwellFrames: 2,
    releaseDwellFrames: 1,
    stablePoseFrames: 3,
    lostHandFrames: 0,
    cooldownRemainingFrames: 4
  }
});

describe("renderSideTriggerPanel", () => {
  it.each<SideTriggerPhase>([
    "SideTriggerNoHand",
    "SideTriggerPoseSearching",
    "SideTriggerOpenReady",
    "SideTriggerPullCandidate",
    "SideTriggerPulledLatched",
    "SideTriggerReleaseCandidate",
    "SideTriggerCooldown",
    "SideTriggerRecoveringAfterLoss"
  ])("renders phase %s", (phase) => {
    const html = renderSideTriggerPanel(createFrame(phase), {
      phase,
      edge: "none",
      triggerAvailability: "available",
      calibrationStatus: "liveTuning",
      pullEvidenceScalar: 0.1234,
      releaseEvidenceScalar: 0.9876,
      triggerPostureConfidence: 0.8123,
      shotCandidateConfidence: 0.8765,
      dwellFrameCounts: createFrame(phase).dwellFrameCounts,
      cooldownRemainingFrames: 4,
      lastRejectReason: undefined,
      usedWorldLandmarks: true
    });

    expect(html).toContain(phase);
    expect(html).toContain("pull evidence");
    expect(html).toContain("0.123");
    expect(html).toContain("release evidence");
    expect(html).toContain("0.988");
    expect(html).toContain("cooldown");
    expect(html).toContain("4");
  });

  it("renders shotCommitted evidence visibly", () => {
    const html = renderSideTriggerPanel(
      createFrame("SideTriggerPulledLatched", "shotCommitted")
    );

    expect(html).toContain("shotCommitted");
    expect(html).toContain("SHOT COMMITTED");
  });

  it("renders unavailable state before side trigger telemetry exists", () => {
    const html = renderSideTriggerPanel(undefined, undefined);

    expect(html).toContain("side trigger unavailable");
  });
});
