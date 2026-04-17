import { afterEach, describe, expect, it, vi } from "vitest";
import { requestCameraPermission } from "../../../../src/features/camera/cameraPermission";

const createTrack = () => ({
  stop: vi.fn()
});

const createPermissionError = (name: string): Error =>
  Object.assign(new Error(name), { name });

describe("requestCameraPermission", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns granted and stops the temporary permission stream", async () => {
    const firstTrack = createTrack();
    const secondTrack = createTrack();
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [firstTrack, secondTrack]
    });

    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia }
    });

    const result = await requestCameraPermission();

    expect(result).toEqual({ status: "granted" });
    expect(getUserMedia).toHaveBeenCalledWith({
      video: true,
      audio: false
    });
    expect(firstTrack.stop).toHaveBeenCalledOnce();
    expect(secondTrack.stop).toHaveBeenCalledOnce();
  });

  it("returns denied when the browser rejects camera permission", async () => {
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi
          .fn()
          .mockRejectedValue(createPermissionError("NotAllowedError"))
      }
    });

    const result = await requestCameraPermission();

    expect(result.status).toBe("denied");
  });

  it("returns unsupported when mediaDevices or getUserMedia is missing", async () => {
    vi.stubGlobal("navigator", {});

    const result = await requestCameraPermission();

    expect(result.status).toBe("unsupported");
  });
});
