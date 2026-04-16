import { gameConfig } from "../../shared/config/gameConfig";

/**
 * Open a camera stream pinned to an exact deviceId.
 * The stream is tied to a generation counter so that stale requests
 * can be detected and cancelled.
 */
export interface DevicePinnedStream {
  readonly stream: MediaStream;
  readonly deviceId: string;
  stop(): void;
}

export const createDevicePinnedStream = async (
  deviceId: string
): Promise<DevicePinnedStream> => {
  const stream = await navigator.mediaDevices.getUserMedia({
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
