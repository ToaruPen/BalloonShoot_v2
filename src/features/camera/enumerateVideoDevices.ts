/**
 * Enumerate video input devices.
 * Must be called after camera permission is granted so labels are available.
 */
export const enumerateVideoDevices = async (): Promise<MediaDeviceInfo[]> => {
  const allDevices = await navigator.mediaDevices.enumerateDevices();

  return allDevices.filter((d) => d.kind === "videoinput");
};
