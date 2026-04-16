/**
 * Request camera permission by opening a temporary stream.
 * After permission is granted the stream is stopped immediately;
 * actual capture streams are opened later with explicit deviceId constraints.
 */
export const requestCameraPermission = async (): Promise<
  "granted" | "denied"
> => {
  const mediaDevices = navigator.mediaDevices as
    | MediaDevices
    | undefined;

  if (mediaDevices === undefined || typeof mediaDevices.getUserMedia !== "function") {
    return "denied";
  }

  try {
    const tempStream = await mediaDevices.getUserMedia({
      video: true,
      audio: false
    });

    tempStream.getTracks().forEach((t) => {
      t.stop();
    });

    return "granted";
  } catch {
    return "denied";
  }
};
