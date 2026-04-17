import { describe, expect, it } from "vitest";
import type {
  WorkbenchError,
  WorkbenchScreen,
  WorkbenchState
} from "../../../../src/features/diagnostic-workbench/DiagnosticWorkbench";
import { renderWorkbenchHTML } from "../../../../src/features/diagnostic-workbench/renderWorkbench";

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
    expect(html).toContain("1台のカメラをフロントとサイドの両方に再利用することはできません");
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
});
