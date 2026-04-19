export interface StreamRecorder {
  start(): Promise<void>;
  stop(): Promise<void>;
}

type MediaRecorderFactory = (
  stream: MediaStream,
  options?: MediaRecorderOptions
) => MediaRecorder;

interface StreamRecorderOptions {
  readonly stream: MediaStream;
  readonly fileHandle: FileSystemFileHandle;
  readonly mediaRecorderFactory?: MediaRecorderFactory;
  readonly isTypeSupported?: (mimeType: string) => boolean;
}

const WEBM_MIME_TYPE_CANDIDATES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm"
] as const;

const defaultMediaRecorderFactory: MediaRecorderFactory = (stream, options) =>
  new MediaRecorder(stream, options);

const defaultIsTypeSupported = (mimeType: string): boolean =>
  typeof MediaRecorder !== "undefined" &&
  MediaRecorder.isTypeSupported(mimeType);

const selectWebmMimeType = (
  isTypeSupported: (mimeType: string) => boolean
): string | undefined =>
  WEBM_MIME_TYPE_CANDIDATES.find((mimeType) => isTypeSupported(mimeType));

const errorMessageFor = (error: unknown): string =>
  typeof error === "string" ? error : "Stream recorder write failed";

export const createStreamRecorder = ({
  stream,
  fileHandle,
  mediaRecorderFactory = defaultMediaRecorderFactory,
  isTypeSupported = defaultIsTypeSupported
}: StreamRecorderOptions): StreamRecorder => {
  let writable: FileSystemWritableFileStream | undefined;
  let mediaRecorder: MediaRecorder | undefined;
  let pendingWrite: Promise<void> = Promise.resolve();
  let writeError: unknown;
  let acceptingChunks = false;
  let started = false;
  let stopped = false;

  const resetPartialState = (): void => {
    writable = undefined;
    mediaRecorder = undefined;
    pendingWrite = Promise.resolve();
    writeError = undefined;
    acceptingChunks = false;
    started = false;
    stopped = false;
  };

  const enqueueWrite = (blob: Blob): void => {
    if (!acceptingChunks || blob.size === 0 || writable === undefined) {
      return;
    }

    pendingWrite = pendingWrite
      .then(() => writable?.write(blob))
      .then(() => undefined)
      .catch((error: unknown) => {
        writeError = error;
      });
  };

  return {
    async start() {
      if (started) {
        return;
      }

      let nextWritable: FileSystemWritableFileStream | undefined;

      try {
        const mimeType = selectWebmMimeType(isTypeSupported);
        mediaRecorder = mediaRecorderFactory(
          stream,
          mimeType === undefined ? undefined : { mimeType }
        );
        nextWritable = await fileHandle.createWritable();
        writable = nextWritable;
        mediaRecorder.ondataavailable = (event) => {
          enqueueWrite(event.data);
        };
        mediaRecorder.start();
        acceptingChunks = true;
        started = true;
        stopped = false;
      } catch (error: unknown) {
        try {
          await nextWritable?.close();
        } catch {
          // Best-effort cleanup must not mask the original start failure.
        }
        resetPartialState();
        throw error;
      }
    },

    async stop() {
      if (!started || stopped) {
        return;
      }

      stopped = true;

      if (mediaRecorder?.state === "recording") {
        await new Promise<void>((resolve) => {
          const previousOnStop = mediaRecorder?.onstop ?? null;
          const recorder = mediaRecorder;

          if (recorder === undefined) {
            resolve();
            return;
          }

          recorder.onstop = function (event) {
            previousOnStop?.call(this, event);
            resolve();
          };
          recorder.stop();
        });
      }

      await pendingWrite;
      acceptingChunks = false;

      try {
        await writable?.close();
      } finally {
        writable = undefined;
      }

      if (writeError !== undefined) {
        throw writeError instanceof Error
          ? writeError
          : new Error(errorMessageFor(writeError));
      }
    }
  };
};
