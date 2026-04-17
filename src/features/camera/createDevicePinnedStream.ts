import { gameConfig } from "../../shared/config/gameConfig";

/**
 * Open a camera stream pinned to an exact deviceId.
 * Callers own cancellation and stale-request handling around this helper.
 */
export interface DevicePinnedStream {
  readonly stream: MediaStream;
  readonly deviceId: string;
  stop(): void;
}

export const createDevicePinnedStream = async (
  deviceId: string
): Promise<DevicePinnedStream> => {
  const mediaDevices = (
    globalThis as {
      readonly navigator?: { readonly mediaDevices?: Partial<MediaDevices> };
    }
  ).navigator?.mediaDevices;

  if (mediaDevices === undefined || typeof mediaDevices.getUserMedia !== "function") {
    throw new Error("navigator.mediaDevices.getUserMedia is unavailable.");
  }

  const stream = await mediaDevices.getUserMedia({
    video: {
      deviceId: { exact: deviceId },
      width: { ideal: gameConfig.camera.width },
      height: { ideal: gameConfig.camera.height }
    },
    audio: false
  });

  return {
    stream,
    deviceId,
    stop() {
      stream.getTracks().forEach((t) => {
        t.stop();
      });
    }
  };
};
