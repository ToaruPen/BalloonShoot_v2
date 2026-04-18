import { requestCameraPermission } from "../features/camera/cameraPermission";
import { enumerateVideoDevices } from "../features/camera/enumerateVideoDevices";
import { escapeHTML } from "../shared/browser/escapeHTML";
import { createFrontAimGameRuntime } from "./frontAimGameRuntime";

type PermissionResult = Awaited<ReturnType<typeof requestCameraPermission>>;

interface FrontAimGamePageDeps {
  readonly requestCameraPermission?: typeof requestCameraPermission;
  readonly enumerateVideoDevices?: typeof enumerateVideoDevices;
  readonly createFrontAimGameRuntime?: typeof createFrontAimGameRuntime;
}

interface FrontAimGamePage {
  mount(root: HTMLElement): void;
  requestCameraAccess(): Promise<void>;
  selectFrontCamera(deviceId: string): void;
  destroy(): void;
}

type GamePageScreen =
  | "start"
  | "deviceSelection"
  | "running"
  | "error";

interface GamePageState {
  readonly screen: GamePageScreen;
  readonly devices: MediaDeviceInfo[];
  readonly selectedDeviceId: string | undefined;
  readonly errorTitle: string | undefined;
  readonly errorCause: string | undefined;
  readonly errorNextAction: string | undefined;
}

const initialState = (): GamePageState => ({
  screen: "start",
  devices: [],
  selectedDeviceId: undefined,
  errorTitle: undefined,
  errorCause: undefined,
  errorNextAction: undefined
});

const renderStart = (): string => `
  <main class="app-layout app-layout-start">
    <section class="screen">
      <h1 class="screen-title">BalloonShoot v2</h1>
      <p class="screen-copy">フロントカメラで照準のみを確認します。</p>
      <button class="screen-button" data-game-action="requestCamera">フロントカメラを開始</button>
    </section>
  </main>
`;

const renderDeviceOption = (device: MediaDeviceInfo, index: number): string => {
  const label =
    device.label.length > 0 ? device.label : `Camera ${String(index + 1)}`;

  return `<option value="${escapeHTML(device.deviceId)}">${escapeHTML(label)}</option>`;
};

const renderDeviceSelection = (devices: MediaDeviceInfo[]): string => `
  <main class="app-layout app-layout-start">
    <section class="screen">
      <h1 class="screen-title">フロントカメラ選択</h1>
      <p class="screen-copy">照準に使うカメラを選んでください。</p>
      <select id="front-camera-select" class="camera-select">
        ${devices.map((device, index) => renderDeviceOption(device, index)).join("")}
      </select>
      <button class="screen-button" data-game-action="startSelectedCamera">照準を開始</button>
    </section>
  </main>
`;

const renderRunning = (): string => `
  <main class="app-layout app-layout-running">
    <video id="game-camera-feed" class="camera-feed" autoplay playsinline muted></video>
    <canvas id="game-canvas" class="game-canvas" aria-label="aim crosshair canvas"></canvas>
    <div class="overlay-root">
      <div class="overlay">
        <div class="hud">M5 aim only</div>
      </div>
    </div>
  </main>
`;

const renderError = (state: GamePageState): string => `
  <main class="app-layout app-layout-start">
    <section class="screen" role="alert">
      <h1 class="screen-title">${escapeHTML(state.errorTitle ?? "カメラを開始できません")}</h1>
      <p class="screen-copy"><strong>原因:</strong> ${escapeHTML(state.errorCause ?? "カメラ処理中に失敗しました。")}</p>
      <p class="screen-copy"><strong>次の操作:</strong> ${escapeHTML(state.errorNextAction ?? "ページをリロードしてリトライしてください。")}</p>
      <button class="screen-button" data-game-action="requestCamera">リトライ</button>
    </section>
  </main>
`;

