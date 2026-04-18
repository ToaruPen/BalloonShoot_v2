import { describe, expect, it } from "vitest";
import { renderSideTriggerPanel } from "../../../../src/features/diagnostic-workbench/renderSideTriggerPanel";
import { defaultSideTriggerCalibration } from "../../../../src/features/side-trigger";
import type {
  SideTriggerTelemetry,
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

const createTelemetry = (
  patch: Partial<SideTriggerTelemetry> = {}
): SideTriggerTelemetry => ({
  phase: "SideTriggerOpenReady",
  edge: "none",
  triggerAvailability: "available",
  calibrationStatus: "liveTuning",
  calibration: {
    ...defaultSideTriggerCalibration,
    openPose: { normalizedThumbDistance: 1.1 }
  },
  pullEvidenceScalar: 0.1234,
  releaseEvidenceScalar: 0.9876,
  triggerPostureConfidence: 0.8123,
  shotCandidateConfidence: 0.8765,
  dwellFrameCounts: createFrame("SideTriggerOpenReady").dwellFrameCounts,
  cooldownRemainingFrames: 4,
  lastRejectReason: undefined,
  usedWorldLandmarks: true,
  ...patch
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
    const frame = createFrame(phase);
    const html = renderSideTriggerPanel(frame, {
      phase,
      edge: "none",
      triggerAvailability: "available",
      calibrationStatus: "liveTuning",
      calibration: defaultSideTriggerCalibration,
      pullEvidenceScalar: 0.1234,
      releaseEvidenceScalar: 0.9876,
      triggerPostureConfidence: 0.8123,
      shotCandidateConfidence: 0.8765,
      dwellFrameCounts: frame.dwellFrameCounts,
      cooldownRemainingFrames: 4,
      lastRejectReason: undefined,
      usedWorldLandmarks: true
    });

    expect(html).toContain(phase);
    expect(html).toContain("pull evidence");
    expect(html).toContain("0.123");
    expect(html).toContain("release evidence");
    expect(html).toContain("0.988");
    expect(html).toContain("open pose distance");
    expect(html).toContain("1.200");
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

  it("renders unavailable triggerPulled value when trigger frame is missing", () => {
    const html = renderSideTriggerPanel(undefined, createTelemetry());

    expect(html).toMatch(
      /<span>triggerPulled<\/span>\s*<strong>unavailable<\/strong>/
    );
  });

  it("renders unavailable telemetry values when telemetry is missing", () => {
    const html = renderSideTriggerPanel(
      createFrame("SideTriggerOpenReady"),
      undefined
    );

    expect(html).toMatch(
      /<span>pull evidence<\/span>\s*<strong>unavailable<\/strong>/
    );
    expect(html).toMatch(
      /<span>release evidence<\/span>\s*<strong>unavailable<\/strong>/
    );
    expect(html).toMatch(
      /<span>posture confidence<\/span>\s*<strong>unavailable<\/strong>/
    );
    expect(html).toMatch(
      /<span>last reject<\/span>\s*<strong>unavailable<\/strong>/
    );
    expect(html).toMatch(
      /<span>open pose distance<\/span>\s*<strong>unavailable<\/strong>/
    );
  });

  it("renders none for last reject when telemetry is present without a reject reason", () => {
    const html = renderSideTriggerPanel(
      createFrame("SideTriggerOpenReady"),
      createTelemetry({ lastRejectReason: undefined })
    );

    expect(html).toMatch(/<span>last reject<\/span>\s*<strong>none<\/strong>/);
  });

  it("renders the last reject reason when telemetry includes one", () => {
    const html = renderSideTriggerPanel(
      createFrame("SideTriggerOpenReady"),
      createTelemetry({ lastRejectReason: "insufficientPullEvidence" })
    );

    expect(html).toMatch(
      /<span>last reject<\/span>\s*<strong>insufficientPullEvidence<\/strong>/
    );
  });

  it("renders false triggerPulled value from an open trigger frame", () => {
    const html = renderSideTriggerPanel(createFrame("SideTriggerOpenReady"));

    expect(html).toMatch(/<span>triggerPulled<\/span>\s*<strong>false<\/strong>/);
  });

  it("renders true triggerPulled value from a pulled trigger frame", () => {
    const html = renderSideTriggerPanel(createFrame("SideTriggerPulledLatched"));

    expect(html).toMatch(/<span>triggerPulled<\/span>\s*<strong>true<\/strong>/);
  });
});
