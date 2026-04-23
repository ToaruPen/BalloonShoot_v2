import { describe, expect, it } from "vitest";
import {
  createInitialCalibrationState,
  updateCalibrationReducer
} from "../../../../src/features/side-trigger/sideTriggerCalibrationReducer";
import type { ConfirmedCycleEvent } from "../../../../src/features/side-trigger/sideTriggerCycleTypes";

const evt = (
  overrides: Partial<ConfirmedCycleEvent> = {}
): ConfirmedCycleEvent => ({
  timestampMs: 1000,
  pulledMedian: 0.3,
  openPreMedian: 1.0,
  openPostMedian: 1.0,
  durationMs: 400,
  ...overrides
});

describe("calibrationReducer defaultWide→cycleReady→adaptive", () => {
  it("initial は defaultWide (pulled=0.2, open=1.2)", () => {
    const state = createInitialCalibrationState();
    expect(state.status).toBe("defaultWide");
    expect(state.pulled).toBe(0.2);
    expect(state.open).toBe(1.2);
  });

  it("初 accepted cycle で cycleReady に遷移、直接値を set", () => {
    const { result } = updateCalibrationReducer(createInitialCalibrationState(), {
      confirmedCycleEvent: evt({
        pulledMedian: 0.3,
        openPreMedian: 1.0,
        openPostMedian: 1.0
      }),
      sliderInDefaultRange: true
    });
    expect(result.status).toBe("cycleReady");
    expect(result.pulled).toBeCloseTo(0.3);
    expect(result.open).toBeCloseTo(1.0);
    expect(result.acceptedCycleEvent).toBeDefined();
  });

  it("2 つ目以降は adaptive EMA (α_pull=0.1, α_open=0.1)", () => {
    const first = updateCalibrationReducer(createInitialCalibrationState(), {
      confirmedCycleEvent: evt({
        timestampMs: 1000,
        pulledMedian: 0.3,
        openPreMedian: 1.0,
        openPostMedian: 1.0
      }),
      sliderInDefaultRange: true
    });
    const { result } = updateCalibrationReducer(first.state, {
      confirmedCycleEvent: evt({
        timestampMs: 1500,
        pulledMedian: 0.4,
        openPreMedian: 1.1,
        openPostMedian: 1.1
      }),
      sliderInDefaultRange: true
    });
    expect(result.status).toBe("adaptive");
    expect(result.pulled).toBeCloseTo(0.3 + 0.1 * (0.4 - 0.3));
    expect(result.open).toBeCloseTo(1.0 + 0.1 * (1.1 - 1.0));
  });
});

describe("calibrationReducer sanity reject", () => {
  it("spanTooSmall: pulledMedian >= open - MIN_SPAN", () => {
    const { result } = updateCalibrationReducer(createInitialCalibrationState(), {
      confirmedCycleEvent: evt({
        pulledMedian: 1.2,
        openPreMedian: 1.2,
        openPostMedian: 1.2
      }),
      sliderInDefaultRange: true
    });
    expect(result.rejectedCycleEvent?.reason).toBe("spanTooSmall");
  });

  it("openMedianMismatch: |openPre - openPost| / max > 0.30", () => {
    const { result } = updateCalibrationReducer(createInitialCalibrationState(), {
      confirmedCycleEvent: evt({
        pulledMedian: 0.3,
        openPreMedian: 1.0,
        openPostMedian: 0.5
      }),
      sliderInDefaultRange: true
    });
    expect(result.rejectedCycleEvent?.reason).toBe("openMedianMismatch");
  });

  it("durationTooLong: durationMs >= 1000", () => {
    const { result } = updateCalibrationReducer(createInitialCalibrationState(), {
      confirmedCycleEvent: evt({ durationMs: 1500 }),
      sliderInDefaultRange: true
    });
    expect(result.rejectedCycleEvent?.reason).toBe("durationTooLong");
  });

  it("intervalTooShort: 直前 accepted から 200ms 未満", () => {
    const first = updateCalibrationReducer(createInitialCalibrationState(), {
      confirmedCycleEvent: evt({ timestampMs: 1000 }),
      sliderInDefaultRange: true
    });
    const { result } = updateCalibrationReducer(first.state, {
      confirmedCycleEvent: evt({ timestampMs: 1100 }),
      sliderInDefaultRange: true
    });
    expect(result.rejectedCycleEvent?.reason).toBe("intervalTooShort");
  });

  it("medianDeviationFromLastAccepted: 50% 乖離", () => {
    const first = updateCalibrationReducer(createInitialCalibrationState(), {
      confirmedCycleEvent: evt({ timestampMs: 1000, pulledMedian: 0.3 }),
      sliderInDefaultRange: true
    });
    const { result } = updateCalibrationReducer(first.state, {
      confirmedCycleEvent: evt({ timestampMs: 1500, pulledMedian: 0.9 }),
      sliderInDefaultRange: true
    });
    expect(result.rejectedCycleEvent?.reason).toBe("medianDeviationFromLastAccepted");
  });
});

describe("calibrationReducer stableOpen assist + manualOverride", () => {
  it("cycleReady 中の stableOpenObservation で open を α_assist=0.02 更新", () => {
    const first = updateCalibrationReducer(createInitialCalibrationState(), {
      confirmedCycleEvent: evt({
        pulledMedian: 0.3,
        openPreMedian: 1.0,
        openPostMedian: 1.0
      }),
      sliderInDefaultRange: true
    });
    const { result } = updateCalibrationReducer(first.state, {
      stableOpenObservation: { timestampMs: 2000, value: 1.2 },
      sliderInDefaultRange: true
    });
    expect(result.open).toBeCloseTo(1.0 + 0.02 * (1.2 - 1.0));
  });

  it("defaultWide 中は stableOpen を無視", () => {
    const { result } = updateCalibrationReducer(createInitialCalibrationState(), {
      stableOpenObservation: { timestampMs: 2000, value: 1.5 },
      sliderInDefaultRange: true
    });
    expect(result.open).toBe(1.2);
  });

  it("slider 外れたら manualOverride、cycle 更新停止", () => {
    const first = updateCalibrationReducer(createInitialCalibrationState(), {
      confirmedCycleEvent: evt({
        pulledMedian: 0.3,
        openPreMedian: 1.0,
        openPostMedian: 1.0
      }),
      sliderInDefaultRange: true
    });
    const { result } = updateCalibrationReducer(first.state, {
      confirmedCycleEvent: evt({ timestampMs: 1500, pulledMedian: 0.4 }),
      sliderInDefaultRange: false
    });
    expect(result.status).toBe("manualOverride");
    expect(result.pulled).toBeCloseTo(0.3);
  });

  it("resetSignal manualOverrideEntered で defaultWide 値 + manualOverride 状態", () => {
    const { result } = updateCalibrationReducer(createInitialCalibrationState(), {
      resetSignal: "manualOverrideEntered",
      sliderInDefaultRange: false
    });
    expect(result.status).toBe("manualOverride");
    expect(result.pulled).toBe(0.2);
    expect(result.open).toBe(1.2);
  });
});
