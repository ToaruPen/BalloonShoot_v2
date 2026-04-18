import { describe, expect, it, vi } from "vitest";
import { createSessionRecorder } from "../../src/features/diagnostic-workbench/recording/sessionRecorder";
import type { TelemetryFrame } from "../../src/features/diagnostic-workbench/recording/telemetryFrame";
import { defaultFrontAimCalibration } from "../../src/features/front-aim";
import { defaultSideTriggerCalibration } from "../../src/features/side-trigger";
import { FakeFileSystemDirectoryHandle } from "../helpers/fileSystemAccessMocks";

class IntegrationMediaRecorder {
  static readonly instances: IntegrationMediaRecorder[] = [];
  static isTypeSupported(): boolean {
    return true;
  }

  ondataavailable: ((event: BlobEvent) => void) | null = null;
  state: RecordingState = "inactive";

  constructor(readonly stream: MediaStream) {
    IntegrationMediaRecorder.instances.push(this);
  }

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
  }

  emitBlob(text: string): void {
    this.ondataavailable?.({ data: new Blob([text]) } as BlobEvent);
  }
}

const createTelemetryFrame = (): TelemetryFrame => {
  const timestamp = {
    frameTimestampMs: 123,
    timestampSource: "requestVideoFrameCallbackCaptureTime" as const,
    presentedFrames: 3,
    receivedAtPerformanceMs: 124
  };

  return {
    timestamp,
    fusionMode: "frontOnlyAim",
    calibration: {
      frontAim: defaultFrontAimCalibration,
      sideTrigger: defaultSideTriggerCalibration
    },
    front: {
      landmarks: undefined,
      laneHealth: "tracking",
      aimContext: undefined
    },
    side: {
      landmarks: undefined,
      worldLandmarks: undefined,
      sideViewQuality: "lost",
      evidence: {
        sideHandDetected: false,
        sideViewQuality: "lost",
        pullEvidenceScalar: 0,
        releaseEvidenceScalar: 0,
        triggerPostureConfidence: 0,
        shotCandidateConfidence: 0,
        rejectReason: "handNotDetected",
        usedWorldLandmarks: false
      },
      fsmPhase: "SideTriggerNoHand",
      triggerEdge: undefined,
      laneHealth: "captureLost"
    },
    fusion: {
      fusionTimestampMs: 123,
      fusionMode: "frontOnlyAim",
      timeDeltaBetweenLanesMs: undefined,
      aim: undefined,
      trigger: undefined,
      shotFired: false,
      inputConfidence: 0.4,
      frontSource: {
        laneRole: "frontAim",
        frameTimestamp: timestamp,
        frameAgeMs: 0,
        laneHealth: "tracking",
        availability: "available",
        rejectReason: "none"
      },
      sideSource: {
        laneRole: "sideTrigger",
        frameTimestamp: undefined,
        frameAgeMs: undefined,
        laneHealth: "captureLost",
        availability: "unavailable",
        rejectReason: "laneFailed"
      },
      fusionRejectReason: "none"
    }
  };
};

describe("diagnostic recording integration", () => {
  it("runs a record to stop flow with mocked File System Access handles", async () => {
    IntegrationMediaRecorder.instances.length = 0;
    vi.stubGlobal("MediaRecorder", IntegrationMediaRecorder);
    const directory = new FakeFileSystemDirectoryHandle();
    let emitFrame: ((frame: TelemetryFrame) => void) | undefined;
    const recorder = createSessionRecorder({
      requestDirectoryHandle: vi.fn(() =>
        Promise.resolve(directory as unknown as FileSystemDirectoryHandle)
      ),
      now: () => new Date("2026-04-19T08:30:15.000Z")
    });

    await recorder.start({
      frontStream: { id: "front-stream" } as MediaStream,
      sideStream: { id: "side-stream" } as MediaStream,
      subscribeFrame: (callback) => {
        emitFrame = callback;
        return vi.fn();
      }
    });
    IntegrationMediaRecorder.instances[0]?.emitBlob("front-video");
    IntegrationMediaRecorder.instances[1]?.emitBlob("side-video");
    emitFrame?.(createTelemetryFrame());
    await recorder.stop();

    const jsonFile = directory.files.get("telemetry-2026-04-19T08-30-15Z.json");
    if (jsonFile === undefined) {
      throw new Error("Telemetry JSON file was not written");
    }

    expect(directory.files.get("front.webm")?.writable.writes).toHaveLength(1);
    expect(directory.files.get("side.webm")?.writable.writes).toHaveLength(1);
    expect(JSON.parse(await jsonFile.text())).toMatchObject({
      schemaVersion: 1,
      frames: [{ fusionMode: "frontOnlyAim" }]
    });

    vi.unstubAllGlobals();
  });
});
