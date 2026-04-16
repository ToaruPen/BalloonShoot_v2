import type { CameraLaneRole } from "../../shared/types/camera";
import type { CaptureTelemetry } from "../../shared/types/captureTelemetry";
import { requestCameraPermission } from "../camera/cameraPermission";
import { enumerateVideoDevices } from "../camera/enumerateVideoDevices";
import {
  createDevicePinnedStream,
  type DevicePinnedStream
} from "../camera/createDevicePinnedStream";
import {
  createCaptureLoop,
  type CaptureLoop
} from "../camera/captureLoop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkbenchScreen =
  | "permission"
  | "permissionDenied"
  | "deviceSelection"
  | "singleCamera"
  | "previewing";

export interface DeviceAssignment {
  role: CameraLaneRole;
  deviceId: string;
  label: string;
}

export interface WorkbenchState {
  screen: WorkbenchScreen;
  devices: MediaDeviceInfo[];
  frontAssignment: DeviceAssignment | undefined;
  sideAssignment: DeviceAssignment | undefined;
  frontStream: DevicePinnedStream | undefined;
  sideStream: DevicePinnedStream | undefined;
  frontCaptureTelemetry: CaptureTelemetry | undefined;
  sideCaptureTelemetry: CaptureTelemetry | undefined;
}

type StateListener = (state: WorkbenchState) => void;

// ---------------------------------------------------------------------------
// Workbench controller
// ---------------------------------------------------------------------------

export interface DiagnosticWorkbench {
  getState(): WorkbenchState;
  subscribe(listener: StateListener): () => void;
  requestPermission(): Promise<void>;
  assignDevices(
    frontDeviceId: string,
    sideDeviceId: string
  ): Promise<void>;
  swapRoles(): Promise<void>;
  reselect(): void;
  destroy(): void;
  /**
   * Start capture loops on the given video elements.
   * Called by the entry point after DOM attachment so that
   * requestVideoFrameCallback can begin producing timestamps.
   */
  startCaptureLoops(
    frontVideo: HTMLVideoElement,
    sideVideo: HTMLVideoElement
  ): void;
}

