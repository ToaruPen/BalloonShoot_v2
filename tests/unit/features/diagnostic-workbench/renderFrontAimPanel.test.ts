import { describe, expect, it } from "vitest";
import { renderFrontAimPanel } from "../../../../src/features/diagnostic-workbench/renderFrontAimPanel";
import type {
  AimInputFrame,
  FrontAimTelemetry
} from "../../../../src/shared/types/aim";
import { testTimestamp } from "../front-aim/testFactory";

const createAimFrame = (): AimInputFrame => ({
  laneRole: "frontAim",
  timestamp: testTimestamp(),
  aimAvailability: "available",
  aimPointViewport: { x: 123.4567, y: 78.9 },
  aimPointNormalized: { x: 0.192901, y: 0.164375 },
  aimSmoothingState: "tracking",
  frontHandDetected: true,
  frontTrackingConfidence: 0.8765,
  sourceFrameSize: { width: 640, height: 480 }
});

const createTelemetry = (): FrontAimTelemetry => ({
  aimAvailability: "available",
  aimSmoothingState: "tracking",
  frontHandDetected: true,
  frontTrackingConfidence: 0.8765,
  aimPointViewport: { x: 123.4567, y: 78.9 },
  aimPointNormalized: { x: 0.192901, y: 0.164375 },
  sourceFrameSize: { width: 640, height: 480 },
  lastLostReason: undefined
});

describe("renderFrontAimPanel", () => {
  it("renders available aim coordinates with stable formatting", () => {
    const html = renderFrontAimPanel(createAimFrame(), createTelemetry());

    expect(html).toContain("フロント aim mapping");
    expect(html).toMatch(
      /<span>viewport x<\/span>\s*<strong>123\.5<\/strong>/
    );
    expect(html).toMatch(
      /<span>viewport y<\/span>\s*<strong>78\.9<\/strong>/
    );
    expect(html).toMatch(
      /<span>normalized x<\/span>\s*<strong>0\.193<\/strong>/
    );
    expect(html).toMatch(
      /<span>tracking confidence<\/span>\s*<strong>0\.877<\/strong>/
    );
  });

  it("renders unavailable values before the first mapped frame", () => {
    const html = renderFrontAimPanel(undefined, undefined);

    expect(html).toContain("aim mapping unavailable");
    expect(html).toMatch(
      /<span>viewport x<\/span>\s*<strong>unavailable<\/strong>/
    );
    expect(html).toMatch(
      /<span>tracking confidence<\/span>\s*<strong>unavailable<\/strong>/
    );
  });

  it("escapes all text values", () => {
    const rawLostReason = `<lost & "quoted" 'reason'>`;
    const html = renderFrontAimPanel(undefined, {
      aimAvailability: "unavailable",
      frontHandDetected: false,
      frontTrackingConfidence: undefined,
      aimPointViewport: undefined,
      aimPointNormalized: undefined,
      sourceFrameSize: undefined,
      lastLostReason: rawLostReason as FrontAimTelemetry["lastLostReason"],
      aimSmoothingState: "recoveringAfterLoss"
    });

    expect(html).toContain("&lt;lost &amp; &quot;quoted&quot; &#39;reason&#39;&gt;");
    expect(html).not.toContain(rawLostReason);
  });

  it("renders raw aim telemetry fields that the panel actually emits", () => {
    const html = renderFrontAimPanel(createAimFrame(), createTelemetry());

    expect(html).toMatch(
      /<span>source frame<\/span>\s*<strong>640 x 480<\/strong>/
    );
    expect(html).toMatch(/<span>last lost<\/span>\s*<strong>none<\/strong>/);
  });
});
