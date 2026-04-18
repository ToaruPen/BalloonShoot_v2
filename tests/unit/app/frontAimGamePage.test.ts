import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFrontAimGamePage } from "../../../src/app/frontAimGamePage";

const createDevice = (deviceId: string, label: string): MediaDeviceInfo =>
  ({
    kind: "videoinput",
    deviceId,
    label,
    groupId: `${deviceId}-group`,
    toJSON: () => ({})
  }) as MediaDeviceInfo;

const createRoot = () => {
  const listeners = new Map<string, EventListener>();

  return {
    innerHTML: "",
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.set(type, listener);
    }),
    removeEventListener: vi.fn((type: string) => {
      listeners.delete(type);
    }),
    querySelector: vi.fn()
  } as unknown as HTMLElement & { innerHTML: string };
};

describe("createFrontAimGamePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the camera permission start state", () => {
    const root = createRoot();
    const page = createFrontAimGamePage();

    page.mount(root);

    expect(root.innerHTML).toContain("BalloonShoot v2");
    expect(root.innerHTML).toContain("フロントカメラを開始");
    expect(root.innerHTML).toContain("照準のみ");
  });

  it("renders front camera selection from enumerated devices", async () => {
    const root = createRoot();
    const page = createFrontAimGamePage({
      requestCameraPermission: vi.fn(() =>
        Promise.resolve({ status: "granted" as const })
      ),
      enumerateVideoDevices: vi.fn(() =>
        Promise.resolve([
          createDevice("front-1", "Front <Camera>"),
          createDevice("front-2", "Wide Camera")
        ])
      )
    });

    page.mount(root);
    await page.requestCameraAccess();

    expect(root.innerHTML).toContain("フロントカメラ選択");
    expect(root.innerHTML).toContain("Front &lt;Camera&gt;");
    expect(root.innerHTML).toContain('value="front-1"');
  });

  it("handles permission denial with user-facing cause and next action", async () => {
    const root = createRoot();
    const page = createFrontAimGamePage({
      requestCameraPermission: vi.fn(() =>
        Promise.resolve({
          status: "denied" as const,
          error: { name: "NotAllowedError", message: "blocked" }
        })
      )
    });

    page.mount(root);
    await page.requestCameraAccess();

    expect(root.innerHTML).toContain("カメラ許可が拒否されました");
    expect(root.innerHTML).toContain("原因");
    expect(root.innerHTML).toContain("次の操作");
  });

  it("does not render diagnostic links or slider controls", () => {
    const root = createRoot();
    const page = createFrontAimGamePage();

    page.mount(root);

    expect(root.innerHTML).not.toContain("diagnostic.html");
    expect(root.innerHTML).not.toContain("slider");
    expect(root.innerHTML).not.toContain("threshold");
    expect(root.innerHTML).not.toContain("SIDE_TRIGGER");
  });
});