const errorStateForPermission = (result: PermissionResult): GamePageState => {
  if (result.status === "granted") {
    return initialState();
  }

  const denied = result.status === "denied";

  return {
    ...initialState(),
    screen: "error",
    errorTitle: denied ? "カメラ許可が拒否されました" : "カメラを開始できません",
    errorCause: `${result.error.name}: ${result.error.message}`,
    errorNextAction: denied
      ? "ブラウザのカメラ許可を有効にしてからリトライしてください。"
      : "カメラ接続を確認してからリトライしてください。"
  };
};

const render = (state: GamePageState): string => {
  switch (state.screen) {
    case "start":
      return renderStart();
    case "deviceSelection":
      return renderDeviceSelection(state.devices);
    case "running":
      return renderRunning();
    case "error":
      return renderError(state);
  }
};

export const createFrontAimGamePage = ({
  requestCameraPermission: requestPermission = requestCameraPermission,
  enumerateVideoDevices: enumerateDevices = enumerateVideoDevices,
  createFrontAimGameRuntime: createRuntime = createFrontAimGameRuntime
}: FrontAimGamePageDeps = {}): FrontAimGamePage => {
  let root: HTMLElement | undefined;
  let state = initialState();
  let runtime: ReturnType<typeof createFrontAimGameRuntime> | undefined;

  const commit = (nextState: GamePageState): void => {
    state = nextState;

    if (root !== undefined) {
      root.innerHTML = render(state);
    }
  };

  const startRuntime = (deviceId: string): void => {
    if (root === undefined) {
      return;
    }

    runtime?.destroy();
    commit({ ...state, screen: "running", selectedDeviceId: deviceId });

    const video = root.querySelector<HTMLVideoElement>("#game-camera-feed");
    const canvas = root.querySelector<HTMLCanvasElement>("#game-canvas");

    if (video === null || canvas === null) {
      commit({
        ...state,
        screen: "error",
        errorTitle: "画面を開始できません",
        errorCause: "必要な映像要素を作成できませんでした。",
        errorNextAction: "ページをリロードしてリトライしてください。"
      });
      return;
    }

    runtime = createRuntime({ deviceId, video, canvas });
    runtime.start();
  };

  const handleClick = (event: Event): void => {
    const target = event.target as Element | null;
    const action = target?.getAttribute("data-game-action");

    if (action === "requestCamera") {
      void page.requestCameraAccess();
    }

    if (action === "startSelectedCamera" && root !== undefined) {
      const selected =
        root.querySelector<HTMLSelectElement>("#front-camera-select")?.value;

      if (selected !== undefined && selected.length > 0) {
        page.selectFrontCamera(selected);
      }
    }
  };

  const page: FrontAimGamePage = {
    mount(nextRoot) {
      root = nextRoot;
      root.addEventListener("click", handleClick);
      commit(state);
    },
    async requestCameraAccess() {
      const permission = await requestPermission();

      if (permission.status !== "granted") {
        commit(errorStateForPermission(permission));
        return;
      }

      try {
        const devices = await enumerateDevices();

        if (devices.length === 0) {
          commit({
            ...initialState(),
            screen: "error",
            errorTitle: "カメラが見つかりません",
            errorCause: "利用できるビデオ入力がありません。",
            errorNextAction: "カメラを接続してからリトライしてください。"
          });
          return;
        }

        commit({
          ...state,
          screen: "deviceSelection",
          devices,
          selectedDeviceId: devices[0]?.deviceId
        });
      } catch (error: unknown) {
        commit({
          ...initialState(),
          screen: "error",
          errorTitle: "カメラ一覧を取得できません",
          errorCause: error instanceof Error ? error.message : String(error),
          errorNextAction: "カメラ接続を確認してからリトライしてください。"
        });
      }
    },
    selectFrontCamera(deviceId) {
      startRuntime(deviceId);
    },
    destroy() {
      runtime?.destroy();
      root?.removeEventListener("click", handleClick);
      root = undefined;
    }
  };

  return page;
};
