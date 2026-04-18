import { describe, expect, it } from "vitest";
import { renderSideTriggerPanel } from "../../src/features/diagnostic-workbench/renderSideTriggerPanel";
import { renderTuningControls } from "../../src/features/diagnostic-workbench/renderTuningControls";
import { createSideTriggerMapper } from "../../src/features/side-trigger/createSideTriggerMapper";
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
      mapper.update({ detection, tuning: defaultSideTriggerTuning })
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
      tuning: tuned
    });
    mapper.update({
      detection: createSideDetection({
        worldLandmarks: pulledWorldLandmarks()
      }),
      tuning: tuned
    });
    const result = mapper.update({
      detection: createSideDetection({
        worldLandmarks: pulledWorldLandmarks()
      }),
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
      tuning: defaultSideTriggerTuning
    });
    mapper.update({
      detection: createSideDetection({
        worldLandmarks: pulledWorldLandmarks()
      }),
      tuning: defaultSideTriggerTuning
    });
    mapper.update({
      detection: createSideDetection({
        worldLandmarks: pulledWorldLandmarks()
      }),
      tuning: defaultSideTriggerTuning
    });
    mapper.reset();

    const result = mapper.update({
      detection: createSideDetection({
        worldLandmarks: pulledWorldLandmarks()
      }),
      tuning: defaultSideTriggerTuning
    });

    expect(result.triggerFrame?.sideTriggerPhase).toBe(
      "SideTriggerPoseSearching"
    );
    expect(result.triggerFrame?.triggerEdge).toBe("none");
  });
});
