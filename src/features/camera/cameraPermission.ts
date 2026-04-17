interface CameraPermissionError {
  readonly name: string;
  readonly message: string;
}

type CameraPermissionResult =
  | { readonly status: "granted" }
  | { readonly status: "unsupported"; readonly error: CameraPermissionError }
  | { readonly status: "denied"; readonly error: CameraPermissionError }
  | { readonly status: "notFound"; readonly error: CameraPermissionError }
  | { readonly status: "failed"; readonly error: CameraPermissionError };

interface RuntimeNavigator {
  readonly mediaDevices?: Partial<MediaDevices>;
}

const toPermissionError = (error: unknown): CameraPermissionError => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }

  return {
    name: "UnknownError",
    message: String(error)
  };
};

const classifyPermissionFailure = (
  error: unknown
): Exclude<CameraPermissionResult, { readonly status: "granted" }> => {
  const permissionError = toPermissionError(error);

  switch (permissionError.name) {
    case "NotAllowedError":
    case "SecurityError":
      return { status: "denied", error: permissionError };
    case "NotFoundError":
    case "DevicesNotFoundError":
      return { status: "notFound", error: permissionError };
    default:
      return { status: "failed", error: permissionError };
  }
};

/**
 * Request camera permission by opening a temporary stream.
 * After permission is granted the stream is stopped immediately;
 * actual capture streams are opened later with explicit deviceId constraints.
 */
export const requestCameraPermission = async (): Promise<CameraPermissionResult> => {
  const mediaDevices = (globalThis as { readonly navigator?: RuntimeNavigator })
    .navigator?.mediaDevices;

  if (mediaDevices === undefined || typeof mediaDevices.getUserMedia !== "function") {
    return {
      status: "unsupported",
      error: {
        name: "UnsupportedError",
        message: "navigator.mediaDevices.getUserMedia is unavailable."
      }
    };
  }

  try {
    const tempStream = await mediaDevices.getUserMedia({
      video: true,
      audio: false
    });

    tempStream.getTracks().forEach((t) => {
      t.stop();
    });

    return { status: "granted" };
  } catch (error: unknown) {
    return classifyPermissionFailure(error);
  }
};
