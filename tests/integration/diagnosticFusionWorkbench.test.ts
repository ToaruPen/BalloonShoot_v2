import { describe, expect, it } from "vitest";
import {
  createInputFusionMapper,
  defaultFusionTuning
} from "../../src/features/input-fusion";
import { renderFusionPanel } from "../../src/features/diagnostic-workbench/renderFusionPanel";
import {
  createAimFrame,
  createTriggerFrame
} from "../unit/features/input-fusion/testFactory";

const context = {
  frontLaneHealth: "tracking" as const,
  sideLaneHealth: "tracking" as const,
  tuning: {
    ...defaultFusionTuning,
    maxPairDeltaMs: 20,
    maxFrameAgeMs: 80,
    recentFrameRetentionWindowMs: 200
  }
};

describe("diagnostic fusion workbench integration", () => {
  it("renders paired fusion telemetry from scripted aim and trigger frames", () => {
    const mapper = createInputFusionMapper();

    mapper.updateAimFrame(createAimFrame(100), context);
    const result = mapper.updateTriggerFrame(createTriggerFrame(112), context);
    const html = renderFusionPanel(result.fusedFrame, result.telemetry);

    expect(html).toContain("pairedFrontAndSide");
    expect(html).toContain("12.000");
  });

  it("renders timestamp gap reject reasons from scripted frames", () => {
    const mapper = createInputFusionMapper();

    mapper.updateAimFrame(createAimFrame(100), context);
    const result = mapper.updateTriggerFrame(createTriggerFrame(150), context);
    const html = renderFusionPanel(result.fusedFrame, result.telemetry);

    expect(html).toContain("timestampGapTooLarge");
  });

  it("renders shot fired for one committed side edge", () => {
    const mapper = createInputFusionMapper();

    mapper.updateTriggerFrame(
      createTriggerFrame(100, { triggerEdge: "shotCommitted" }),
      context
    );
    const result = mapper.updateAimFrame(createAimFrame(108), context);
    const html = renderFusionPanel(result.fusedFrame, result.telemetry);

    expect(html).toMatch(/<span>shot fired<\/span>\s*<strong>true<\/strong>/);
    expect(html).toMatch(
      /<span>shot edge consumed<\/span>\s*<strong>true<\/strong>/
    );
  });

  it("renders a device loss and recovery cycle through diagnostic fusion panels", () => {
    const mapper = createInputFusionMapper();

    mapper.updateAimFrame(createAimFrame(100), context);
    const lost = mapper.updateTriggerUnavailable(
      createTriggerFrame(112).timestamp,
      {
        ...context,
        sideLaneHealth: "captureLost"
      }
    );
    const lostHtml = renderFusionPanel(lost.fusedFrame, lost.telemetry);

    expect(lostHtml).toMatch(
      /<span>reject reason<\/span>\s*<strong>laneFailed<\/strong>/
    );
    expect(lostHtml).toMatch(
      /<span>side lane health<\/span>\s*<strong>captureLost<\/strong>/
    );

    const recovered = mapper.updateTriggerFrame(
      createTriggerFrame(116),
      context
    );
    const recoveredHtml = renderFusionPanel(
      recovered.fusedFrame,
      recovered.telemetry
    );

    expect(recoveredHtml).toContain("pairedFrontAndSide");
    expect(recoveredHtml).toMatch(
      /<span>reject reason<\/span>\s*<strong>none<\/strong>/
    );
  });
});
