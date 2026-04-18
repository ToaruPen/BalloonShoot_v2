interface DeviceChangeObserver {
  stop(): void;
}

interface MediaDevicesWithEvents extends Partial<MediaDevices> {
  ondevicechange?: ((event: Event) => void) | null;
}

const currentMediaDevices = (): MediaDevicesWithEvents | undefined =>
  (
    globalThis as {
      readonly navigator?: { readonly mediaDevices?: MediaDevicesWithEvents };
    }
  ).navigator?.mediaDevices;

export const observeDeviceChange = (
  callback: () => void
): DeviceChangeObserver => {
  const mediaDevices = currentMediaDevices();

  if (mediaDevices === undefined) {
    return {
      stop() {
        return undefined;
      }
    };
  }

  let stopped = false;

  if (typeof mediaDevices.addEventListener === "function") {
    const handler = (): void => {
      if (!stopped) {
        callback();
      }
    };

    mediaDevices.addEventListener("devicechange", handler);

    return {
      stop() {
        if (stopped) {
          return;
        }

        stopped = true;
        mediaDevices.removeEventListener?.("devicechange", handler);
      }
    };
  }

  const previous = mediaDevices.ondevicechange ?? null;

  mediaDevices.ondevicechange = (event: Event): void => {
    previous?.(event);

    if (!stopped) {
      callback();
    }
  };

  return {
    stop() {
      if (stopped) {
        return;
      }

      stopped = true;
      mediaDevices.ondevicechange = previous;
    }
  };
};
