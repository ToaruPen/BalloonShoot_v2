import { requestCameraPermission } from "../features/camera/cameraPermission";
import { enumerateVideoDevices } from "../features/camera/enumerateVideoDevices";
import { escapeHTML } from "../shared/browser/escapeHTML";
import {
  createBalloonGameRuntime,
  type BalloonGameRuntime
} from "./balloonGameRuntime";

type PermissionResult = Awaited<ReturnType<typeof requestCameraPermission>>;

interface BalloonGamePageDeps {
  readonly requestCameraPermission?: typeof requestCameraPermission;
  readonly enumerateVideoDevices?: typeof enumerateVideoDevices;
  readonly createBalloonGameRuntime?: typeof createBalloonGameRuntime;
}

interface BalloonGamePage {
  mount(root: HTMLElement): void;
  requestCameraAccess(): Promise<void>;
  selectCameras(frontDeviceId: string, sideDeviceId: string): void;
  destroy(): void;
}

type GamePageScreen = "start" | "deviceSelection" | "running" | "error";

interface GamePageState {
  readonly screen: GamePageScreen;
  readonly devices: MediaDeviceInfo[];
  readonly selectedFrontDeviceId: string | undefined;
  readonly selectedSideDeviceId: string | undefined;
  readonly selectionError: string | undefined;
  readonly errorTitle: string | undefined;
  readonly errorCause: string | undefined;
  readonly errorNextAction: string | undefined;
}

const initialState = (): GamePageState => ({
  screen: "start",
  devices: [],
  selectedFrontDeviceId: undefined,
  selectedSideDeviceId: undefined,
  selectionError: undefined,
  errorTitle: undefined,
  errorCause: undefined,
  errorNextAction: undefined
});

const renderStart = (): string => `
  <main class="app-layout app-layout-start">
    <section class="screen">
      <h1 class="screen-title">BalloonShoot v2</h1>
      <p class="screen-copy">2台のカメラで風船をねらって撃ちます。</p>
      <button class="screen-button" data-game-action="requestCamera">カメラを開始</button>
    </section>
  </main>
`;

const deviceLabel = (device: MediaDeviceInfo, index: number): string =>
  device.label.length > 0 ? device.label : `Camera ${String(index + 1)}`;

const renderDeviceOption = (
  device: MediaDeviceInfo,
  index: number,
  selectedDeviceId: string | undefined
): string => {
  const selected = selectedDeviceId === device.deviceId ? " selected" : "";

  return `<option value="${escapeHTML(device.deviceId)}"${selected}>${escapeHTML(deviceLabel(device, index))}</option>`;
};

const renderDeviceSelection = (state: GamePageState): string => `
  <main class="app-layout app-layout-start">
    <section class="screen">
      <h1 class="screen-title">カメラ選択</h1>
      <p class="screen-copy">フロントは照準、サイドはショット判定に使います。</p>
      ${
        state.selectionError === undefined
          ? ""
          : `<p class="screen-copy screen-error">${escapeHTML(state.selectionError)}</p>`
      }
      <label class="camera-field" for="front-camera-select">フロントカメラ</label>
      <select id="front-camera-select" class="camera-select">
        ${state.devices.map((device, index) => renderDeviceOption(device, index, state.selectedFrontDeviceId)).join("")}
      </select>
      <label class="camera-field" for="side-camera-select">サイドカメラ</label>
      <select id="side-camera-select" class="camera-select">
        ${state.devices.map((device, index) => renderDeviceOption(device, index, state.selectedSideDeviceId)).join("")}
      </select>
      <button class="screen-button" data-game-action="startSelectedCameras">ゲーム開始</button>
    </section>
  </main>
`;

