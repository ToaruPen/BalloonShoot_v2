import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSessionRecorder,
  type DiagnosticFrameSubscription
} from "../../../../../src/features/diagnostic-workbench/recording/sessionRecorder";
import type { TelemetryFrame } from "../../../../../src/features/diagnostic-workbench/recording/telemetryFrame";
import { defaultFrontAimCalibration } from "../../../../../src/features/front-aim";
import { defaultSideTriggerCalibration } from "../../../../../src/features/side-trigger";
import { FakeFileSystemDirectoryHandle } from "../../../../helpers/fileSystemAccessMocks";

const timestamp = {
  frameTimestampMs: 100,
  timestampSource: "requestVideoFrameCallbackCaptureTime" as const,
  presentedFrames: 1,
  receivedAtPerformanceMs: 101
};

const createFrame = (frameTimestampMs: number): TelemetryFrame => ({
  timestamp: { ...timestamp, frameTimestampMs },
  fusionMode: "pairedFrontAndSide",
  calibration: {
    frontAim: defaultFrontAimCalibration,
    sideTrigger: defaultSideTriggerCalibration
  },
  front: {
    landmarks: {
      wrist: { x: 0, y: 0, z: 0 },
      thumbIp: { x: 0.1, y: 0, z: 0 },
      thumbTip: { x: 0.2, y: 0, z: 0 },
      indexMcp: { x: 0.3, y: 0, z: 0 },
      indexTip: { x: 0.4, y: 0, z: 0 },
      middleTip: { x: 0.5, y: 0, z: 0 },
      ringTip: { x: 0.6, y: 0, z: 0 },
      pinkyTip: { x: 0.7, y: 0, z: 0 }
    },
    laneHealth: "tracking",
    aimContext: {
      aimAvailability: "available",
      aimSmoothingState: "tracking",
      frontHandDetected: true,
      frontTrackingConfidence: 0.9,
      aimPointViewport: { x: 320, y: 240 },
      aimPointNormalized: { x: 0.5, y: 0.5 },
      sourceFrameSize: { width: 640, height: 480 },
      calibrationStatus: "default",
      calibration: defaultFrontAimCalibration,
      lastLostReason: undefined
    }
  },
  side: {
    landmarks: undefined,
    worldLandmarks: undefined,
    sideViewQuality: "good",
    evidence: {
      sideHandDetected: true,
      sideViewQuality: "good",
      pullEvidenceScalar: 0.8,
      releaseEvidenceScalar: 0.2,
      triggerPostureConfidence: 0.9,
      shotCandidateConfidence: 0.8,
      rejectReason: undefined,
      usedWorldLandmarks: true
    },
    fsmPhase: "SideTriggerPulledLatched",
    triggerEdge: "shotCommitted",
    laneHealth: "tracking"
  },
  fusion: {
    fusionTimestampMs: frameTimestampMs,
    fusionMode: "pairedFrontAndSide",
    timeDeltaBetweenLanesMs: 4,
    aim: undefined,
    trigger: undefined,
    shotFired: true,
    inputConfidence: 0.8,
    frontSource: {
      laneRole: "frontAim",
      frameTimestamp: { ...timestamp, frameTimestampMs },
      frameAgeMs: 1,
      laneHealth: "tracking",
      availability: "available",
      rejectReason: "none"
    },
    sideSource: {
      laneRole: "sideTrigger",
      frameTimestamp: { ...timestamp, frameTimestampMs: frameTimestampMs + 4 },
      frameAgeMs: 0,
      laneHealth: "tracking",
      availability: "available",
      rejectReason: "none"
    },
    fusionRejectReason: "none"
  }
});

