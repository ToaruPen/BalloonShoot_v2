import { afterEach, describe, expect, it, vi } from "vitest";
import { enumerateVideoDevices } from "../../../../src/features/camera/enumerateVideoDevices";

const createDevice = (
  kind: MediaDeviceKind,
  deviceId: string,
  label: string
): MediaDeviceInfo =>
  ({
    kind,
    deviceId,
    label,
    groupId: `${deviceId}-group`,
    toJSON: () => ({})
  }) as MediaDeviceInfo;

describe("enumerateVideoDevices", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns only videoinput devices", async () => {
    const front = createDevice("videoinput", "front-id", "Front");
    const side = createDevice("videoinput", "side-id", "Side");

    vi.stubGlobal("navigator", {
      mediaDevices: {
        enumerateDevices: vi
          .fn()
          .mockResolvedValue([
            front,
            createDevice("audioinput", "mic-id", "Mic"),
            side,
            createDevice("audiooutput", "speaker-id", "Speaker")
          ])
      }
    });

    const result = await enumerateVideoDevices();

    expect(result).toEqual([front, side]);
  });

  it("throws when enumerateDevices is unavailable", async () => {
    vi.stubGlobal("navigator", {});

    await expect(enumerateVideoDevices()).rejects.toThrow(
      "navigator.mediaDevices.enumerateDevices is unavailable."
    );
  });
});