export const createDiagnosticWorkbench = (): DiagnosticWorkbench => {
  let state: WorkbenchState = {
    screen: "permission",
    devices: [],
    frontAssignment: undefined,
    sideAssignment: undefined,
    frontStream: undefined,
    sideStream: undefined,
    frontCaptureTelemetry: undefined,
    sideCaptureTelemetry: undefined
  };

  const listeners = new Set<StateListener>();
  let openGeneration = 0;

  let frontCaptureLoop: CaptureLoop | undefined;
  let sideCaptureLoop: CaptureLoop | undefined;
  let telemetryRafId: number | undefined;

  const emit = (): void => {
    for (const fn of listeners) {
      fn(state);
    }
  };

  const update = (patch: Partial<WorkbenchState>): void => {
    state = { ...state, ...patch };
    emit();
  };

  const destroyCaptureLoops = (): void => {
    frontCaptureLoop?.destroy();
    sideCaptureLoop?.destroy();
    frontCaptureLoop = undefined;
    sideCaptureLoop = undefined;
  };

  const stopTelemetryTick = (): void => {
    if (telemetryRafId !== undefined) {
      cancelAnimationFrame(telemetryRafId);
      telemetryRafId = undefined;
    }
  };

  const startTelemetryTick = (): void => {
    stopTelemetryTick();

    const tick = (): void => {
      if (frontCaptureLoop === undefined && sideCaptureLoop === undefined) {
        return;
      }

      const frontTelemetry = frontCaptureLoop?.getTelemetry();
      const sideTelemetry = sideCaptureLoop?.getTelemetry();

      const changed =
        frontTelemetry !== state.frontCaptureTelemetry ||
        sideTelemetry !== state.sideCaptureTelemetry;

      if (changed) {
        // Direct state mutation + emit to avoid full re-render thrashing;
        // telemetry updates are display-only and high-frequency.
        state = {
          ...state,
          frontCaptureTelemetry: frontTelemetry,
          sideCaptureTelemetry: sideTelemetry
        };
        emit();
      }

      telemetryRafId = requestAnimationFrame(tick);
    };

    telemetryRafId = requestAnimationFrame(tick);
  };

  const stopStreams = (): void => {
    destroyCaptureLoops();
    stopTelemetryTick();
    state.frontStream?.stop();
    state.sideStream?.stop();
  };

  const labelFor = (
    devices: MediaDeviceInfo[],
    deviceId: string
  ): string => {
    const found = devices.find((d) => d.deviceId === deviceId);
    return found?.label !== undefined && found.label !== ""
      ? found.label
      : `Camera (${deviceId.slice(0, 8)})`;
  };

  const openStreams = async (
    frontId: string,
    sideId: string
  ): Promise<void> => {
    stopStreams();

    openGeneration += 1;
    const myGeneration = openGeneration;

    const [frontStream, sideStream] = await Promise.all([
      createDevicePinnedStream(frontId),
      createDevicePinnedStream(sideId)
    ]);

    if (myGeneration !== openGeneration) {
      frontStream.stop();
      sideStream.stop();
      return;
    }

    const frontLabel = labelFor(state.devices, frontId);
    const sideLabel = labelFor(state.devices, sideId);

    update({
      screen: "previewing",
      frontAssignment: {
        role: "frontAim",
        deviceId: frontId,
        label: frontLabel
      },
      sideAssignment: {
        role: "sideTrigger",
        deviceId: sideId,
        label: sideLabel
      },
      frontStream,
      sideStream,
      frontCaptureTelemetry: undefined,
      sideCaptureTelemetry: undefined
    });
  };

  /**
   * Called from diagnostic-main after video elements are in the DOM
   * and streams are attached. Creates capture loops that use
   * requestVideoFrameCallback on the video elements.
   */
  const startCaptureLoops = (
    frontVideo: HTMLVideoElement,
    sideVideo: HTMLVideoElement
  ): void => {
    destroyCaptureLoops();

    if (state.frontAssignment === undefined || state.sideAssignment === undefined) {
      return;
    }

    frontCaptureLoop = createCaptureLoop({
      video: frontVideo,
      laneRole: "frontAim",
      deviceId: state.frontAssignment.deviceId,
      deviceLabel: state.frontAssignment.label
    });

    sideCaptureLoop = createCaptureLoop({
      video: sideVideo,
      laneRole: "sideTrigger",
      deviceId: state.sideAssignment.deviceId,
      deviceLabel: state.sideAssignment.label
    });

    startTelemetryTick();
  };

  return {
    getState() {
      return state;
    },

    subscribe(listener: StateListener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async requestPermission() {
      update({ screen: "permission" });

      const result = await requestCameraPermission();

      if (result === "denied") {
        update({ screen: "permissionDenied" });
        return;
      }

      const devices = await enumerateVideoDevices();

      if (devices.length < 2) {
        update({ screen: "singleCamera", devices });
        return;
      }

      update({ screen: "deviceSelection", devices });
    },

    async assignDevices(frontDeviceId: string, sideDeviceId: string) {
      if (frontDeviceId === sideDeviceId) {
        throw new Error(
          "Front and side must be assigned to distinct devices"
        );
      }

      await openStreams(frontDeviceId, sideDeviceId);
    },

    async swapRoles() {
      const { frontAssignment, sideAssignment } = state;

      if (frontAssignment === undefined || sideAssignment === undefined) {
        return;
      }

      await openStreams(
        sideAssignment.deviceId,
        frontAssignment.deviceId
      );
    },

    reselect() {
      stopStreams();
      update({
        screen: "deviceSelection",
        frontAssignment: undefined,
        sideAssignment: undefined,
        frontStream: undefined,
        sideStream: undefined,
        frontCaptureTelemetry: undefined,
        sideCaptureTelemetry: undefined
      });
    },

    destroy() {
      stopStreams();
      listeners.clear();
    },

    startCaptureLoops
  };
};
