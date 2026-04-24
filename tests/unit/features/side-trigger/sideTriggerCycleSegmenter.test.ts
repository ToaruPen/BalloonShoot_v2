import { describe, expect, it } from "vitest";
import {
  createInitialCycleSegmenterState,
  updateCycleSegmenter
} from "../../../../src/features/side-trigger/sideTriggerCycleSegmenter";
import type { RawMetric } from "../../../../src/features/side-trigger/sideTriggerRawMetricReducer";

const geometry = {
  wristToIndexMcp: 1,
  wristToMiddleMcp: 1,
  indexMcpToPinkyMcp: 1
};

const usable = (timestampMs: number, value: number): RawMetric => ({
  kind: "usable",
  timestampMs,
  sourceKey: "dev:stream",
  value,
  quality: "good",
  geometrySignature: geometry
});

describe("cycleSegmenter baseline + Open→Drop", () => {
  it("cold start 中は baselineWindowReady=false、Open phase のまま", () => {
    let state = createInitialCycleSegmenterState();
    for (let i = 0; i < 5; i++) {
      const r = updateCycleSegmenter(state, usable(i * 10, 1.0));
      state = r.state;
    }
    expect(state.baselineWindowReady).toBe(false);
    expect(state.phase).toBe("open");
  });

  it("sample>=MIN_SAMPLES かつ duration>=MIN_COVERAGE_MS で baselineWindowReady=true", () => {
    let state = createInitialCycleSegmenterState();
    for (let i = 0; i < 15; i++) {
      state = updateCycleSegmenter(state, usable(i * 30, 1.0)).state;
    }
    expect(state.baselineWindowReady).toBe(true);
    expect(state.phase).toBe("open");
  });

  it("長い sample gap 後は baselineWindowReady=false に戻る", () => {
    let state = createInitialCycleSegmenterState();
    for (let i = 0; i < 15; i++) {
      state = updateCycleSegmenter(state, usable(i * 30, 1.0)).state;
    }

    const result = updateCycleSegmenter(state, usable(2_000, 1.0));

    expect(result.state.baselineWindowReady).toBe(false);
    expect(result.state.phase).toBe("open");
  });

  it("baselineReady 後、値が baselineAtStart から 0.05 以上下回ったら Open→Drop", () => {
    let state = createInitialCycleSegmenterState();
    for (let i = 0; i < 15; i++)
      state = updateCycleSegmenter(state, usable(i * 30, 1.0)).state;
    const result = updateCycleSegmenter(state, usable(450, 0.9));
    expect(result.state.phase).toBe("drop");
    expect(result.state.cycleStart?.baselineAtStart).toBeCloseTo(1.0);
  });

  it("Open phase 中のみ baselineBuffer が更新される (Drop 中は凍結)", () => {
    let state = createInitialCycleSegmenterState();
    for (let i = 0; i < 15; i++)
      state = updateCycleSegmenter(state, usable(i * 30, 1.0)).state;
    const beforeDrop = state.baselineBuffer.length;
    state = updateCycleSegmenter(state, usable(450, 0.9)).state;
    expect(state.phase).toBe("drop");
    const afterDrop = state.baselineBuffer.length;
    expect(afterDrop).toBe(beforeDrop);
  });
});

describe("cycleSegmenter baseline readiness at realistic camera cadence", () => {
  it("becomes ready within ~500ms of stable open at ~21fps", () => {
    let state = createInitialCycleSegmenterState();
    const frameIntervalMs = 48;
    for (let i = 0; i < 12; i++) {
      state = updateCycleSegmenter(state, usable(i * frameIntervalMs, 1.0)).state;
    }
    expect(state.baselineWindowReady).toBe(true);
    expect(state.phase).toBe("open");
  });
});

describe("cycleSegmenter Drop→Hold→Recovery", () => {
  const primeToDrop = () => {
    let state = createInitialCycleSegmenterState();
    for (let i = 0; i < 15; i++)
      state = updateCycleSegmenter(state, usable(i * 30, 1.0)).state;
    return updateCycleSegmenter(state, usable(450, 0.88)).state;
  };

  it("Drop 中で baselineAtStart-THRESHOLD 以下を 50ms 維持→Hold", () => {
    let state = primeToDrop();
    state = updateCycleSegmenter(state, usable(470, 0.88)).state;
    state = updateCycleSegmenter(state, usable(510, 0.88)).state;
    expect(state.phase).toBe("hold");
  });

  it("Drop→Open abort when value recovers before HOLD_DURATION_MS", () => {
    let state = primeToDrop();

    state = updateCycleSegmenter(state, usable(470, 0.98)).state;

    expect(state.phase).toBe("open");
    expect(state.cycleStart).toBeUndefined();
    expect(state.cycleSamples).toHaveLength(0);
    expect(state.holdSamples).toHaveLength(0);
  });

  it("Drop→Hold requires continuous below-threshold samples", () => {
    let state = primeToDrop();

    state = updateCycleSegmenter(state, usable(470, 0.98)).state;
    expect(state.phase).toBe("open");

    state = updateCycleSegmenter(state, usable(510, 0.88)).state;
    expect(state.phase).toBe("drop");

    state = updateCycleSegmenter(state, usable(540, 0.88)).state;
    expect(state.phase).toBe("drop");

    state = updateCycleSegmenter(state, usable(570, 0.88)).state;
    expect(state.phase).toBe("hold");
  });

  it("Hold 中で rising 開始→Recovery、recoveryThreshold amplitude-based", () => {
    let state = primeToDrop();
    state = updateCycleSegmenter(state, usable(470, 0.88)).state;
    state = updateCycleSegmenter(state, usable(510, 0.88)).state;
    expect(state.phase).toBe("hold");
    state = updateCycleSegmenter(state, usable(550, 0.92)).state;
    expect(state.phase).toBe("recovery");
    expect(state.pulledMedianFrozen).toBeCloseTo(0.88);
    // threshold = 0.88 + (1.0 - 0.88) * 0.8 = 0.976
    expect(state.recoveryThreshold).toBeCloseTo(0.976);
  });

  it("holdSamples は Drop 開始後の below-threshold usable samples を蓄積", () => {
    let state = primeToDrop();
    state = updateCycleSegmenter(state, usable(470, 0.86)).state;
    state = updateCycleSegmenter(state, usable(510, 0.85)).state;
    state = updateCycleSegmenter(state, usable(550, 0.87)).state;
    expect(state.holdSamples.length).toBeGreaterThanOrEqual(3);
    expect(state.holdSamples.every((s: { value: number }) => s.value <= 0.95)).toBe(true);
  });
});

