import { describe, expect, it } from "vitest";
import { renderRecordingControls } from "../../../../src/features/diagnostic-workbench/renderRecordingControls";

describe("renderRecordingControls", () => {
  it("renders the idle Record button and status", () => {
    const html = renderRecordingControls({ status: "idle" });

    expect(html).toContain("Recording");
    expect(html).toContain('data-wb-action="startRecording"');
    expect(html).toMatch(/<span>Status<\/span>\s*<strong>idle<\/strong>/);
  });

  it("renders the Stop button and elapsed timer while recording", () => {
    const html = renderRecordingControls({
      status: "recording",
      elapsedMs: 65_000
    });

    expect(html).toContain('data-wb-action="stopRecording"');
    expect(html).toMatch(/<span>Timer<\/span>\s*<strong>01:05<\/strong>/);
    expect(html).toMatch(/<span>Status<\/span>\s*<strong>recording<\/strong>/);
  });

  it("escapes error text from file or directory names", () => {
    const html = renderRecordingControls({
      status: "error",
      message: "Cannot write telemetry-<bad>.json"
    });

    expect(html).toContain("telemetry-&lt;bad&gt;.json");
    expect(html).not.toContain("telemetry-<bad>.json");
  });
});
