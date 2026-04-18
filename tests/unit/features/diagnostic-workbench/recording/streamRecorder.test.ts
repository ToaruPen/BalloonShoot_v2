import { describe, expect, it, vi } from "vitest";
import { createStreamRecorder } from "../../../../../src/features/diagnostic-workbench/recording/streamRecorder";
import { FakeFileSystemFileHandle } from "../../../../helpers/fileSystemAccessMocks";

class FakeMediaRecorder {
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  state: RecordingState = "inactive";
  readonly stream: MediaStream;

  constructor(stream: MediaStream) {
    this.stream = stream;
  }

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
  }

  emitBlob(blob: Blob): void {
    this.ondataavailable?.({ data: blob } as BlobEvent);
  }
}

describe("createStreamRecorder", () => {
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

    expect(fileHandle.writable.writes).toEqual([chunk]);
    expect(fileHandle.writable.closed).toBe(true);
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

    expect(fileHandle.writable.writes).toEqual([]);
    expect(fileHandle.writable.closed).toBe(true);
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
