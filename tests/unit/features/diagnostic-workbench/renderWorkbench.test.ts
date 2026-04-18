import { describe, expect, it } from "vitest";
import type {
  WorkbenchError,
  WorkbenchScreen,
  WorkbenchState
} from "../../../../src/features/diagnostic-workbench/DiagnosticWorkbench";
import { createLiveLandmarkInspection } from "../../../../src/features/diagnostic-workbench/liveLandmarkInspection";
import { renderWorkbenchHTML } from "../../../../src/features/diagnostic-workbench/renderWorkbench";
import { defaultSideTriggerTuning } from "../../../../src/features/side-trigger";
import type {
  FrontHandDetection,
  HandFrame,
  SideHandDetection
} from "../../../../src/shared/types/hand";

const createState = (patch: Partial<WorkbenchState>): WorkbenchState => ({
  screen: "permission",
  devices: [],
  frontAssignment: undefined,
  sideAssignment: undefined,
  frontStream: undefined,
  sideStream: undefined,
  error: undefined,
  ...patch
});

const createError = (kind: WorkbenchError["kind"]): WorkbenchError => ({
  kind,
  title: "テストエラー",
  cause: "原因 <script>",
  impact: "影響",
  reproduction: "再現",
  nextAction: "対処"
});

const createDevice = (deviceId: string, label: string): MediaDeviceInfo =>
  ({
    kind: "videoinput",
    deviceId,
    label,
    groupId: `${deviceId}-group`,
    toJSON: () => ({})
  }) as MediaDeviceInfo;

const createHandFrame = (offset: number): HandFrame => ({
  width: 640,
  height: 480,
  landmarks: {
    wrist: { x: 0.1 + offset, y: 0.2, z: 0 },
    thumbIp: { x: 0.2 + offset, y: 0.3, z: 0 },
    thumbTip: { x: 0.3 + offset, y: 0.4, z: 0 },
    indexMcp: { x: 0.4 + offset, y: 0.5, z: 0 },
    indexTip: { x: 0.5 + offset, y: 0.6, z: 0 },
    middleTip: { x: 0.6 + offset, y: 0.7, z: 0 },
    ringTip: { x: 0.7 + offset, y: 0.8, z: 0 },
    pinkyTip: { x: 0.8 + offset, y: 0.9, z: 0 }
  }
});

const createFrontDetection = (): FrontHandDetection => ({
  laneRole: "frontAim",
  deviceId: "front-secret-device-id",
  streamId: "front-stream",
  timestamp: {
    frameTimestampMs: 1234.5,
    timestampSource: "requestVideoFrameCallbackCaptureTime",
    presentedFrames: 7,
    receivedAtPerformanceMs: 1250
  },
  rawFrame: createHandFrame(0),
  filteredFrame: createHandFrame(0.01),
  handPresenceConfidence: 0.97,
  trackingQuality: "good"
});

const createSideDetection = (): SideHandDetection => ({
  laneRole: "sideTrigger",
  deviceId: "side-secret-device-id",
  streamId: "side-stream",
  timestamp: {
    frameTimestampMs: 1240,
    timestampSource: "requestVideoFrameCallbackExpectedDisplayTime",
    presentedFrames: 8,
    receivedAtPerformanceMs: 1255
  },
  rawFrame: createHandFrame(0.02),
  filteredFrame: createHandFrame(0.03),
  handPresenceConfidence: 0.88,
  sideViewQuality: "good"
});

