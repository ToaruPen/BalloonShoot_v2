import { telemetryJsonFilesToDelete } from "./jsonRotation";
import { createStreamRecorder, type StreamRecorder } from "./streamRecorder";
import type { TelemetryFrame, TelemetrySessionJson } from "./telemetryFrame";

type RecordingStatus = "idle" | "starting" | "recording" | "saving" | "error";

export type RecordingState =
  | { readonly status: Extract<RecordingStatus, "idle"> }
  | { readonly status: Extract<RecordingStatus, "starting"> }
  | {
      readonly status: Extract<RecordingStatus, "recording">;
      readonly elapsedMs: number;
    }
  | { readonly status: Extract<RecordingStatus, "saving"> }
  | {
      readonly status: Extract<RecordingStatus, "error">;
      readonly message: string;
    };

export type DiagnosticFrameSubscription = (
  callback: (frame: TelemetryFrame) => void
) => () => void;

interface SessionRecorderStartOptions {
  readonly frontStream: MediaStream;
  readonly sideStream: MediaStream;
  readonly subscribeFrame: DiagnosticFrameSubscription;
}

interface SessionRecorder {
  getState(): RecordingState;
  subscribe(listener: (state: RecordingState) => void): () => void;
  isRecording(): boolean;
  start(options: SessionRecorderStartOptions): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
}

interface SessionRecorderOptions {
  readonly requestDirectoryHandle?: () => Promise<FileSystemDirectoryHandle>;
  readonly createVideoRecorder?: (options: {
    readonly stream: MediaStream;
    readonly fileHandle: FileSystemFileHandle;
  }) => StreamRecorder;
  readonly now?: () => Date;
}

const JSON_ROTATION_CAPACITY = 10;

class StartCancelledError extends Error {
  constructor() {
    super("Session recording start was cancelled");
  }
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options: {
    readonly mode: "readwrite";
  }) => Promise<FileSystemDirectoryHandle>;
}

type PermissionedDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission(options: {
    readonly mode: "readwrite";
  }): Promise<PermissionState>;
  requestPermission(options: {
    readonly mode: "readwrite";
  }): Promise<PermissionState>;
  deleteEntry(name: string): Promise<void>;
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

const requestDirectoryPicker = (): Promise<FileSystemDirectoryHandle> => {
  const w = window as DirectoryPickerWindow;

  if (typeof w.showDirectoryPicker !== "function") {
    throw new Error("File System Access API is unavailable in this browser");
  }

  return w.showDirectoryPicker({ mode: "readwrite" });
};

const isoTimestampForFilename = (date: Date): string =>
  date.toISOString().replace(".", "-").replaceAll(":", "-");

const createTelemetryFileName = (date: Date): string =>
  `telemetry-${isoTimestampForFilename(date)}.json`;

const ensureWritableDirectory = async (
  currentHandle: FileSystemDirectoryHandle | undefined,
  requestDirectoryHandle: () => Promise<FileSystemDirectoryHandle>
): Promise<FileSystemDirectoryHandle> => {
  if (currentHandle === undefined) {
    return requestDirectoryHandle();
  }

  const handle = currentHandle as PermissionedDirectoryHandle;
  const permission = await handle.queryPermission({
    mode: "readwrite"
  });

  if (permission === "granted") {
    return currentHandle;
  }

  if (permission === "prompt") {
    const requested = await handle.requestPermission({
      mode: "readwrite"
    });

    if (requested === "granted") {
      return currentHandle;
    }
  }

  return requestDirectoryHandle();
};

const listDirectoryNames = async (
  directory: FileSystemDirectoryHandle
): Promise<string[]> => {
  const names: string[] = [];

  for await (const [name] of (
    directory as PermissionedDirectoryHandle
  ).entries()) {
    names.push(name);
  }

  return names;
};

const writeJsonFile = async (
  fileHandle: FileSystemFileHandle,
  payload: TelemetrySessionJson
): Promise<void> => {
  const writable = await fileHandle.createWritable();

  try {
    await writable.write(JSON.stringify(payload, null, 2));
  } finally {
    await writable.close();
  }
};

