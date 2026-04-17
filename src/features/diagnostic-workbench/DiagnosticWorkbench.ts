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
  | "cameraUnsupported"
  | "permissionDenied"
  | "cameraNotFound"
  | "enumerationFailed"
  | "deviceSelection"
  | "singleCamera"
  | "cameraConstraintFailed"
  | "cameraOpenFailed"
  | "previewing";

export type WorkbenchErrorKind =
  | "cameraUnsupported"
  | "permissionDenied"
  | "cameraNotFound"
  | "enumerationFailed"
  | "cameraConstraintFailed"
  | "cameraOpenFailed"
  | "distinctDevicesRequired";

export interface WorkbenchError {
  readonly kind: WorkbenchErrorKind;
  readonly title: string;
  readonly cause: string;
  readonly impact: string;
  readonly reproduction: string;
  readonly nextAction: string;
}

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
  error: WorkbenchError | undefined;
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
    sideStream: undefined,
    error: undefined
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

  const stopStreams = (
    ...streams: (DevicePinnedStream | undefined)[]
  ): void => {
    for (const stream of streams) {
      stream?.stop();
    }
  };

  const stopCurrentStreams = (): void => {
    stopStreams(state.frontStream, state.sideStream);
  };

  const labelFor = (
    devices: MediaDeviceInfo[],
    deviceId: string
  ): string => {
    const foundIndex = devices.findIndex((d) => d.deviceId === deviceId);
    const found = foundIndex >= 0 ? devices[foundIndex] : undefined;

    if (found !== undefined && found.label !== "") {
      return found.label;
    }

    return foundIndex >= 0 ? `Camera ${String(foundIndex + 1)}` : "Camera";
  };

  const createError = (kind: WorkbenchErrorKind): WorkbenchError => {
    switch (kind) {
      case "cameraUnsupported":
        return {
          kind,
          title: "このブラウザではカメラを使用できません",
          cause: "navigator.mediaDevices.getUserMedia が利用できません。",
          impact: "フロント・サイド両方のキャプチャが開始できません。",
          reproduction: "カメラ API 非対応のブラウザまたは非 HTTPS 相当の環境で診断ワークベンチを開いてください。",
          nextAction: "Chrome の安全なローカル開発 URL で開き直してください。"
        };
      case "permissionDenied":
        return {
          kind,
          title: "カメラ許可が拒否されました",
          cause: "ブラウザのカメラ権限が拒否されました。",
          impact: "フロント・サイド両方のキャプチャが開始できません。",
          reproduction: "リロードしてカメラ権限を拒否してください。",
          nextAction: "ブラウザのサイト設定でカメラ権限を許可し、リトライしてください。"
        };
      case "cameraNotFound":
        return {
          kind,
          title: "カメラが見つかりません",
          cause: "ブラウザが video input device を検出できませんでした。",
          impact: "フロント・サイド両方のキャプチャが開始できません。",
          reproduction: "カメラを接続せずに診断ワークベンチを開いてください。",
          nextAction: "カメラ接続と OS のカメラ権限を確認してからリトライしてください。"
        };
      case "enumerationFailed":
        return {
          kind,
          title: "カメラ一覧を取得できません",
          cause: "navigator.mediaDevices.enumerateDevices が失敗しました。",
          impact: "フロント・サイドの割り当て画面を表示できません。",
          reproduction: "カメラ許可後にデバイス列挙が失敗するブラウザ状態でリトライしてください。",
          nextAction: "ブラウザのカメラ権限と接続状態を確認し、ページをリロードしてください。"
        };
      case "cameraConstraintFailed":
        return {
          kind,
          title: "選択したカメラを現在の条件で開始できません",
          cause: "選択した capture constraints がデバイスでサポートされていません。",
          impact: "該当 lane の capture を開始できません。",
          reproduction: "現在の設定で同じカメラを選択してください。",
          nextAction: "別のカメラを再選択するか、PoC の既定条件でリトライしてください。"
        };
      case "cameraOpenFailed":
        return {
          kind,
          title: "カメラを開始できません",
          cause: "getUserMedia がカメラ開始中に失敗しました。",
          impact: "選択した2台の live preview を開始できません。",
          reproduction: "同じカメラ割り当てで確定を押してください。",
          nextAction: "カメラが他のアプリで使用中でないか確認し、再選択してください。"
        };
      case "distinctDevicesRequired":
        return {
          kind,
          title: "別々のカメラを選択してください",
          cause: "フロントとサイドに同じ deviceId が選択されました。",
          impact: "v2 の side trigger 設計を検証できません。",
          reproduction: "フロントとサイドで同じカメラを選び、確定してください。",
          nextAction: "フロントとサイドに異なるカメラを選択してください。"
        };
    }
  };

  const classifyOpenError = (error: unknown): WorkbenchError => {
    if (error instanceof Error && error.name === "OverconstrainedError") {
      return createError("cameraConstraintFailed");
    }

    return createError("cameraOpenFailed");
  };

  const errorScreenFor = (error: WorkbenchError): WorkbenchScreen => {
    switch (error.kind) {
      case "cameraUnsupported":
      case "permissionDenied":
      case "cameraNotFound":
      case "enumerationFailed":
      case "cameraConstraintFailed":
      case "cameraOpenFailed":
        return error.kind;
      case "distinctDevicesRequired":
        return state.screen;
    }
  };

  const openStreams = async (
    frontId: string,
    sideId: string,
    preservePreviewOnFailure: boolean
  ): Promise<void> => {
    openGeneration += 1;
    const myGeneration = openGeneration;
    const previousFrontStream = state.frontStream;
    const previousSideStream = state.sideStream;
    const openedStreams: DevicePinnedStream[] = [];

    try {
      const frontStream = await createDevicePinnedStream(frontId);
      openedStreams.push(frontStream);

      if (myGeneration !== openGeneration) {
        stopStreams(...openedStreams);
        return;
      }

      const sideStream = await createDevicePinnedStream(sideId);
      openedStreams.push(sideStream);

      if (myGeneration !== openGeneration) {
        stopStreams(...openedStreams);
        return;
      }

      const frontLabel = labelFor(state.devices, frontId);
      const sideLabel = labelFor(state.devices, sideId);

      stopStreams(previousFrontStream, previousSideStream);

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
        error: undefined
      });
    } catch (error: unknown) {
      stopStreams(...openedStreams);

      if (myGeneration !== openGeneration) {
        return;
      }

      const workbenchError = classifyOpenError(error);

      if (
        preservePreviewOnFailure &&
        state.screen === "previewing" &&
        state.frontStream !== undefined &&
        state.sideStream !== undefined
      ) {
        update({ error: workbenchError });
        return;
      }

      update({
        screen: errorScreenFor(workbenchError),
        frontAssignment: undefined,
        sideAssignment: undefined,
        frontStream: undefined,
        sideStream: undefined,
        error: workbenchError
      });
    }
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
      update({ screen: "permission", error: undefined });

      const result = await requestCameraPermission();

      if (result.status !== "granted") {
        const error =
          result.status === "unsupported"
            ? createError("cameraUnsupported")
            : result.status === "denied"
              ? createError("permissionDenied")
              : result.status === "notFound"
                ? createError("cameraNotFound")
                : createError("cameraOpenFailed");

        update({ screen: errorScreenFor(error), error });
        return;
      }

      let devices: MediaDeviceInfo[];

      try {
        devices = await enumerateVideoDevices();
      } catch {
        const error = createError("enumerationFailed");
        update({ screen: "enumerationFailed", error });
        return;
      }

      if (devices.length < 2) {
        update({ screen: "singleCamera", devices, error: undefined });
        return;
      }

      update({ screen: "deviceSelection", devices, error: undefined });
    },

    async assignDevices(frontDeviceId: string, sideDeviceId: string) {
      if (frontDeviceId === sideDeviceId) {
        update({ error: createError("distinctDevicesRequired") });
        return;
      }

      await openStreams(frontDeviceId, sideDeviceId, state.screen === "previewing");
    },

    async swapRoles() {
      const { frontAssignment, sideAssignment } = state;

      if (frontAssignment === undefined || sideAssignment === undefined) {
        return;
      }

      await openStreams(
        sideAssignment.deviceId,
        frontAssignment.deviceId,
        true
      );
    },

    reselect() {
      openGeneration += 1;
      stopCurrentStreams();
      update({
        screen: "deviceSelection",
        frontAssignment: undefined,
        sideAssignment: undefined,
        frontStream: undefined,
        sideStream: undefined,
        error: undefined
      });
    },

    destroy() {
      openGeneration += 1;
      stopCurrentStreams();
      listeners.clear();
    }
  };
};
