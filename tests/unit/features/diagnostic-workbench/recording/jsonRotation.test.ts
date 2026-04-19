import { describe, expect, it } from "vitest";
import { telemetryJsonFilesToDelete } from "../../../../../src/features/diagnostic-workbench/recording/jsonRotation";

describe("telemetryJsonFilesToDelete", () => {
  it("keeps the newest N telemetry JSON files and deletes older names", () => {
    const names = [
      "telemetry-2026-04-19T08-30-13-123Z.json",
      "front.webm",
      "telemetry-2026-04-19T08-30-15-123Z.json",
      "telemetry-2026-04-19T08-30-14-123Z.json",
      "notes.json"
    ];

    expect(telemetryJsonFilesToDelete(names, 2)).toEqual([
      "telemetry-2026-04-19T08-30-13-123Z.json"
    ]);
  });

  it("returns an empty list when capacity covers all telemetry files", () => {
    expect(
      telemetryJsonFilesToDelete(
        [
          "telemetry-2026-04-19T08-30-13-123Z.json",
          "telemetry-2026-04-19T08-30-14-123Z.json"
        ],
        10
      )
    ).toEqual([]);
  });

  it("ignores user-created telemetry-looking JSON files", () => {
    expect(
      telemetryJsonFilesToDelete(
        [
          "telemetry-notes.json",
          "telemetry-export.json",
          "my-telemetry.json",
          "telemetry-2026-04-19T08-30-15-432Z.json"
        ],
        0
      )
    ).toEqual(["telemetry-2026-04-19T08-30-15-432Z.json"]);
  });

  it("ignores timestamp names without millisecond precision", () => {
    expect(
      telemetryJsonFilesToDelete(
        [
          "telemetry-2026-04-19T08-30-15Z.json",
          "telemetry-2026-04-19T08-30-15-432Z.json"
        ],
        0
      )
    ).toEqual(["telemetry-2026-04-19T08-30-15-432Z.json"]);
  });

  it("deletes only the oldest valid telemetry file from mixed entries", () => {
    const validNames = Array.from(
      { length: 10 },
      (_, index) =>
        `telemetry-2026-04-19T08-30-${String(index).padStart(2, "0")}-000Z.json`
    );

    expect(
      telemetryJsonFilesToDelete([...validNames, "telemetry-notes.json"], 9)
    ).toEqual(["telemetry-2026-04-19T08-30-00-000Z.json"]);
  });
});
