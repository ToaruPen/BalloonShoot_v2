import { describe, expect, it } from "vitest";
import { telemetryJsonFilesToDelete } from "../../../../../src/features/diagnostic-workbench/recording/jsonRotation";

describe("telemetryJsonFilesToDelete", () => {
  it("keeps the newest N telemetry JSON files and deletes older names", () => {
    const names = [
      "telemetry-2026-04-19T08-30-13Z.json",
      "front.webm",
      "telemetry-2026-04-19T08-30-15Z.json",
      "telemetry-2026-04-19T08-30-14Z.json",
      "notes.json"
    ];

    expect(telemetryJsonFilesToDelete(names, 2)).toEqual([
      "telemetry-2026-04-19T08-30-13Z.json"
    ]);
  });

  it("returns an empty list when capacity covers all telemetry files", () => {
    expect(
      telemetryJsonFilesToDelete(
        [
          "telemetry-2026-04-19T08-30-13Z.json",
          "telemetry-2026-04-19T08-30-14Z.json"
        ],
        10
      )
    ).toEqual([]);
  });
});
