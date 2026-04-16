import type { CameraLaneRole } from "../../shared/types/camera";
import { requestCameraPermission } from "../camera/cameraPermission";
import { enumerateVideoDevices } from "../camera/enumerateVideoDevices";
import {
  createDevicePinnedStream,
  type DevicePinnedStream
} from "../camera/createDevicePinnedStream";

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
}

export const createDiagnosticWorkbench = (): DiagnosticWorkbench => {
  let state: WorkbenchState = {
    screen: "permission",
    devices: [],
    frontAssignment: undefined,
    sideAssignment: undefined,
    frontStream: undefined,
    sideStream: undefined
  };

  const listeners = new Set<StateListener>();
  let openGeneration = 0;

  const emit = (): void => {
    for (const fn of listeners) {
      fn(state);
    }
  };

  const update = (patch: Partial<WorkbenchState>): void => {
    state = { ...state, ...patch };
    emit();
  };

  const stopStreams = (): void => {
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
      sideStream
    });
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
        sideStream: undefined
      });
    },

    destroy() {
      stopStreams();
      listeners.clear();
    }
  };
};