describe("renderWorkbenchHTML", () => {
  it("renders the permission screen", () => {
    const html = renderWorkbenchHTML(createState({ screen: "permission" }));

    expect(html).toContain("診断ワークベンチ");
    expect(html).toContain('data-wb-action="requestPermission"');
  });

  it.each<Exclude<WorkbenchError["kind"], "distinctDevicesRequired">>([
    "cameraUnsupported",
    "permissionDenied",
    "permissionFailed",
    "cameraNotFound",
    "enumerationFailed",
    "cameraConstraintFailed",
    "cameraOpenFailed"
  ])(
    "renders %s error screens with cause, impact, reproduction, and next action",
    (kind) => {
      const html = renderWorkbenchHTML(
        createState({
          screen: kind as WorkbenchScreen,
          error: createError(kind)
        })
      );

      expect(html).toContain("テストエラー");
      expect(html).toContain("<strong>原因:</strong>");
      expect(html).toContain("<strong>影響:</strong>");
      expect(html).toContain("<strong>再現:</strong>");
      expect(html).toContain("<strong>対処:</strong>");
      expect(html).toContain("原因 &lt;script&gt;");
      expect(html).not.toContain("原因 <script>");
    }
  );

  it("renders diagnostic fallback error details when an error screen has no error object", () => {
    const html = renderWorkbenchHTML(
      createState({
        screen: "cameraConstraintFailed"
      })
    );

    expect(html).toContain("カメラを開始できません");
    expect(html).toContain("<strong>原因:</strong>");
    expect(html).toContain("<strong>影響:</strong>");
    expect(html).toContain("<strong>再現:</strong>");
    expect(html).toContain("<strong>対処:</strong>");
  });

  it("renders a single-camera warning", () => {
    const html = renderWorkbenchHTML(createState({ screen: "singleCamera" }));

    expect(html).toContain("カメラが1台しか検出されません");
    expect(html).toContain(
      "1台のカメラをフロントとサイドの両方に再利用することはできません"
    );
  });

  it("escapes device labels and ids in device selection", () => {
    const html = renderWorkbenchHTML(
      createState({
        screen: "deviceSelection",
        devices: [
          createDevice('front"><script>', "Front <script>"),
          createDevice("side-id", "")
        ]
      })
    );

    expect(html).toContain("Front &lt;script&gt;");
    expect(html).toContain("Camera 2");
    expect(html).toContain('value="front&quot;&gt;&lt;script&gt;"');
    expect(html).not.toContain("Front <script>");
  });

  it("renders preview labels without falling back to raw deviceId prefixes", () => {
    const rawFrontId = "front-secret-device-id";
    const rawSideId = "side-secret-device-id";
    const html = renderWorkbenchHTML(
      createState({
        screen: "previewing",
        frontAssignment: {
          role: "frontAim",
          deviceId: rawFrontId,
          label: "Camera 1"
        },
        sideAssignment: {
          role: "sideTrigger",
          deviceId: rawSideId,
          label: "Side <Camera>"
        }
      })
    );

    expect(html).toContain("Camera 1");
    expect(html).toContain("Side &lt;Camera&gt;");
    expect(html).not.toContain(rawFrontId.slice(0, 8));
    expect(html).not.toContain(rawSideId.slice(0, 8));
  });

  it("uses initial inspection health values when preview inspection is omitted", () => {
    const initialInspection = createLiveLandmarkInspection().getState();
    const html = renderWorkbenchHTML(
      createState({
        screen: "previewing",
        frontAssignment: {
          role: "frontAim",
          deviceId: "front-id",
          label: "Front Camera"
        },
        sideAssignment: {
          role: "sideTrigger",
          deviceId: "side-id",
          label: "Side Camera"
        }
      })
    );

    expect(html).toContain(`health: ${initialInspection.frontLaneHealth}`);
    expect(html).toContain(`health: ${initialInspection.sideLaneHealth}`);
  });

  it("renders raw and filtered landmark inspection panes with timestamp readouts", () => {
    const html = renderWorkbenchHTML(
      createState({
        screen: "previewing",
        frontAssignment: {
          role: "frontAim",
          deviceId: "front-secret-device-id",
          label: "Front Camera"
        },
        sideAssignment: {
          role: "sideTrigger",
          deviceId: "side-secret-device-id",
          label: "Side Camera"
        }
      }),
      {
        frontDetection: createFrontDetection(),
        sideDetection: createSideDetection(),
        frontLaneHealth: "tracking",
        sideLaneHealth: "tracking",
        sideTriggerFrame: undefined,
        sideTriggerTelemetry: undefined,
        sideTriggerTuning: defaultSideTriggerTuning
      }
    );

    expect(html).toContain("生ランドマーク");
    expect(html).toContain("フィルタ後ランドマーク");
    expect(html).toContain('id="wb-front-raw-overlay"');
    expect(html).toContain('id="wb-front-filtered-overlay"');
    expect(html).toContain('id="wb-side-raw-overlay"');
    expect(html).toContain('id="wb-side-filtered-overlay"');
    expect(html).toContain("1234.5 ms");
    expect(html).toContain("captureTime");
    expect(html).toContain("1240.0 ms");
    expect(html).toContain("expectedDisplayTime");
    expect(html).toContain("サイド world landmarks");
    expect(html).toContain("サイド trigger evidence");
    expect(html).toContain("SIDE_TRIGGER_PULL_ENTER_THRESHOLD");
  });
});
