import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestCameraPermission } from "../../../../src/features/camera/cameraPermission";
import { createDevicePinnedStream } from "../../../../src/features/camera/createDevicePinnedStream";
import type { DevicePinnedStream } from "../../../../src/features/camera/createDevicePinnedStream";
import { enumerateVideoDevices } from "../../../../src/features/camera/enumerateVideoDevices";
import { createDiagnosticWorkbench } from "../../../../src/features/diagnostic-workbench/DiagnosticWorkbench";

vi.mock("../../../../src/features/camera/cameraPermission", () => ({
  requestCameraPermission: vi.fn()
}));

vi.mock("../../../../src/features/camera/enumerateVideoDevices", () => ({
  enumerateVideoDevices: vi.fn()
}));

vi.mock("../../../../src/features/camera/createDevicePinnedStream", () => ({
  createDevicePinnedStream: vi.fn()
}));

const createDevice = (deviceId: string, label: string): MediaDeviceInfo =>
  ({
    kind: "videoinput",
    deviceId,
    label,
    groupId: `${deviceId}-group`,
    toJSON: () => ({})
  }) as MediaDeviceInfo;

interface FakeDevicePinnedStream extends DevicePinnedStream {
  readonly stopMock: ReturnType<typeof vi.fn>;
}

const createPinnedStream = (deviceId: string): FakeDevicePinnedStream => {
  const stopMock = vi.fn();

  return {
    stream: { id: `${deviceId}-stream` } as MediaStream,
    deviceId,
    stopMock,
    stop() {
      stopMock();
    }
  };
};

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
};

const createCameraError = (name: string): Error =>
  Object.assign(new Error(name), { name });

const grantPermission = () => {
  vi.mocked(requestCameraPermission).mockResolvedValue({ status: "granted" });
};

const enumerateTwoDevices = () => {
  vi.mocked(enumerateVideoDevices).mockResolvedValue([
    createDevice("front-id", "Front Camera"),
    createDevice("side-id", "")
  ]);
};

