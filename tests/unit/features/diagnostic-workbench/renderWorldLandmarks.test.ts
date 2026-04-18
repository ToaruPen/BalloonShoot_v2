import { describe, expect, it } from "vitest";
import { renderSideWorldLandmarks } from "../../../../src/features/diagnostic-workbench/renderWorldLandmarks";
import { createSideDetection } from "../side-trigger/testFactory";

describe("renderSideWorldLandmarks", () => {
  it("renders side world landmark coordinates with timestamp context", () => {
    const html = renderSideWorldLandmarks(createSideDetection());

    expect(html).toContain("サイド world landmarks");
    expect(html).toContain("wrist");
    expect(html).toContain("thumbIp");
    expect(html).toContain("thumbTip");
    expect(html).toContain("indexMcp");
    expect(html).toContain("indexTip");
    expect(html).toContain("0.000 / 0.000 / 0.000");
    expect(html).toContain("1000.0 ms");
    expect(html).toContain("captureTime");
    expect(html).toContain("frames: 12");
  });

  it("renders explicit unavailable state when world landmarks are absent", () => {
    const html = renderSideWorldLandmarks(
      createSideDetection({ worldLandmarks: undefined })
    );

    expect(html).toContain("world landmarks unavailable");
    expect(html).not.toContain("<table");
  });

  it("does not expose raw device ids", () => {
    const html = renderSideWorldLandmarks(
      createSideDetection({ deviceId: "side-secret-device-id" })
    );

    expect(html).not.toContain("side-secret-device-id");
  });
});
