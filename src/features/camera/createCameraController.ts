import { gameConfig } from "../../shared/config/gameConfig";

export interface CameraController {
  requestStream(): Promise<MediaStream>;
  stop(): void;
}

export const createCameraController = (): CameraController => {
  let stream: MediaStream | undefined;
  let streamRequest: Promise<MediaStream> | undefined;
  let generation = 0;

  return {
    async requestStream(): Promise<MediaStream> {
      if (stream) {
        return stream;
      }

      if (streamRequest) {
        return streamRequest;
      }

      const mediaDevices = (
        globalThis as {
          navigator?: {
            mediaDevices?: MediaDevices;
          };
        }
      ).navigator?.mediaDevices;

      if (typeof mediaDevices?.getUserMedia !== "function") {
        throw new Error("Camera API is unavailable");
      }

      const requestGeneration = ++generation;
      const request = mediaDevices
        .getUserMedia({
          video: {
            width: gameConfig.camera.width,
            height: gameConfig.camera.height,
            facingMode: "user"
          },
          audio: false
        })
        .then((nextStream) => {
          if (requestGeneration !== generation) {
            nextStream.getTracks().forEach((track) => {
              track.stop();
            });
            throw new Error("Camera request cancelled");
          }

          stream = nextStream;
          return nextStream;
        })
        .finally(() => {
          if (streamRequest === request) {
            streamRequest = undefined;
          }
        });
      streamRequest = request;

      return request;
    },
    stop(): void {
      generation += 1;
      streamRequest = undefined;

      if (!stream) {
        return;
      }

      stream.getTracks().forEach((track) => {
        track.stop();
      });
      stream = undefined;
    }
  };
};
