import { existsSync, readFileSync } from "node:fs";
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

/**
 * Replay fixture is intentionally not committed to the repository: the source
 * capture under `iterations/` is gitignored, and committing a 200k-line
 * landmark JSON would dwarf the rest of the repo. Place the capture at the
 * path below to exercise this gate locally; CI will skip the suite when the
 * fixture is absent.
 */
const FIXTURE_PATH = "iterations/telemetry-2026-04-19T01-18-36-449Z.json";

const fixture: ReplayFixture | undefined = existsSync(FIXTURE_PATH)
  ? (JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as ReplayFixture)
  : undefined;

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

const detectionFor = (frame: ReplayFrame): SideHandDetection | undefined => {
  // Image-space landmarks are required to construct a HandFrame; if they
  // are missing the lane really has no hand. worldLandmarks may legitimately
  // be absent on some frames (case 8d in the spec) and must be forwarded as
  // undefined rather than collapsed into a no-hand frame, otherwise the
  // hand-loss timer fires too aggressively.
  if (frame.side?.landmarks === undefined) {
    return undefined;
  }

  const rawFrame: HandFrame = {
    width: 640,
    height: 480,
    landmarks: frame.side.landmarks,
    ...(frame.side.worldLandmarks === undefined
      ? {}
      : { worldLandmarks: frame.side.worldLandmarks })
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

const simulate = (
  mode: "static" | "adaptive",
  frames: readonly ReplayFrame[]
) => {
  let machineState = createInitialSideTriggerState();
  let adaptiveState = createInitialAdaptiveSideTriggerCalibrationState(
    DEFAULT_ADAPTIVE_SIDE_TRIGGER_CALIBRATION_CONFIG
  );
  let commits = 0;
  let releases = 0;

  for (const frame of frames) {
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
  it.skipIf(fixture === undefined)(
    "passes the reducer/FSM smoke gate against the captured 2026-04-19 fixture",
    () => {
      if (fixture === undefined) {
        throw new Error("fixture should be defined when test runs");
      }
      const staticResult = simulate("static", fixture.frames);
      const adaptiveResult = simulate("adaptive", fixture.frames);

      console.info(
        `side-trigger adaptive replay: static=${String(staticResult.commits)}, adaptive=${String(adaptiveResult.commits)}, releases=${String(adaptiveResult.releases)}`
      );
      expect(adaptiveResult.commits).toBeGreaterThanOrEqual(13);
      expect(adaptiveResult.commits).toBeGreaterThan(staticResult.commits);
      if (adaptiveResult.commits < 18) {
        console.warn(
          `adaptive replay target warning: expected >=18 long-run target commits, received ${String(adaptiveResult.commits)}`
        );
      }
    }
  );
});
