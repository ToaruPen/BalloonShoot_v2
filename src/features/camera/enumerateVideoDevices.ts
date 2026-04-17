/**
 * Enumerate video input devices.
 * Must be called after camera permission is granted so labels are available.
 */
export const enumerateVideoDevices = async (): Promise<MediaDeviceInfo[]> => {
  const mediaDevices = (
    globalThis as {
      readonly navigator?: { readonly mediaDevices?: Partial<MediaDevices> };
    }
  ).navigator?.mediaDevices;

  if (
    mediaDevices === undefined ||
    typeof mediaDevices.enumerateDevices !== "function"
  ) {
    throw new Error("navigator.mediaDevices.enumerateDevices is unavailable.");
  }

  const allDevices = await mediaDevices.enumerateDevices();

  return allDevices.filter((d) => d.kind === "videoinput");
};
