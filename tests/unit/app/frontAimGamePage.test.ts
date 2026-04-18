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

const createRoot = (
  querySelectorImpl: ReturnType<typeof vi.fn> = vi.fn()
) => {
  const listeners = new Map<string, EventListener>();
  const addEventListener = vi.fn((type: string, listener: EventListener) => {
    listeners.set(type, listener);
  });
  const removeEventListener = vi.fn((type: string) => {
    listeners.delete(type);
  });

  return {
    innerHTML: "",
    addEventListener,
    removeEventListener,
    querySelector: querySelectorImpl,
    click(target: Element) {
      listeners.get("click")?.({ target } as unknown as Event);
    }
  } as unknown as HTMLElement & {
    innerHTML: string;
    click(target: Element): void;
    addEventListener: typeof addEventListener;
    removeEventListener: typeof removeEventListener;
    querySelector: typeof querySelectorImpl;
  };
};

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
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

  it("cleans up click wiring on unmount", () => {
    const root = createRoot();
    const requestCameraPermission = vi.fn(() =>
      Promise.resolve({ status: "granted" as const })
    );
    const page = createFrontAimGamePage({ requestCameraPermission });
    const button = {
      getAttribute: vi.fn(() => "requestCamera")
    } as unknown as Element;

    page.mount(root);
    page.destroy();
    root.click(button);

    expect(root.removeEventListener).toHaveBeenCalledWith(
      "click",
      expect.any(Function)
    );
    expect(requestCameraPermission).not.toHaveBeenCalled();
  });

  it("safely handles destroy during pending tracker initialization", async () => {
    const video = {} as HTMLVideoElement;
    const canvas = {} as HTMLCanvasElement;
    const root = createRoot(vi.fn((selector: string) => {
      if (selector === "#game-camera-feed") {
        return video;
      }
      if (selector === "#game-canvas") {
        return canvas;
      }
      return null;
    }));
    const trackerStartup = createDeferred<{ cleanup(): Promise<void> }>();
    const streamStop = vi.fn();
    const trackerCleanup = vi.fn(() => Promise.resolve());
    let stopped = false;
    const runtime = {
      start: vi.fn(() => {
        void trackerStartup.promise.then((tracker) => {
          if (stopped) {
            void tracker.cleanup();
          }
        });
      }),
      destroy: vi.fn(() => {
        if (!stopped) {
          stopped = true;
          streamStop();
        }
      })
    };
    const page = createFrontAimGamePage({
      createFrontAimGameRuntime: vi.fn(() => runtime)
    });

    page.mount(root);
    page.selectFrontCamera("front-1");
    page.destroy();
    trackerStartup.resolve({ cleanup: trackerCleanup });
    await trackerStartup.promise;

    expect(runtime.start).toHaveBeenCalledOnce();
    expect(runtime.destroy).toHaveBeenCalled();
    expect(streamStop).toHaveBeenCalledOnce();
    expect(trackerCleanup).toHaveBeenCalledOnce();
  });
});
