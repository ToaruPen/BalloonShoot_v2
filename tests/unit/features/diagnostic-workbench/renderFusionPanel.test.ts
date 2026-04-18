import { describe, expect, it } from "vitest";
import { renderFusionPanel } from "../../../../src/features/diagnostic-workbench/renderFusionPanel";
import type { FusionTelemetry } from "../../../../src/shared/types/fusion";

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const pairRegex = (label: string, value: string): RegExp =>
  new RegExp(
    `<span>${escapeRegExp(label)}</span>\\s*<strong>${escapeRegExp(value)}</strong>`
  );

const createTelemetry = (
  patch: Partial<FusionTelemetry> = {}
): FusionTelemetry => ({
  mode: "pairedFrontAndSide",
  timeDeltaBetweenLanesMs: 12.3456,
  maxPairDeltaMs: 40,
  maxFrameAgeMs: 120,
  frontBufferFrameCount: 2,
  sideBufferFrameCount: 3,
  frontLatestAgeMs: 10,
  sideLatestAgeMs: 0,
  inputConfidence: 0.7654,
  shotFired: true,
  rejectReason: "none",
  lastPairedFrontTimestampMs: 100,
  lastPairedSideTimestampMs: 112.3456,
  timestampSourceSummary: "front=captureTime side=captureTime delta=12.346ms",
  shotEdgeConsumed: true,
  ...patch
});

describe("renderFusionPanel", () => {
  it("renders unavailable state before fusion telemetry exists", () => {
    const html = renderFusionPanel(undefined, undefined);

    expect(html).toContain('id="wb-fusion-panel"');
    expect(html).toContain("fusion unavailable");
    expect(html).toMatch(pairRegex("timestamp delta", "unavailable"));
  });

  it("renders paired mode, reject reason, shot state, and unavailable timestamps", () => {
    const html = renderFusionPanel(
      undefined,
      createTelemetry({
        rejectReason: "timestampGapTooLarge",
        lastPairedFrontTimestampMs: undefined,
        lastPairedSideTimestampMs: undefined
      })
    );

    expect(html).toMatch(pairRegex("fusion mode", "pairedFrontAndSide"));
    expect(html).toMatch(pairRegex("timestamp delta", "12.346"));
    expect(html).toMatch(pairRegex("reject reason", "timestampGapTooLarge"));
    expect(html).toMatch(pairRegex("shot fired", "true"));
    expect(html).toMatch(pairRegex("shot edge consumed", "true"));
    expect(html).toMatch(pairRegex("front lane health", "unavailable"));
    expect(html).toMatch(
      pairRegex("last paired front timestamp", "unavailable")
    );
    expect(html).toMatch(
      pairRegex("last paired side timestamp", "unavailable")
    );
  });

  it("escapes all telemetry text", () => {
    const html = renderFusionPanel(
      undefined,
      createTelemetry({
        timestampSourceSummary: `front=<>&"' side=<>&"'`
      })
    );

    expect(html).toContain("front=&lt;&gt;&amp;&quot;&#39;");
    expect(html).not.toContain(`front=<>&"'`);
  });
});
