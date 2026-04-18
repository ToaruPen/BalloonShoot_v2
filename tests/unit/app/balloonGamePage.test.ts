import { describe, expect, it, vi } from "vitest";
import { createBalloonGamePage } from "../../../src/app/balloonGamePage";

const createDevice = (deviceId: string, label: string): MediaDeviceInfo =>
  ({
    kind: "videoinput",
    deviceId,
    label,
    groupId: `${deviceId}-group`,
    toJSON: () => ({})
  }) as MediaDeviceInfo;

const createRoot = () => {
  let clickListener: ((event: Event) => void) | undefined;
  const elements = new Map<string, unknown>([
    ["#game-camera-feed-front", {} as HTMLVideoElement],
    ["#game-camera-feed-side", {} as HTMLVideoElement],
    ["#game-canvas", {} as HTMLCanvasElement],
    ["#game-hud", {} as HTMLElement]
  ]);

  return {
    innerHTML: "",
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === "click") {
        clickListener = listener as (event: Event) => void;
      }
    }),
    removeEventListener: vi.fn(),
    querySelector: vi.fn((selector: string) => elements.get(selector) ?? null),
    clickAction(action: string) {
      clickListener?.({
        target: {
          getAttribute: (name: string) =>
            name === "data-game-action" ? action : null
        }
      } as unknown as Event);
    }
  } as unknown as HTMLElement & {
    innerHTML: string;
    querySelector: ReturnType<typeof vi.fn>;
    clickAction(action: string): void;
  };
};

describe("createBalloonGamePage", () => {
  it("renders production start copy without diagnostic strings", () => {
    const root = createRoot();
    const page = createBalloonGamePage();

    page.mount(root);

    expect(root.innerHTML).toContain("BalloonShoot v2");
    expect(root.innerHTML).toContain("2台のカメラ");
    expect(root.innerHTML).not.toContain("diagnostic");
    expect(root.innerHTML).not.toContain("threshold");
    expect(root.innerHTML).not.toContain("wireframe");
  });

  it("rejects full gameplay when only one camera is available", async () => {
    const root = createRoot();
    const page = createBalloonGamePage({
      requestCameraPermission: vi.fn(() =>
        Promise.resolve({ status: "granted" as const })
      ),
      enumerateVideoDevices: vi.fn(() =>
        Promise.resolve([createDevice("only", "Only Camera")])
      )
    });

    page.mount(root);
    await page.requestCameraAccess();

    expect(root.innerHTML).toContain("カメラが1台しか検出されません");
    expect(root.innerHTML).toContain("2台のカメラが必要です");
  });

  it("rejects duplicate front and side selections", async () => {
    const root = createRoot();
    const page = createBalloonGamePage({
      requestCameraPermission: vi.fn(() =>
        Promise.resolve({ status: "granted" as const })
      ),
      enumerateVideoDevices: vi.fn(() =>
        Promise.resolve([
          createDevice("front", "Front <Camera>"),
          createDevice("side", "Side Camera")
        ])
      )
    });

    page.mount(root);
    await page.requestCameraAccess();
    page.selectCameras("front", "front");

    expect(root.innerHTML).toContain("異なるカメラを選択してください");
    expect(root.innerHTML).toContain("Front &lt;Camera&gt;");
  });

  it("starts runtime with distinct front and side devices", async () => {
    const root = createRoot();
    const runtime = { start: vi.fn(), retry: vi.fn(), destroy: vi.fn() };
    const createRuntime = vi.fn(() => runtime);
    const page = createBalloonGamePage({
      requestCameraPermission: vi.fn(() =>
        Promise.resolve({ status: "granted" as const })
      ),
      enumerateVideoDevices: vi.fn(() =>
        Promise.resolve([
          createDevice("front", "Front Camera"),
          createDevice("side", "Side Camera")
        ])
      ),
      createBalloonGameRuntime: createRuntime
    });

    page.mount(root);
    await page.requestCameraAccess();
    page.selectCameras("front", "side");

    expect(root.querySelector("#game-camera-feed-front")).not.toBeNull();
    expect(root.querySelector("#game-camera-feed-side")).not.toBeNull();
    expect(root.querySelector("#game-canvas")).not.toBeNull();
    expect(root.querySelector("#game-hud")).not.toBeNull();
    expect(createRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        frontDeviceId: "front",
        sideDeviceId: "side",
        frontVideo: root.querySelector("#game-camera-feed-front"),
        sideVideo: root.querySelector("#game-camera-feed-side"),
        canvas: root.querySelector("#game-canvas"),
        hudRoot: root.querySelector("#game-hud")
      })
    );
    expect(runtime.start).toHaveBeenCalledOnce();
  });

  it("reselects cameras from the running page while preserving available previous selections", async () => {
    const root = createRoot();
    const runtime = { start: vi.fn(), retry: vi.fn(), destroy: vi.fn() };
    const enumerateVideoDevices = vi
      .fn()
      .mockResolvedValueOnce([
        createDevice("front", "Front Camera"),
        createDevice("side", "Side Camera")
      ])
      .mockResolvedValueOnce([
        createDevice("front", "Front Camera"),
        createDevice("replacement", "Replacement Camera")
      ]);
    const page = createBalloonGamePage({
      requestCameraPermission: vi.fn(() =>
        Promise.resolve({ status: "granted" as const })
      ),
      enumerateVideoDevices,
      createBalloonGameRuntime: vi.fn(() => runtime)
    });

    page.mount(root);
    await page.requestCameraAccess();
    page.selectCameras("front", "side");
    root.clickAction("reselectCameras");

    await vi.waitFor(() => {
      expect(root.innerHTML).toContain("カメラ選択");
      expect(root.innerHTML).toContain(
        "切断されたカメラを選び直してください。"
      );
    });
    expect(runtime.destroy).toHaveBeenCalledOnce();
    expect(root.innerHTML).toMatch(
      /<option value="front" selected>Front Camera<\/option>/
    );
    expect(root.innerHTML).toMatch(
      /<option value="replacement" selected>Replacement Camera<\/option>/
    );
  });
});
