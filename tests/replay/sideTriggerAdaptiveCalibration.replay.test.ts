import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { FrameTimestamp } from "../../src/shared/types/camera";
import type {
  HandFrame,
  HandLandmarkSet,
  SideHandDetection,
  SideViewQuality
} from "../../src/shared/types/hand";
import type { SideTriggerEvidence } from "../../src/features/side-trigger/sideTriggerEvidence";
import {
  DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG,
  createInitialAdaptiveSideTriggerCalibrationState,
  defaultSideTriggerCalibration,
  defaultSideTriggerTuning,
  extractSideTriggerRawMetric,
  updateSideTriggerAdaptiveCalibration
} from "../../src/features/side-trigger";
import { extractSideTriggerEvidence } from "../../src/features/side-trigger/sideTriggerEvidence";
import {
  createInitialSideTriggerState,
  updateSideTriggerState
} from "../../src/features/side-trigger/sideTriggerStateMachine";

interface ReplayFrame {
  readonly timestamp: FrameTimestamp;
  readonly side?: {
    readonly landmarks?: HandLandmarkSet;
    readonly worldLandmarks?: HandLandmarkSet;
    readonly sideViewQuality: SideViewQuality;
  };
}

interface ReplayFixture {
  readonly frames: ReplayFrame[];
}

const fixture = JSON.parse(
  readFileSync(
    "tests/fixtures/replay/sideTriggerAdaptive/baseline-2026-04-19.json",
    "utf8"
  )
) as ReplayFixture;

const noHandEvidence = (): SideTriggerEvidence => ({
  sideHandDetected: false,
  sideViewQuality: "lost",
  pullEvidenceScalar: 0,
  releaseEvidenceScalar: 0,
  triggerPostureConfidence: 0,
  shotCandidateConfidence: 0,
  rejectReason: "handNotDetected",
  usedWorldLandmarks: false
});

const detectionFor = (
  frame: ReplayFrame
): SideHandDetection | undefined => {
  if (
    frame.side?.landmarks === undefined ||
    frame.side.worldLandmarks === undefined
  ) {
    return undefined;
  }

  const rawFrame: HandFrame = {
    width: 640,
    height: 480,
    landmarks: frame.side.landmarks,
    worldLandmarks: frame.side.worldLandmarks
  };

  return {
    laneRole: "sideTrigger",
    deviceId: "replay-side-device",
    streamId: "replay-side-stream",
    timestamp: frame.timestamp,
    rawFrame,
    filteredFrame: rawFrame,
    handPresenceConfidence: 0.9,
    sideViewQuality: frame.side.sideViewQuality
  };
};

const isCommitEdge = (edge: string): boolean =>
  edge === "shotCommitted" || edge === "pullStarted+shotCommitted";

const updateAdaptiveState = (
  adaptiveState: ReturnType<
    typeof createInitialAdaptiveSideTriggerCalibrationState
  >,
  detection: SideHandDetection | undefined,
  frame: ReplayFrame
) =>
  updateSideTriggerAdaptiveCalibration(
    adaptiveState,
    extractSideTriggerRawMetric(detection, {
      timestampMs: frame.timestamp.frameTimestampMs
    }),
    DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG
  );

const evidenceFor = (
  detection: SideHandDetection | undefined,
  calibration: Parameters<typeof extractSideTriggerEvidence>[1]
): SideTriggerEvidence =>
  detection === undefined
    ? noHandEvidence()
    : extractSideTriggerEvidence(detection, calibration);

const simulate = (mode: "static" | "adaptive") => {
  let machineState = createInitialSideTriggerState();
  let adaptiveState = createInitialAdaptiveSideTriggerCalibrationState(
    DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG
  );
  let commits = 0;
  let releases = 0;

  for (const frame of fixture.frames) {
    const detection = detectionFor(frame);
    if (mode === "adaptive") {
      adaptiveState = updateAdaptiveState(adaptiveState, detection, frame);
    }

    const evidence = evidenceFor(
      detection,
      mode === "static"
        ? defaultSideTriggerCalibration
        : adaptiveState.calibration
    );
    const result = updateSideTriggerState(
      machineState,
      evidence,
      defaultSideTriggerTuning
    );
    machineState = result.state;

    if (isCommitEdge(result.edge)) {
      commits += 1;
    }
    if (result.edge === "releaseConfirmed") {
      releases += 1;
    }
  }

  return { commits, releases };
};

describe("adaptive side-trigger calibration captured replay", () => {
  it("passes the reducer/FSM smoke gate against the captured 2026-04-19 fixture", () => {
    const staticResult = simulate("static");
    const adaptiveResult = simulate("adaptive");

    console.info(
      `side-trigger adaptive replay: static=${String(staticResult.commits)}, adaptive=${String(adaptiveResult.commits)}, releases=${String(adaptiveResult.releases)}`
    );
    expect(adaptiveResult.commits).toBeGreaterThanOrEqual(8);
    expect(adaptiveResult.commits).toBeGreaterThan(staticResult.commits);
    if (adaptiveResult.commits < 13) {
      console.warn(
        `adaptive replay target warning: expected >=13 long-run target commits, received ${String(adaptiveResult.commits)}`
      );
    }
  });
});