describe("createSessionRecorder", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls showDirectoryPicker with the window receiver", async () => {
    const directory = new FakeFileSystemDirectoryHandle();
    const windowLike = {
      showDirectoryPicker: vi.fn(function (
        this: unknown,
        options: { readonly mode: "readwrite" }
      ) {
        if (this !== windowLike) {
          throw new TypeError("Illegal invocation");
        }

        expect(options).toEqual({ mode: "readwrite" });
        return Promise.resolve(
          directory as unknown as FileSystemDirectoryHandle
        );
      })
    };
    vi.stubGlobal("window", windowLike);
    const recorder = createSessionRecorder({
      now: () => new Date("2026-04-19T08:30:15.000Z"),
      createVideoRecorder: vi.fn(() => ({
        start: vi.fn(),
        stop: vi.fn()
      }))
    });

    await recorder.start({
      frontStream: { id: "front-stream" } as MediaStream,
      sideStream: { id: "side-stream" } as MediaStream,
      subscribeFrame: () => vi.fn()
    });

    expect(windowLike.showDirectoryPicker).toHaveBeenCalledOnce();
    expect(recorder.getState().status).toBe("recording");
  });

  it("records telemetry frames to JSON and starts front and side videos", async () => {
    const directory = new FakeFileSystemDirectoryHandle();
    let frameCallback: ((frame: TelemetryFrame) => void) | undefined;
    const unsubscribe = vi.fn();
    const startVideo = vi.fn();
    const stopVideo = vi.fn();
    const recorder = createSessionRecorder({
      requestDirectoryHandle: vi.fn(() =>
        Promise.resolve(directory as unknown as FileSystemDirectoryHandle)
      ),
      now: () => new Date("2026-04-19T08:30:15.000Z"),
      createVideoRecorder: vi.fn(() => ({
        start: startVideo,
        stop: stopVideo
      }))
    });
    const subscribeFrame: DiagnosticFrameSubscription = (callback) => {
      frameCallback = callback;
      return unsubscribe;
    };

    await recorder.start({
      frontStream: { id: "front-stream" } as MediaStream,
      sideStream: { id: "side-stream" } as MediaStream,
      subscribeFrame
    });
    frameCallback?.(createFrame(100));
    await recorder.stop();
    frameCallback?.(createFrame(200));

    const jsonFile = directory.files.get(
      "telemetry-2026-04-19T08-30-15-000Z.json"
    );
    if (jsonFile === undefined) {
      throw new Error("Telemetry JSON file was not written");
    }
    const payload = JSON.parse(await jsonFile.text()) as {
      schemaVersion: number;
      sessionStart: string;
      sessionEnd: string;
      frames: TelemetryFrame[];
    };

    expect(startVideo).toHaveBeenCalledTimes(2);
    expect(stopVideo).toHaveBeenCalledTimes(2);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(directory.files.has("front.webm")).toBe(true);
    expect(directory.files.has("side.webm")).toBe(true);
    expect(payload.schemaVersion).toBe(1);
    expect(payload.sessionStart).toBe("2026-04-19T08:30:15.000Z");
    expect(payload.sessionEnd).toBe("2026-04-19T08:30:15.000Z");
    expect(payload.frames).toHaveLength(1);
    expect(payload.frames[0]?.fusion.shotFired).toBe(true);
    expect(payload.frames[0]?.side.triggerEdge).toBe("shotCommitted");
  });

  it("rotates telemetry JSON files to the newest ten after stop", async () => {
    const directory = new FakeFileSystemDirectoryHandle();

    for (let index = 0; index < 11; index += 1) {
      await directory.getFileHandle(
        `telemetry-2026-04-19T08-30-${String(index).padStart(2, "0")}-000Z.json`,
        { create: true }
      );
    }

    const recorder = createSessionRecorder({
      requestDirectoryHandle: vi.fn(() =>
        Promise.resolve(directory as unknown as FileSystemDirectoryHandle)
      ),
      now: () => new Date("2026-04-19T08:30:15.000Z"),
      createVideoRecorder: vi.fn(() => ({
        start: vi.fn(),
        stop: vi.fn()
      }))
    });

    await recorder.start({
      frontStream: { id: "front-stream" } as MediaStream,
      sideStream: { id: "side-stream" } as MediaStream,
      subscribeFrame: () => vi.fn()
    });
    await recorder.stop();

    expect(directory.deletedNames).toEqual([
      "telemetry-2026-04-19T08-30-01-000Z.json",
      "telemetry-2026-04-19T08-30-00-000Z.json"
    ]);
  });

  it("uses millisecond precision in telemetry file names", async () => {
    const directory = new FakeFileSystemDirectoryHandle();
    const now = vi
      .fn<() => Date>()
      .mockReturnValueOnce(new Date("2026-04-19T08:30:15.123Z"))
      .mockReturnValueOnce(new Date("2026-04-19T08:30:15.123Z"))
      .mockReturnValueOnce(new Date("2026-04-19T08:30:15.456Z"))
      .mockReturnValueOnce(new Date("2026-04-19T08:30:15.456Z"));
    const recorder = createSessionRecorder({
      requestDirectoryHandle: vi.fn(() =>
        Promise.resolve(directory as unknown as FileSystemDirectoryHandle)
      ),
      now,
      createVideoRecorder: vi.fn(() => ({
        start: vi.fn(),
        stop: vi.fn()
      }))
    });
    const startOptions = {
      frontStream: { id: "front-stream" } as MediaStream,
      sideStream: { id: "side-stream" } as MediaStream,
      subscribeFrame: () => vi.fn()
    };

    await recorder.start(startOptions);
    await recorder.stop();
    await recorder.start(startOptions);
    await recorder.stop();

    expect(directory.files.has("telemetry-2026-04-19T08-30-15-123Z.json")).toBe(
      true
    );
    expect(directory.files.has("telemetry-2026-04-19T08-30-15-456Z.json")).toBe(
      true
    );
  });

  it("stops any video recorder that started when the paired recorder fails", async () => {
    const directory = new FakeFileSystemDirectoryHandle();
    const startedRecorderStop = vi.fn(() => Promise.resolve());
    const failedRecorderStop = vi.fn(() => Promise.resolve());
    const createVideoRecorder = vi
      .fn()
      .mockReturnValueOnce({
        start: vi.fn(() => Promise.resolve()),
        stop: startedRecorderStop
      })
      .mockReturnValueOnce({
        start: vi.fn(() => Promise.reject(new Error("side start failed"))),
        stop: failedRecorderStop
      });
    const recorder = createSessionRecorder({
      requestDirectoryHandle: vi.fn(() =>
        Promise.resolve(directory as unknown as FileSystemDirectoryHandle)
      ),
      now: () => new Date("2026-04-19T08:30:15.000Z"),
      createVideoRecorder
    });

    await recorder.start({
      frontStream: { id: "front-stream" } as MediaStream,
      sideStream: { id: "side-stream" } as MediaStream,
      subscribeFrame: () => vi.fn()
    });

    expect(startedRecorderStop).toHaveBeenCalledOnce();
    expect(failedRecorderStop).not.toHaveBeenCalled();
    expect(recorder.getState()).toEqual({
      status: "error",
      message: "side start failed"
    });
  });

  it("prompts again when the reused directory permission is denied", async () => {
    const firstDirectory = new FakeFileSystemDirectoryHandle("first");
    const secondDirectory = new FakeFileSystemDirectoryHandle("second");
    const requestDirectoryHandle = vi
      .fn<() => Promise<FileSystemDirectoryHandle>>()
      .mockResolvedValueOnce(
        firstDirectory as unknown as FileSystemDirectoryHandle
      )
      .mockResolvedValueOnce(
        secondDirectory as unknown as FileSystemDirectoryHandle
      );
    const recorder = createSessionRecorder({
      requestDirectoryHandle,
      now: () => new Date("2026-04-19T08:30:15.000Z"),
      createVideoRecorder: vi.fn(() => ({
        start: vi.fn(),
        stop: vi.fn()
      }))
    });
    const startOptions = {
      frontStream: { id: "front-stream" } as MediaStream,
      sideStream: { id: "side-stream" } as MediaStream,
      subscribeFrame: () => vi.fn()
    };

    await recorder.start(startOptions);
    await recorder.stop();
    firstDirectory.permissionState = "denied";
    await recorder.start(startOptions);

    expect(requestDirectoryHandle).toHaveBeenCalledTimes(2);
    expect(secondDirectory.files.has("front.webm")).toBe(true);
  });
});
