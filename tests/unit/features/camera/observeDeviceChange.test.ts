import { afterEach, describe, expect, it, vi } from "vitest";
import { observeDeviceChange } from "../../../../src/features/camera/observeDeviceChange";

interface FakeMediaDevices {
  ondevicechange: ((event: Event) => void) | null;
  addEventListener?: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
}

const stubMediaDevices = (mediaDevices: FakeMediaDevices): void => {
  vi.stubGlobal("navigator", { mediaDevices });
};

describe("observeDeviceChange", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attaches and detaches a devicechange listener with addEventListener", () => {
    const listeners = new Set<EventListener>();
    const mediaDevices: FakeMediaDevices = {
      ondevicechange: null,
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        if (type === "devicechange") {
          listeners.add(listener);
        }
      }),
      removeEventListener: vi.fn((type: string, listener: EventListener) => {
        if (type === "devicechange") {
          listeners.delete(listener);
        }
      })
    };
    stubMediaDevices(mediaDevices);
    const callback = vi.fn();

    const observer = observeDeviceChange(callback);
    for (const listener of listeners) {
      listener(new Event("devicechange"));
    }

    expect(callback).toHaveBeenCalledOnce();

    observer.stop();
    observer.stop();
    for (const listener of listeners) {
      listener(new Event("devicechange"));
    }

    expect(mediaDevices.removeEventListener).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledOnce();
  });

  it("preserves and restores an existing ondevicechange handler fallback", () => {
    const previous = vi.fn();
    const mediaDevices: FakeMediaDevices = { ondevicechange: previous };
    stubMediaDevices(mediaDevices);
    const callback = vi.fn();

    const observer = observeDeviceChange(callback);
    mediaDevices.ondevicechange?.(new Event("devicechange"));

    expect(previous).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledOnce();

    observer.stop();
    expect(mediaDevices.ondevicechange).toBe(previous);
  });

  it("does not overwrite a fallback handler installed after observation starts", () => {
    const previous = vi.fn();
    const thirdParty = vi.fn();
    const mediaDevices: FakeMediaDevices = { ondevicechange: previous };
    stubMediaDevices(mediaDevices);
    const callback = vi.fn();

    const observer = observeDeviceChange(callback);
    mediaDevices.ondevicechange = thirdParty;

    observer.stop();

    expect(mediaDevices.ondevicechange).toBe(thirdParty);
    (mediaDevices.ondevicechange as (event: Event) => void)(
      new Event("devicechange")
    );
    expect(thirdParty).toHaveBeenCalledOnce();
    expect(previous).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });
});