describe("cycleSegmenter Recovery→PendingPostOpen→Confirmed", () => {
  const primeToRecovery = () => {
    let state = createInitialCycleSegmenterState();
    for (let i = 0; i < 15; i++)
      state = updateCycleSegmenter(state, usable(i * 30, 1.0)).state;
    state = updateCycleSegmenter(state, usable(450, 0.88)).state;
    state = updateCycleSegmenter(state, usable(470, 0.88)).state;
    state = updateCycleSegmenter(state, usable(510, 0.88)).state;
    state = updateCycleSegmenter(state, usable(550, 0.92)).state;
    return state;
  };

  it("Recovery で recoveryThreshold 到達→PendingPostOpen", () => {
    let state = primeToRecovery();
    state = updateCycleSegmenter(state, usable(590, 0.98)).state;
    expect(state.phase).toBe("pendingPostOpen");
    expect(state.postOpenStartMs).toBe(590);
  });

  it("PendingPostOpen で 200ms 経過後 Confirmed、cycle event 発火、Open に戻る", () => {
    let state = primeToRecovery();
    state = updateCycleSegmenter(state, usable(590, 1.0)).state;
    state = updateCycleSegmenter(state, usable(630, 0.95)).state;
    state = updateCycleSegmenter(state, usable(670, 0.96)).state;
    state = updateCycleSegmenter(state, usable(710, 0.97)).state;
    state = updateCycleSegmenter(state, usable(750, 0.98)).state;
    const final = updateCycleSegmenter(state, usable(795, 0.99));
    expect(final.state.phase).toBe("open");
    expect(final.result.cyclePhase).toBe("confirmed");
    const ev = final.result.confirmedCycleEvent;
    expect(ev).toBeDefined();
    if (ev === undefined) return;
    expect(ev.pulledMedian).toBeCloseTo(0.88, 1);
    expect(ev.openPostMedian).toBeCloseTo(0.975, 6);
    expect(ev.durationMs).toBe(795 - 450);

    const next = updateCycleSegmenter(final.state, usable(830, 1.0));
    expect(next.state.phase).toBe("open");
    expect(next.result.cyclePhase).toBe("open");
  });

  it("Confirmed 後の baseline は pending post-open samples を引き継ぐ", () => {
    let state = primeToRecovery();
    state = updateCycleSegmenter(state, usable(590, 1.0)).state;
    for (let timestampMs = 595; timestampMs <= 775; timestampMs += 15) {
      state = updateCycleSegmenter(state, usable(timestampMs, 1.0)).state;
      expect(state.phase).toBe("pendingPostOpen");
    }

    const confirmed = updateCycleSegmenter(state, usable(895, 1.0));

    expect(confirmed.result.cyclePhase).toBe("confirmed");
    expect(confirmed.state.phase).toBe("open");
    expect(confirmed.state.baselineBuffer.length).toBeGreaterThan(1);
    expect(confirmed.state.baselineWindowReady).toBe(true);
  });
});

describe("cycleSegmenter stableOpenObservation", () => {
  it("baselineReady 後 500ms 間隔で stableOpenObservation を emit", () => {
    let state = createInitialCycleSegmenterState();
    let lastEmittedValue: number | undefined;
    for (let i = 0; i < 30; i++) {
      const r = updateCycleSegmenter(state, usable(i * 30, 1.0));
      state = r.state;
      if (r.result.stableOpenObservation)
        lastEmittedValue = r.result.stableOpenObservation.value;
    }
    expect(lastEmittedValue).toBeCloseTo(1.0);
    expect(state.lastStableOpenEmittedMs).toBeGreaterThan(0);
  });

  it("Open 以外の phase では stableOpenObservation を emit しない", () => {
    let state = createInitialCycleSegmenterState();
    for (let i = 0; i < 15; i++)
      state = updateCycleSegmenter(state, usable(i * 30, 1.0)).state;
    state = updateCycleSegmenter(state, usable(450, 0.88)).state;
    const r = updateCycleSegmenter(state, usable(950, 0.88));
    expect(r.result.stableOpenObservation).toBeUndefined();
  });
});