const renderRunning = (): string => `
  <main class="app-layout app-layout-running">
    <video id="game-camera-feed-front" class="camera-feed camera-feed-front" autoplay playsinline muted></video>
    <video id="game-camera-feed-side" class="camera-feed-side" autoplay playsinline muted aria-hidden="true"></video>
    <canvas id="game-canvas" class="game-canvas" aria-label="balloon game canvas"></canvas>
    <div class="overlay-root">
      <div class="overlay">
        <div id="game-hud"></div>
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

const render = (state: GamePageState): string => {
  switch (state.screen) {
    case "start":
      return renderStart();
    case "deviceSelection":
      return renderDeviceSelection(state);
    case "running":
      return renderRunning();
    case "error":
      return renderError(state);
  }
};

const errorStateForPermission = (result: PermissionResult): GamePageState => {
  if (result.status === "granted") {
    return initialState();
  }

  return {
    ...initialState(),
    screen: "error",
    errorTitle:
      result.status === "denied"
        ? "カメラ許可が拒否されました"
        : "カメラを開始できません",
    errorCause: `${result.error.name}: ${result.error.message}`,
    errorNextAction:
      result.status === "denied"
        ? "ブラウザのカメラ許可を有効にしてからリトライしてください。"
        : "カメラ接続を確認してからリトライしてください。"
  };
};

const hasDeviceId = (
  devices: readonly MediaDeviceInfo[],
  deviceId: string | undefined
): deviceId is string =>
  deviceId !== undefined &&
  devices.some((device) => device.deviceId === deviceId);

const firstDeviceIdExcluding = (
  devices: readonly MediaDeviceInfo[],
  excludedDeviceIds: readonly (string | undefined)[]
): string | undefined =>
  devices.find((device) => !excludedDeviceIds.includes(device.deviceId))
    ?.deviceId;

const selectReselectedCameraIds = (
  devices: readonly MediaDeviceInfo[],
  previousFrontId: string | undefined,
  previousSideId: string | undefined
): {
  readonly selectedFrontDeviceId: string | undefined;
  readonly selectedSideDeviceId: string | undefined;
} => {
  const previousFrontPresent = hasDeviceId(devices, previousFrontId);
  const previousSidePresent = hasDeviceId(devices, previousSideId);
  const selectedFrontDeviceId = previousFrontPresent
    ? previousFrontId
    : (firstDeviceIdExcluding(devices, [
        previousSidePresent ? previousSideId : undefined
      ]) ?? devices[0]?.deviceId);
  const selectedSideDeviceId =
    previousSidePresent && previousSideId !== selectedFrontDeviceId
      ? previousSideId
      : firstDeviceIdExcluding(devices, [
          selectedFrontDeviceId,
          previousFrontPresent ? previousFrontId : undefined
        ]);

  return { selectedFrontDeviceId, selectedSideDeviceId };
};

export const createBalloonGamePage = ({
  requestCameraPermission: requestPermission = requestCameraPermission,
  enumerateVideoDevices: enumerateDevices = enumerateVideoDevices,
  createBalloonGameRuntime: createRuntime = createBalloonGameRuntime
}: BalloonGamePageDeps = {}): BalloonGamePage => {
  let root: HTMLElement | undefined;
  let state = initialState();
  let runtime: BalloonGameRuntime | undefined;
  let reselectGeneration = 0;

  const buildCameraErrorState = (
    title: string,
    cause: string,
    nextAction: string
  ): GamePageState => ({
    ...initialState(),
    screen: "error",
    errorTitle: title,
    errorCause: cause,
    errorNextAction: nextAction
  });

  const commit = (nextState: GamePageState): void => {
    state = nextState;

    if (root !== undefined) {
      root.innerHTML = render(state);
    }
  };

  const startRuntime = (frontDeviceId: string, sideDeviceId: string): void => {
    if (root === undefined) {
      return;
    }

    runtime?.destroy();
    commit({
      ...state,
      screen: "running",
      selectedFrontDeviceId: frontDeviceId,
      selectedSideDeviceId: sideDeviceId,
      selectionError: undefined
    });

    const frontVideo = root.querySelector<HTMLVideoElement>(
      "#game-camera-feed-front"
    );
    const sideVideo = root.querySelector<HTMLVideoElement>(
      "#game-camera-feed-side"
    );
    const canvas = root.querySelector<HTMLCanvasElement>("#game-canvas");
    const hudRoot = root.querySelector<HTMLElement>("#game-hud");

    if (
      frontVideo === null ||
      sideVideo === null ||
      canvas === null ||
      hudRoot === null
    ) {
      commit({
        ...state,
        screen: "error",
        errorTitle: "画面を開始できません",
        errorCause: "必要な映像要素を作成できませんでした。",
        errorNextAction: "ページをリロードしてリトライしてください。"
      });
      return;
    }

    runtime = createRuntime({
      frontDeviceId,
      sideDeviceId,
      frontVideo,
      sideVideo,
      canvas,
      hudRoot
    });
    runtime.start();
  };

  const reselectCameras = async (): Promise<void> => {
    reselectGeneration += 1;
    const generation = reselectGeneration;
    runtime?.destroy();
    runtime = undefined;

    try {
      const devices = await enumerateDevices();

      if (generation !== reselectGeneration) {
        return;
      }

      if (devices.length < 2) {
        commit(
          buildCameraErrorState(
            "カメラが1台しか検出されません",
            "このゲームには2台のカメラが必要です。",
            "別のカメラを接続してからリトライしてください。"
          )
        );
        return;
      }

      const previousFrontId = state.selectedFrontDeviceId;
      const previousSideId = state.selectedSideDeviceId;
      const { selectedFrontDeviceId, selectedSideDeviceId } =
        selectReselectedCameraIds(devices, previousFrontId, previousSideId);
      const selectionChanged =
        selectedFrontDeviceId !== previousFrontId ||
        selectedSideDeviceId !== previousSideId;

      commit({
        ...state,
        screen: "deviceSelection",
        devices,
        selectedFrontDeviceId,
        selectedSideDeviceId,
        selectionError: selectionChanged
          ? "切断されたカメラを選び直してください。"
          : undefined
      });
    } catch (error: unknown) {
      if (generation !== reselectGeneration) {
        return;
      }

      commit(
        buildCameraErrorState(
          "カメラ一覧を取得できません",
          error instanceof Error ? error.message : String(error),
          "カメラ接続を確認してからリトライしてください。"
        )
      );
    }
  };

  const handleClick = (event: Event): void => {
    const target = event.target as Element | null;
    const action = target?.getAttribute("data-game-action");

    if (action === "requestCamera") {
      void page.requestCameraAccess();
      return;
    }

    if (action === "retry") {
      runtime?.retry();
      return;
    }

    if (action === "reselectCameras") {
      void reselectCameras();
      return;
    }

    if (action === "startSelectedCameras" && root !== undefined) {
      const frontId = root.querySelector<HTMLSelectElement>(
        "#front-camera-select"
      )?.value;
      const sideId = root.querySelector<HTMLSelectElement>(
        "#side-camera-select"
      )?.value;

      if (frontId !== undefined && sideId !== undefined) {
        page.selectCameras(frontId, sideId);
      }
    }
  };

  const page: BalloonGamePage = {
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

        if (devices.length < 2) {
          commit(
            buildCameraErrorState(
              "カメラが1台しか検出されません",
              "このゲームには2台のカメラが必要です。",
              "別のカメラを接続してからリトライしてください。"
            )
          );
          return;
        }

        commit({
          ...state,
          screen: "deviceSelection",
          devices,
          selectedFrontDeviceId: devices[0]?.deviceId,
          selectedSideDeviceId: devices[1]?.deviceId,
          selectionError: undefined
        });
      } catch (error: unknown) {
        commit(
          buildCameraErrorState(
            "カメラ一覧を取得できません",
            error instanceof Error ? error.message : String(error),
            "カメラ接続を確認してからリトライしてください。"
          )
        );
      }
    },
    selectCameras(frontDeviceId, sideDeviceId) {
      if (frontDeviceId === sideDeviceId) {
        commit({
          ...state,
          screen: "deviceSelection",
          selectedFrontDeviceId: frontDeviceId,
          selectedSideDeviceId: sideDeviceId,
          selectionError: "フロントとサイドには異なるカメラを選択してください。"
        });
        return;
      }

      startRuntime(frontDeviceId, sideDeviceId);
    },
    destroy() {
      reselectGeneration += 1;
      runtime?.destroy();
      root?.removeEventListener("click", handleClick);
      root = undefined;
    }
  };

  return page;
};