describe("createDiagnosticWorkbench", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders permissionDenied state for denied camera permission", async () => {
    vi.mocked(requestCameraPermission).mockResolvedValue({
      status: "denied",
      error: createCameraError("NotAllowedError")
    });

    const workbench = createDiagnosticWorkbench();

    await workbench.requestPermission();

    expect(workbench.getState().screen).toBe("permissionDenied");
    expect(workbench.getState().error?.kind).toBe("permissionDenied");
    expect(enumerateVideoDevices).not.toHaveBeenCalled();
  });

  it("renders permissionFailed state for non-denied permission failures", async () => {
    vi.mocked(requestCameraPermission).mockResolvedValue({
      status: "failed",
      error: createCameraError("AbortError")
    });

    const workbench = createDiagnosticWorkbench();

    await workbench.requestPermission();

    expect(workbench.getState().screen).toBe("permissionFailed");
    expect(workbench.getState().error?.kind).toBe("permissionFailed");
    expect(workbench.getState().error?.impact).toContain("カメラ許可");
    expect(enumerateVideoDevices).not.toHaveBeenCalled();
  });

  it("renders cameraNotFound when no video inputs remain after permission", async () => {
    grantPermission();
    vi.mocked(enumerateVideoDevices).mockResolvedValue([]);

    const workbench = createDiagnosticWorkbench();

    await workbench.requestPermission();

    expect(workbench.getState().screen).toBe("cameraNotFound");
    expect(workbench.getState().devices).toEqual([]);
    expect(workbench.getState().error?.kind).toBe("cameraNotFound");
  });

  it("renders singleCamera when exactly one video input is available", async () => {
    grantPermission();
    vi.mocked(enumerateVideoDevices).mockResolvedValue([
      createDevice("front-id", "Front Camera")
    ]);

    const workbench = createDiagnosticWorkbench();

    await workbench.requestPermission();

    expect(workbench.getState().screen).toBe("singleCamera");
    expect(workbench.getState().devices).toHaveLength(1);
  });

  it("refreshes single-camera selection to device selection on devicechange", async () => {
    grantPermission();
    vi.mocked(enumerateVideoDevices)
      .mockResolvedValueOnce([createDevice("front-id", "Front Camera")])
      .mockResolvedValueOnce([
        createDevice("front-id", "Front Camera"),
        createDevice("side-id", "Side Camera")
      ]);
    const workbench = createDiagnosticWorkbench();

    await workbench.requestPermission();
    await workbench.refreshDevicesFromDeviceChange();

    expect(workbench.getState().screen).toBe("deviceSelection");
    expect(
      workbench.getState().devices.map((device) => device.deviceId)
    ).toEqual(["front-id", "side-id"]);
  });

  it("renders deviceSelection after permission and two-camera enumeration", async () => {
    grantPermission();
    enumerateTwoDevices();

    const workbench = createDiagnosticWorkbench();

    await workbench.requestPermission();

    expect(workbench.getState().screen).toBe("deviceSelection");
    expect(workbench.getState().devices.map((d) => d.deviceId)).toEqual([
      "front-id",
      "side-id"
    ]);
  });

  it("keeps newer permission results when an older permission request resolves later", async () => {
    const firstPermission =
      createDeferred<Awaited<ReturnType<typeof requestCameraPermission>>>();
    vi.mocked(requestCameraPermission)
      .mockReturnValueOnce(firstPermission.promise)
      .mockResolvedValueOnce({ status: "granted" });
    let enumerationCount = 0;
    vi.mocked(enumerateVideoDevices).mockImplementation(() => {
      enumerationCount += 1;
      const devices =
        enumerationCount === 1
          ? [
              createDevice("front-id", "Front Camera"),
              createDevice("side-id", "Side Camera")
            ]
          : [createDevice("stale-id", "Stale Camera")];

      return Promise.resolve(devices);
    });

    const workbench = createDiagnosticWorkbench();
    const firstRequest = workbench.requestPermission();
    const secondRequest = workbench.requestPermission();

    await secondRequest;
    expect(workbench.getState().screen).toBe("deviceSelection");
    expect(workbench.getState().devices.map((d) => d.deviceId)).toEqual([
      "front-id",
      "side-id"
    ]);

    firstPermission.resolve({ status: "granted" });
    await firstRequest;

    expect(enumerateVideoDevices).toHaveBeenCalledOnce();
    expect(workbench.getState().screen).toBe("deviceSelection");
    expect(workbench.getState().devices.map((d) => d.deviceId)).toEqual([
      "front-id",
      "side-id"
    ]);
  });

  it("ignores pending permission results after destroy", async () => {
    const permission =
      createDeferred<Awaited<ReturnType<typeof requestCameraPermission>>>();
    vi.mocked(requestCameraPermission).mockReturnValueOnce(permission.promise);
    enumerateTwoDevices();

    const workbench = createDiagnosticWorkbench();
    const listener = vi.fn();
    workbench.subscribe(listener);

    const request = workbench.requestPermission();
    expect(listener).toHaveBeenCalledOnce();

    workbench.destroy();
    permission.resolve({ status: "granted" });
    await request;

    expect(enumerateVideoDevices).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledOnce();
    expect(workbench.getState().screen).toBe("permission");
    expect(workbench.getState().devices).toEqual([]);
  });

  it("opens selected devices and assigns safe preview labels", async () => {
    grantPermission();
    enumerateTwoDevices();
    const frontStream = createPinnedStream("front-id");
    const sideStream = createPinnedStream("side-id");
    vi.mocked(createDevicePinnedStream)
      .mockResolvedValueOnce(frontStream)
      .mockResolvedValueOnce(sideStream);

    const workbench = createDiagnosticWorkbench();
    await workbench.requestPermission();
    await workbench.assignDevices("front-id", "side-id");

    expect(workbench.getState()).toMatchObject({
      screen: "previewing",
      frontAssignment: { label: "Front Camera" },
      sideAssignment: { label: "Camera 2" },
      frontStream,
      sideStream
    });
  });

  it("keeps same-device assignment errors in UI state instead of rejecting", async () => {
    grantPermission();
    enumerateTwoDevices();

    const workbench = createDiagnosticWorkbench();
    await workbench.requestPermission();

    await expect(
      workbench.assignDevices("front-id", "front-id")
    ).resolves.toBeUndefined();
    expect(workbench.getState().screen).toBe("deviceSelection");
    expect(workbench.getState().error?.kind).toBe("distinctDevicesRequired");
  });

  it("stops a successful first stream when the paired side stream fails", async () => {
    grantPermission();
    enumerateTwoDevices();
    const frontStream = createPinnedStream("front-id");
    vi.mocked(createDevicePinnedStream)
      .mockResolvedValueOnce(frontStream)
      .mockRejectedValueOnce(createCameraError("OverconstrainedError"));

    const workbench = createDiagnosticWorkbench();
    await workbench.requestPermission();
    await workbench.assignDevices("front-id", "side-id");

    expect(frontStream.stopMock).toHaveBeenCalledOnce();
    expect(workbench.getState().screen).toBe("cameraConstraintFailed");
    expect(workbench.getState().error?.kind).toBe("cameraConstraintFailed");
    expect(workbench.getState().frontStream).toBeUndefined();
  });

  it("keeps existing preview streams when swap opening fails", async () => {
    grantPermission();
    enumerateTwoDevices();
    const frontStream = createPinnedStream("front-id");
    const sideStream = createPinnedStream("side-id");
    const attemptedSwapStream = createPinnedStream("side-id");
    vi.mocked(createDevicePinnedStream)
      .mockResolvedValueOnce(frontStream)
      .mockResolvedValueOnce(sideStream)
      .mockResolvedValueOnce(attemptedSwapStream)
      .mockRejectedValueOnce(createCameraError("OverconstrainedError"));

    const workbench = createDiagnosticWorkbench();
    await workbench.requestPermission();
    await workbench.assignDevices("front-id", "side-id");
    await workbench.swapRoles();

    expect(attemptedSwapStream.stopMock).toHaveBeenCalledOnce();
    expect(frontStream.stopMock).not.toHaveBeenCalled();
    expect(sideStream.stopMock).not.toHaveBeenCalled();
    expect(workbench.getState().screen).toBe("previewing");
    expect(workbench.getState().frontStream).toBe(frontStream);
    expect(workbench.getState().sideStream).toBe(sideStream);
    expect(workbench.getState().error?.kind).toBe("cameraConstraintFailed");
  });

  it("refreshes devices while previewing without opening replacement streams", async () => {
    grantPermission();
    enumerateTwoDevices();
    const frontStream = createPinnedStream("front-id");
    const sideStream = createPinnedStream("side-id");
    vi.mocked(createDevicePinnedStream)
      .mockResolvedValueOnce(frontStream)
      .mockResolvedValueOnce(sideStream);
    const workbench = createDiagnosticWorkbench();
    await workbench.requestPermission();
    await workbench.assignDevices("front-id", "side-id");
    vi.mocked(enumerateVideoDevices).mockResolvedValueOnce([
      createDevice("front-id", "Front Camera"),
      createDevice("side-id", "Side Camera"),
      createDevice("replugged-id", "Replugged Camera")
    ]);

    await workbench.refreshDevicesFromDeviceChange();

    expect(workbench.getState().screen).toBe("previewing");
    expect(
      workbench.getState().devices.map((device) => device.deviceId)
    ).toEqual(["front-id", "side-id", "replugged-id"]);
    expect(workbench.getState().frontStream).toBe(frontStream);
    expect(workbench.getState().sideStream).toBe(sideStream);
    expect(createDevicePinnedStream).toHaveBeenCalledTimes(2);
  });

  it("ignores stale devicechange enumeration results", async () => {
    grantPermission();
    enumerateTwoDevices();
    const workbench = createDiagnosticWorkbench();
    await workbench.requestPermission();

    const firstRefresh = createDeferred<MediaDeviceInfo[]>();
    vi.mocked(enumerateVideoDevices)
      .mockReturnValueOnce(firstRefresh.promise)
      .mockResolvedValueOnce([
        createDevice("front-id", "Front Camera"),
        createDevice("side-id", "Side Camera"),
        createDevice("fresh-id", "Fresh Camera")
      ]);

    const stale = workbench.refreshDevicesFromDeviceChange();
    const fresh = workbench.refreshDevicesFromDeviceChange();
    await fresh;
    firstRefresh.resolve([
      createDevice("stale-front", "Stale Front"),
      createDevice("stale-side", "Stale Side")
    ]);
    await stale;

    expect(
      workbench.getState().devices.map((device) => device.deviceId)
    ).toEqual(["front-id", "side-id", "fresh-id"]);
  });

  it("stops existing preview streams when requesting permission again", async () => {
    grantPermission();
    enumerateTwoDevices();
    const frontStream = createPinnedStream("front-id");
    const sideStream = createPinnedStream("side-id");
    const permission =
      createDeferred<Awaited<ReturnType<typeof requestCameraPermission>>>();
    vi.mocked(createDevicePinnedStream)
      .mockResolvedValueOnce(frontStream)
      .mockResolvedValueOnce(sideStream);

    const workbench = createDiagnosticWorkbench();
    await workbench.requestPermission();
    await workbench.assignDevices("front-id", "side-id");
    vi.mocked(requestCameraPermission).mockReturnValueOnce(permission.promise);

    const request = workbench.requestPermission();

    expect(frontStream.stopMock).toHaveBeenCalledOnce();
    expect(sideStream.stopMock).toHaveBeenCalledOnce();
    expect(workbench.getState()).toMatchObject({
      screen: "permission",
      devices: [],
      frontAssignment: undefined,
      sideAssignment: undefined,
      frontStream: undefined,
      sideStream: undefined
    });

    permission.resolve({ status: "granted" });
    await request;
  });

  it("stops current and stale in-flight streams when reselect advances generation", async () => {
    grantPermission();
    enumerateTwoDevices();
    const frontDeferred = createDeferred<DevicePinnedStream>();
    const sideDeferred = createDeferred<DevicePinnedStream>();
    const frontStream = createPinnedStream("front-id");
    const sideStream = createPinnedStream("side-id");
    vi.mocked(createDevicePinnedStream)
      .mockReturnValueOnce(frontDeferred.promise)
      .mockReturnValueOnce(sideDeferred.promise);

    const workbench = createDiagnosticWorkbench();
    await workbench.requestPermission();
    const assignment = workbench.assignDevices("front-id", "side-id");

    frontDeferred.resolve(frontStream);
    await Promise.resolve();
    workbench.reselect();
    sideDeferred.resolve(sideStream);
    await assignment;

    expect(frontStream.stopMock).toHaveBeenCalledOnce();
    expect(sideStream.stopMock).toHaveBeenCalledOnce();
    expect(workbench.getState().screen).toBe("deviceSelection");
    expect(workbench.getState().frontStream).toBeUndefined();
  });

  it("stops streams returned after destroy invalidates an in-flight open", async () => {
    grantPermission();
    enumerateTwoDevices();
    const frontDeferred = createDeferred<DevicePinnedStream>();
    const sideDeferred = createDeferred<DevicePinnedStream>();
    const frontStream = createPinnedStream("front-id");
    const sideStream = createPinnedStream("side-id");
    vi.mocked(createDevicePinnedStream)
      .mockReturnValueOnce(frontDeferred.promise)
      .mockReturnValueOnce(sideDeferred.promise);

    const workbench = createDiagnosticWorkbench();
    await workbench.requestPermission();
    const assignment = workbench.assignDevices("front-id", "side-id");

    frontDeferred.resolve(frontStream);
    await Promise.resolve();
    workbench.destroy();
    sideDeferred.resolve(sideStream);
    await assignment;

    expect(frontStream.stopMock).toHaveBeenCalledOnce();
    expect(sideStream.stopMock).toHaveBeenCalledOnce();
    expect(workbench.getState().screen).toBe("deviceSelection");
  });
});
