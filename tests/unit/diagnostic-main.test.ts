import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  deviceChangeObserverStop,
  listeners,
  liveInspectionMock,
  observeDeviceChangeMock,
  workbenchMock
} = vi.hoisted(() => {
  const listeners = new Map<string, EventListener>();
  const deviceChangeObserverStop = vi.fn();
  const observeDeviceChangeMock = vi.fn();
  const liveInspectionMock = {
    getState: vi.fn(() => ({
      frontDetection: undefined,
      sideDetection: undefined,
      frontLaneHealth: "notStarted",
      sideLaneHealth: "notStarted",
      frontAimFrame: undefined,
      frontAimTelemetry: undefined,
      frontAimCalibration: {
        center: { x: 0.5, y: 0.5 },
        cornerBounds: { leftX: 0.2, rightX: 0.8, topY: 0.2, bottomY: 0.8 }
      },
      sideTriggerFrame: undefined,
      sideTriggerTelemetry: undefined,
      sideTriggerCalibration: {
        openPose: { normalizedThumbDistance: 1.2 },
        pulledPose: { normalizedThumbDistance: 0.45 }
      },
      sideTriggerTuning: {
        minPullDwellFrames: 2,
        releaseEvidenceThreshold: 0.7,
        pullEvidenceThreshold: 0.8,
        cooldownFrames: 2
      },
      fusionFrame: undefined,
      fusionTelemetry: undefined,
      fusionTuning: {
        maxPairDeltaMs: 80,
        sideHoldMs: 150,
        staleAfterMs: 240
      }
    })),
    sync: vi.fn(),
    setFrontAimCalibration: vi.fn(),
    resetFrontAimCalibration: vi.fn(),
    setSideTriggerCalibration: vi.fn(),
    resetSideTriggerCalibration: vi.fn(),
    setSideTriggerTuning: vi.fn(),
    resetSideTriggerTuning: vi.fn(),
    setFusionTuning: vi.fn(),
    resetFusionTuning: vi.fn(),
    updateDom: vi.fn(),
    destroy: vi.fn()
  };
  const workbenchMock = {
    getState: vi.fn(() => ({
      screen: "permission",
      devices: [],
      frontAssignment: undefined,
      sideAssignment: undefined,
      frontStream: undefined,
      sideStream: undefined,
      error: undefined
    })),
    requestPermission: vi.fn(() => Promise.resolve()),
    assignDevices: vi.fn(() => Promise.resolve()),
    refreshDevicesFromDeviceChange: vi.fn(() => Promise.resolve()),
    swapRoles: vi.fn(() => Promise.resolve()),
    reselect: vi.fn(),
    subscribe: vi.fn(),
    destroy: vi.fn()
  };

  return {
    deviceChangeObserverStop,
    listeners,
    liveInspectionMock,
    observeDeviceChangeMock,
    workbenchMock
  };
});

vi.mock("../../src/features/diagnostic-workbench/DiagnosticWorkbench", () => ({
  createDiagnosticWorkbench: vi.fn(() => workbenchMock)
}));

vi.mock("../../src/features/diagnostic-workbench/renderWorkbench", () => ({
  renderWorkbenchHTML: vi.fn(() => "")
}));

vi.mock("../../src/features/camera/observeDeviceChange", () => ({
  observeDeviceChange: observeDeviceChangeMock
}));

vi.mock(
  "../../src/features/diagnostic-workbench/liveLandmarkInspection",
  () => ({
    createLiveLandmarkInspection: vi.fn(() => liveInspectionMock)
  })
);

class FakeHTMLInputElement {
  readonly dataset: Record<string, string>;
  readonly valueAsNumber: number;

  constructor(dataset: Record<string, string>, valueAsNumber: number) {
    this.dataset = dataset;
    this.valueAsNumber = valueAsNumber;
  }
}

describe("diagnostic main input handling", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    observeDeviceChangeMock.mockImplementation((callback: () => void) => {
      listeners.set("devicechange", callback as EventListener);
      return { stop: deviceChangeObserverStop };
    });
    listeners.clear();
    const root = {
      innerHTML: "",
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(type, listener);
      })
    };

    vi.stubGlobal("HTMLInputElement", FakeHTMLInputElement);
    vi.stubGlobal("document", {
      querySelector: vi.fn((selector: string) =>
        selector === "#diagnostic-app" ? root : null
      )
    });
    vi.stubGlobal("window", {
      addEventListener: vi.fn()
    });

    await import("../../src/diagnostic-main");
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not mutate slider state when valueAsNumber is not finite", () => {
    const inputListener = listeners.get("input");

    if (inputListener === undefined) {
      throw new Error("diagnostic input listener was not registered");
    }

    for (const dataset of [
      { sideTriggerTuning: "minPullDwellFrames" },
      { frontAimCalibration: "centerX" },
      { sideTriggerCalibration: "openPoseDistance" },
      { fusionTuning: "maxPairDeltaMs" }
    ]) {
      const input = new FakeHTMLInputElement(dataset, Number.NaN);
      inputListener({ target: input } as unknown as Event);
    }

    expect(liveInspectionMock.setSideTriggerTuning).not.toHaveBeenCalled();
    expect(liveInspectionMock.setFrontAimCalibration).not.toHaveBeenCalled();
    expect(liveInspectionMock.setSideTriggerCalibration).not.toHaveBeenCalled();
    expect(liveInspectionMock.setFusionTuning).not.toHaveBeenCalled();
  });

  it("refreshes workbench devices when media devices change", async () => {
    const deviceChangeListener = listeners.get("devicechange");

    if (deviceChangeListener === undefined) {
      throw new Error("devicechange listener was not registered");
    }

    deviceChangeListener(new Event("devicechange"));

    await vi.waitFor(() => {
      expect(
        workbenchMock.refreshDevicesFromDeviceChange
      ).toHaveBeenCalledOnce();
    });
  });
});
