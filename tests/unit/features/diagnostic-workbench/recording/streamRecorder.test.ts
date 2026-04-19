import { afterEach, describe, expect, it, vi } from "vitest";
import { createStreamRecorder } from "../../../../../src/features/diagnostic-workbench/recording/streamRecorder";
import { FakeFileSystemFileHandle } from "../../../../helpers/fileSystemAccessMocks";

class FakeMediaRecorder {
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  state: RecordingState = "inactive";
  readonly stream: MediaStream;
  readonly startTimeslices: number[] = [];
  private intervalId: ReturnType<typeof setInterval> | undefined;
  private queuedStopBlob: Blob | undefined;

  constructor(stream: MediaStream) {
    this.stream = stream;
  }

  start(timeslice?: number): void {
    this.state = "recording";
    if (timeslice !== undefined) {
      this.startTimeslices.push(timeslice);
      this.intervalId = setInterval(() => {
        this.emitBlob(new Blob(["periodic-video"]));
      }, timeslice);
    }
  }

  stop(): void {
    this.state = "inactive";
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    if (this.queuedStopBlob !== undefined) {
      this.emitBlob(this.queuedStopBlob);
      this.queuedStopBlob = undefined;
    }
    this.onstop?.();
  }

  emitBlob(blob: Blob): void {
    this.ondataavailable?.({ data: blob } as BlobEvent);
  }

  queueStopBlob(blob: Blob): void {
    this.queuedStopBlob = blob;
  }
}

describe("createStreamRecorder", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes blob chunks to the file handle and closes on stop", async () => {
    const recorderInstances: FakeMediaRecorder[] = [];
    const fileHandle = new FakeFileSystemFileHandle("front.webm");
    const stream = { id: "front-stream" } as MediaStream;
    const recorder = createStreamRecorder({
      stream,
      fileHandle: fileHandle as unknown as FileSystemFileHandle,
      mediaRecorderFactory: (input) => {
        const fake = new FakeMediaRecorder(input);
        recorderInstances.push(fake);
        return fake as unknown as MediaRecorder;
      }
    });

    await recorder.start();
    const chunk = new Blob(["video"]);
    recorderInstances[0]?.emitBlob(chunk);
    await recorder.stop();

    expect(fileHandle.latestWritable?.writes).toEqual([chunk]);
    expect(fileHandle.latestWritable?.closed).toBe(true);
  });

  it("preserves the final MediaRecorder chunk emitted during stop", async () => {
    const recorderInstances: FakeMediaRecorder[] = [];
    const fileHandle = new FakeFileSystemFileHandle("front.webm");
    const stream = { id: "front-stream" } as MediaStream;
    const recorder = createStreamRecorder({
      stream,
      fileHandle: fileHandle as unknown as FileSystemFileHandle,
      mediaRecorderFactory: (input) => {
        const fake = new FakeMediaRecorder(input);
        recorderInstances.push(fake);
        return fake as unknown as MediaRecorder;
      }
    });

    await recorder.start();
    const finalChunk = new Blob(["final-video"]);
    recorderInstances[0]?.queueStopBlob(finalChunk);
    await recorder.stop();

    expect(fileHandle.latestWritable?.writes).toEqual([finalChunk]);
    expect(fileHandle.latestWritable?.closed).toBe(true);
  });

  it("streams periodic chunks to the writable before stop", async () => {
    vi.useFakeTimers();
    const recorderInstances: FakeMediaRecorder[] = [];
    const fileHandle = new FakeFileSystemFileHandle("front.webm");
    const recorder = createStreamRecorder({
      stream: { id: "front-stream" } as MediaStream,
      fileHandle: fileHandle as unknown as FileSystemFileHandle,
      mediaRecorderFactory: (input) => {
        const fake = new FakeMediaRecorder(input);
        recorderInstances.push(fake);
        return fake as unknown as MediaRecorder;
      }
    });

    await recorder.start();
    await vi.advanceTimersByTimeAsync(3000);

    expect(recorderInstances[0]?.startTimeslices).toEqual([1000]);
    expect(fileHandle.latestWritable?.writes.length).toBeGreaterThanOrEqual(3);

    await recorder.stop();
  });

  it("discards chunks that arrive after stop closes the writable stream", async () => {
    const recorderInstances: FakeMediaRecorder[] = [];
    const fileHandle = new FakeFileSystemFileHandle("side.webm");
    const recorder = createStreamRecorder({
      stream: { id: "side-stream" } as MediaStream,
      fileHandle: fileHandle as unknown as FileSystemFileHandle,
      mediaRecorderFactory: (input) => {
        const fake = new FakeMediaRecorder(input);
        recorderInstances.push(fake);
        return fake as unknown as MediaRecorder;
      }
    });

    await recorder.start();
    await recorder.stop();
    recorderInstances[0]?.emitBlob(new Blob(["late"]));

    expect(fileHandle.latestWritable?.writes).toEqual([]);
    expect(fileHandle.latestWritable?.closed).toBe(true);
  });

  it("closes the writable stream when MediaRecorder start fails", async () => {
    const fileHandle = new FakeFileSystemFileHandle("failed.webm");
    const recorder = createStreamRecorder({
      stream: { id: "failed-stream" } as MediaStream,
      fileHandle: fileHandle as unknown as FileSystemFileHandle,
      mediaRecorderFactory: (input) => {
        const fake = new FakeMediaRecorder(input);
        fake.start = () => {
          throw new Error("MediaRecorder start failed");
        };
        return fake as unknown as MediaRecorder;
      }
    });

    await expect(recorder.start()).rejects.toThrow(
      "MediaRecorder start failed"
    );

    expect(fileHandle.writableStreams).toHaveLength(1);
    expect(fileHandle.latestWritable?.closed).toBe(true);
  });

  it("does not request a MediaRecorder mime type when none is supported", async () => {
    const factory = vi.fn(
      (stream: MediaStream) =>
        new FakeMediaRecorder(stream) as unknown as MediaRecorder
    );
    const recorder = createStreamRecorder({
      stream: { id: "plain-stream" } as MediaStream,
      fileHandle: new FakeFileSystemFileHandle(
        "plain.webm"
      ) as unknown as FileSystemFileHandle,
      mediaRecorderFactory: factory,
      isTypeSupported: () => false
    });

    await recorder.start();

    expect(factory).toHaveBeenCalledWith({ id: "plain-stream" }, undefined);
  });
});