export const createSessionRecorder = ({
  requestDirectoryHandle = requestDirectoryPicker,
  createVideoRecorder = ({ stream, fileHandle }) =>
    createStreamRecorder({ stream, fileHandle }),
  now = () => new Date()
}: SessionRecorderOptions = {}): SessionRecorder => {
  let directoryHandle: FileSystemDirectoryHandle | undefined;
  let state: RecordingState = { status: "idle" };
  const listeners = new Set<(state: RecordingState) => void>();
  let frames: TelemetryFrame[] = [];
  let sessionStart: Date | undefined;
  let frontRecorder: StreamRecorder | undefined;
  let sideRecorder: StreamRecorder | undefined;
  let unsubscribeFrame: (() => void) | undefined;
  let acceptingFrames = false;
  let startGeneration = 0;

  const emit = (): void => {
    for (const listener of listeners) {
      try {
        listener(state);
      } catch (error: unknown) {
        console.error("[diagnostic recording] state listener threw", error);
      }
    }
  };

  const setState = (next: RecordingState): void => {
    state = next;
    emit();
  };

  const resetSession = (): void => {
    frames = [];
    sessionStart = undefined;
    frontRecorder = undefined;
    sideRecorder = undefined;
    unsubscribeFrame = undefined;
    acceptingFrames = false;
  };

  const stopVideoRecorders = async (): Promise<void> => {
    await Promise.all([frontRecorder?.stop(), sideRecorder?.stop()]);
  };

  const stopStartedRecorders = async (
    recorders: readonly StreamRecorder[],
    startResults: readonly PromiseSettledResult<void>[]
  ): Promise<void> => {
    const stopPromises = startResults.flatMap((result, index) => {
      const recorder = recorders[index];

      if (result.status !== "fulfilled" || recorder === undefined) {
        return [];
      }

      return [recorder.stop().catch(() => undefined)];
    });

    await Promise.all(stopPromises);
  };

  const isStartCancelled = (generation: number): boolean =>
    generation !== startGeneration;

  const resetCancelledStart = (): void => {
    if (state.status === "idle") {
      resetSession();
    }
  };

  const throwIfStartCancelled = (generation: number): void => {
    if (isStartCancelled(generation)) {
      resetCancelledStart();
      throw new StartCancelledError();
    }
  };

  const stopStartedRecordersIfCancelled = async (
    generation: number,
    recorders: readonly StreamRecorder[],
    startResults: readonly PromiseSettledResult<void>[]
  ): Promise<void> => {
    if (!isStartCancelled(generation)) {
      return;
    }

    await stopStartedRecorders(recorders, startResults);
    resetCancelledStart();
    throw new StartCancelledError();
  };

  const flushTelemetry = async (
    directory: FileSystemDirectoryHandle,
    startedAt: Date,
    endedAt: Date,
    capturedFrames: readonly TelemetryFrame[]
  ): Promise<void> => {
    const fileHandle = await directory.getFileHandle(
      createTelemetryFileName(startedAt),
      { create: true }
    );
    await writeJsonFile(fileHandle, {
      schemaVersion: 1,
      sessionStart: startedAt.toISOString(),
      sessionEnd: endedAt.toISOString(),
      frames: capturedFrames
    });

    const names = await listDirectoryNames(directory);
    const namesToDelete = telemetryJsonFilesToDelete(
      names,
      JSON_ROTATION_CAPACITY
    );

    await Promise.all(
      namesToDelete.map((name) =>
        (directory as PermissionedDirectoryHandle).deleteEntry(name)
      )
    );
  };

  return {
    getState() {
      if (state.status !== "recording" || sessionStart === undefined) {
        return state;
      }

      return {
        status: "recording",
        elapsedMs: Math.max(0, now().getTime() - sessionStart.getTime())
      };
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    isRecording() {
      return state.status === "recording";
    },

    async start(options) {
      if (state.status !== "idle" && state.status !== "error") {
        return;
      }

      const myGeneration = ++startGeneration;
      resetSession();
      setState({ status: "starting" });

      try {
        directoryHandle = await ensureWritableDirectory(
          directoryHandle,
          requestDirectoryHandle
        );
        throwIfStartCancelled(myGeneration);

        const frontFile = await directoryHandle.getFileHandle("front.webm", {
          create: true
        });
        throwIfStartCancelled(myGeneration);

        const sideFile = await directoryHandle.getFileHandle("side.webm", {
          create: true
        });
        throwIfStartCancelled(myGeneration);

        frontRecorder = createVideoRecorder({
          stream: options.frontStream,
          fileHandle: frontFile
        });
        sideRecorder = createVideoRecorder({
          stream: options.sideStream,
          fileHandle: sideFile
        });
        const recorders = [frontRecorder, sideRecorder] as const;
        const startResults = await Promise.allSettled(
          recorders.map((recorder) => recorder.start())
        );
        await stopStartedRecordersIfCancelled(
          myGeneration,
          recorders,
          startResults
        );

        const startFailure = startResults.find(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected"
        );

        if (startFailure !== undefined) {
          await stopStartedRecorders(recorders, startResults);
          throw startFailure.reason;
        }

        frames = [];
        sessionStart = now();
        acceptingFrames = true;
        unsubscribeFrame = options.subscribeFrame((frame) => {
          if (acceptingFrames) {
            frames.push(frame);
          }
        });

        setState({ status: "recording", elapsedMs: 0 });
      } catch (error: unknown) {
        if (
          error instanceof StartCancelledError ||
          isStartCancelled(myGeneration)
        ) {
          resetCancelledStart();
          return;
        }

        resetSession();
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    },

    async stop() {
      startGeneration += 1;

      if (state.status === "starting") {
        resetSession();
        setState({ status: "idle" });
        return;
      }

      if (state.status !== "recording") {
        return;
      }

      const directory = directoryHandle;
      const startedAt = sessionStart;
      const capturedFrames = [...frames];
      acceptingFrames = false;
      unsubscribeFrame?.();
      unsubscribeFrame = undefined;
      setState({ status: "saving" });

      try {
        await stopVideoRecorders();

        if (directory === undefined || startedAt === undefined) {
          throw new Error("Recording session was not initialized");
        }

        await flushTelemetry(directory, startedAt, now(), capturedFrames);
        resetSession();
        setState({ status: "idle" });
      } catch (error: unknown) {
        resetSession();
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    },

    async destroy() {
      await this.stop();
      listeners.clear();
    }
  };
};
