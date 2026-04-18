import { describe, expect, it } from "vitest";
import { renderSideTriggerPanel } from "../../src/features/diagnostic-workbench/renderSideTriggerPanel";
import { renderSideTriggerCalibrationControls } from "../../src/features/diagnostic-workbench/renderSideTriggerCalibrationControls";
import { renderTuningControls } from "../../src/features/diagnostic-workbench/renderTuningControls";
import {
  createSideTriggerMapper,
  defaultSideTriggerCalibration
} from "../../src/features/side-trigger";
import { defaultSideTriggerTuning } from "../../src/features/side-trigger/sideTriggerConfig";
import {
  createSideDetection,
  openWorldLandmarks,
  pulledWorldLandmarks,
  testTimestamp
} from "../unit/features/side-trigger/testFactory";

describe("diagnostic side trigger workbench seam", () => {
  it("renders a scripted open, pull, commit, release, cooldown sequence", () => {
    const mapper = createSideTriggerMapper();
    const frames = [
      createSideDetection({
        worldLandmarks: openWorldLandmarks(),
        timestamp: testTimestamp(100)
      }),
      createSideDetection({
        worldLandmarks: pulledWorldLandmarks(),
        timestamp: testTimestamp(110)
      }),
      createSideDetection({
        worldLandmarks: pulledWorldLandmarks(),
        timestamp: testTimestamp(120)
      }),
      createSideDetection({
        worldLandmarks: openWorldLandmarks(),
        timestamp: testTimestamp(130)
      }),
      createSideDetection({
        worldLandmarks: openWorldLandmarks(),
        timestamp: testTimestamp(140)
      })
    ];

    const results = frames.map((detection) =>
      mapper.update({
        detection,
        calibration: defaultSideTriggerCalibration,
        tuning: defaultSideTriggerTuning
      })
    );
    const committed = results.find(
      (item) => item.triggerFrame?.triggerEdge === "shotCommitted"
    );
    const released = results.find(
      (item) => item.triggerFrame?.triggerEdge === "releaseConfirmed"
    );

    expect(committed?.triggerFrame?.sideTriggerPhase).toBe(
      "SideTriggerPulledLatched"
    );
    expect(released?.triggerFrame?.sideTriggerPhase).toBe(
      "SideTriggerCooldown"
    );
    expect(
      renderSideTriggerPanel(committed?.triggerFrame, committed?.telemetry)
    ).toContain("SHOT COMMITTED");
  });

  it("slider tuning changes alter commit dwell behavior before rendering", () => {
    const mapper = createSideTriggerMapper();
    const tuned = {
      ...defaultSideTriggerTuning,
      minPullDwellFrames: 3
    };

    mapper.update({
      detection: createSideDetection({ worldLandmarks: openWorldLandmarks() }),
      calibration: defaultSideTriggerCalibration,
      tuning: tuned
    });
    mapper.update({
      detection: createSideDetection({
        worldLandmarks: pulledWorldLandmarks()
      }),
      calibration: defaultSideTriggerCalibration,
      tuning: tuned
    });
    const result = mapper.update({
      detection: createSideDetection({
        worldLandmarks: pulledWorldLandmarks()
      }),
      calibration: defaultSideTriggerCalibration,
      tuning: tuned
    });

    expect(result.triggerFrame?.triggerEdge).toBe("none");
    expect(result.triggerFrame?.sideTriggerPhase).toBe(
      "SideTriggerPullCandidate"
    );
    expect(renderTuningControls(tuned)).toContain(
      'data-side-trigger-tuning="minPullDwellFrames"'
    );
    expect(
      renderSideTriggerPanel(result.triggerFrame, result.telemetry)
    ).toContain("SideTriggerPullCandidate");
  });

  it("reset mapper state clears trigger phase for reselect-style restarts", () => {
    const mapper = createSideTriggerMapper();

    mapper.update({
      detection: createSideDetection({ worldLandmarks: openWorldLandmarks() }),
      calibration: defaultSideTriggerCalibration,
      tuning: defaultSideTriggerTuning
    });
    mapper.update({
      detection: createSideDetection({
        worldLandmarks: pulledWorldLandmarks()
      }),
      calibration: defaultSideTriggerCalibration,
      tuning: defaultSideTriggerTuning
    });
    mapper.update({
      detection: createSideDetection({
        worldLandmarks: pulledWorldLandmarks()
      }),
      calibration: defaultSideTriggerCalibration,
      tuning: defaultSideTriggerTuning
    });
    mapper.reset();

    const result = mapper.update({
      detection: createSideDetection({
        worldLandmarks: pulledWorldLandmarks()
      }),
      calibration: defaultSideTriggerCalibration,
      tuning: defaultSideTriggerTuning
    });

    expect(result.triggerFrame?.sideTriggerPhase).toBe(
      "SideTriggerPoseSearching"
    );
    expect(result.triggerFrame?.triggerEdge).toBe("none");
  });

  it("calibration slider values alter mapper telemetry before rendering", () => {
    const mapper = createSideTriggerMapper();
    const calibration = {
      openPose: { normalizedThumbDistance: 1.4 },
      pulledPose: { normalizedThumbDistance: 0.25 }
    };
    const result = mapper.update({
      detection: createSideDetection({ worldLandmarks: pulledWorldLandmarks() }),
      calibration,
      tuning: defaultSideTriggerTuning
    });

    expect(result.telemetry.pullEvidenceScalar).toBeGreaterThan(0.95);
    expect(renderSideTriggerCalibrationControls(calibration)).toContain(
      'data-side-trigger-calibration="pulledPoseDistance"'
    );
    expect(
      renderSideTriggerPanel(result.triggerFrame, result.telemetry)
    ).toMatch(/<span>pulled pose distance<\/span>\s*<strong>0\.250<\/strong>/);
  });
});
