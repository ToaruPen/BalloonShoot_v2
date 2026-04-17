import { afterEach, describe, expect, it, vi } from "vitest";
import { createDevicePinnedStream } from "../../../../src/features/camera/createDevicePinnedStream";

const createTrack = () => ({
  stop: vi.fn()
});

describe("createDevicePinnedStream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens getUserMedia with an exact deviceId constraint", async () => {
    const stream = { getTracks: () => [] };
    const getUserMedia = vi.fn().mockResolvedValue(stream);

    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia }
    });

    const pinned = await createDevicePinnedStream("front-device-id");

    expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        deviceId: { exact: "front-device-id" },
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });
    expect(pinned.stream).toBe(stream);
    expect(pinned.deviceId).toBe("front-device-id");
  });

  it("stops every track on the pinned stream", async () => {
    const firstTrack = createTrack();
    const secondTrack = createTrack();

    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [firstTrack, secondTrack]
        })
      }
    });

    const pinned = await createDevicePinnedStream("side-device-id");

    pinned.stop();

    expect(firstTrack.stop).toHaveBeenCalledOnce();
    expect(secondTrack.stop).toHaveBeenCalledOnce();
  });
});
