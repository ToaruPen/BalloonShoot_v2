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

  it("sample>=10 かつ duration>=300ms で baselineWindowReady=true", () => {
    let state = createInitialCycleSegmenterState();
    for (let i = 0; i < 15; i++) {
      state = updateCycleSegmenter(state, usable(i * 30, 1.0)).state;
    }
    expect(state.baselineWindowReady).toBe(true);
    expect(state.phase).toBe("open");
  });

  it("baselineReady 後、値が baselineAtStart から 0.05 以上下回ったら Open→Drop", () => {
    let state = createInitialCycleSegmenterState();
    for (let i = 0; i < 15; i++)
      state = updateCycleSegmenter(state, usable(i * 30, 1.0)).state;
    const result = updateCycleSegmenter(state, usable(500, 0.9));
    expect(result.state.phase).toBe("drop");
    expect(result.state.cycleStart?.baselineAtStart).toBeCloseTo(1.0);
  });

  it("Open phase 中のみ baselineBuffer が更新される (Drop 中は凍結)", () => {
    let state = createInitialCycleSegmenterState();
    for (let i = 0; i < 15; i++)
      state = updateCycleSegmenter(state, usable(i * 30, 1.0)).state;
    const beforeDrop = state.baselineBuffer.length;
    state = updateCycleSegmenter(state, usable(500, 0.9)).state;
    expect(state.phase).toBe("drop");
    const afterDrop = state.baselineBuffer.length;
    expect(afterDrop).toBe(beforeDrop);
  });
});

describe("cycleSegmenter Drop→Hold→Recovery", () => {
  const primeToDrop = () => {
    let state = createInitialCycleSegmenterState();
    for (let i = 0; i < 15; i++)
      state = updateCycleSegmenter(state, usable(i * 30, 1.0)).state;
    return updateCycleSegmenter(state, usable(500, 0.88)).state;
  };

  it("Drop 中で baselineAtStart-THRESHOLD 以下を 50ms 維持→Hold", () => {
    let state = primeToDrop();
    state = updateCycleSegmenter(state, usable(520, 0.88)).state;
    state = updateCycleSegmenter(state, usable(560, 0.88)).state;
    expect(state.phase).toBe("hold");
  });

  it("Hold 中で rising 開始→Recovery、recoveryThreshold amplitude-based", () => {
    let state = primeToDrop();
    state = updateCycleSegmenter(state, usable(520, 0.88)).state;
    state = updateCycleSegmenter(state, usable(560, 0.88)).state;
    expect(state.phase).toBe("hold");
    state = updateCycleSegmenter(state, usable(600, 0.92)).state;
    expect(state.phase).toBe("recovery");
    expect(state.pulledMedianFrozen).toBeCloseTo(0.88);
    // threshold = 0.88 + (1.0 - 0.88) * 0.8 = 0.976
    expect(state.recoveryThreshold).toBeCloseTo(0.976);
  });

  it("holdSamples は Drop 開始後の below-threshold usable samples を蓄積", () => {
    let state = primeToDrop();
    state = updateCycleSegmenter(state, usable(520, 0.86)).state;
    state = updateCycleSegmenter(state, usable(560, 0.85)).state;
    state = updateCycleSegmenter(state, usable(600, 0.87)).state;
    expect(state.holdSamples.length).toBeGreaterThanOrEqual(3);
    expect(state.holdSamples.every((s: { value: number }) => s.value <= 0.95)).toBe(true);
  });
});

describe("cycleSegmenter Recovery→PendingPostOpen→Confirmed", () => {
  const primeToRecovery = () => {
    let state = createInitialCycleSegmenterState();
    for (let i = 0; i < 15; i++)
      state = updateCycleSegmenter(state, usable(i * 30, 1.0)).state;
    state = updateCycleSegmenter(state, usable(500, 0.88)).state;
    state = updateCycleSegmenter(state, usable(520, 0.88)).state;
    state = updateCycleSegmenter(state, usable(560, 0.88)).state;
    state = updateCycleSegmenter(state, usable(600, 0.92)).state;
    return state;
  };

  it("Recovery で recoveryThreshold 到達→PendingPostOpen", () => {
    let state = primeToRecovery();
    state = updateCycleSegmenter(state, usable(640, 0.98)).state;
    expect(state.phase).toBe("pendingPostOpen");
    expect(state.postOpenStartMs).toBe(640);
  });

  it("PendingPostOpen で 200ms 経過後 Confirmed、cycle event 発火、Open に戻る", () => {
    let state = primeToRecovery();
    state = updateCycleSegmenter(state, usable(640, 0.98)).state;
    state = updateCycleSegmenter(state, usable(680, 1.01)).state;
    state = updateCycleSegmenter(state, usable(720, 1.0)).state;
    state = updateCycleSegmenter(state, usable(760, 1.0)).state;
    state = updateCycleSegmenter(state, usable(800, 1.02)).state;
    const final = updateCycleSegmenter(state, usable(845, 1.0));
    expect(final.state.phase).toBe("open");
    const ev = final.result.confirmedCycleEvent;
    expect(ev).toBeDefined();
    if (ev === undefined) return;
    expect(ev.pulledMedian).toBeCloseTo(0.88, 1);
    expect(ev.openPostMedian).toBeCloseTo(1.0, 1);
    expect(ev.durationMs).toBe(845 - 500);
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
    state = updateCycleSegmenter(state, usable(500, 0.88)).state;
    const r = updateCycleSegmenter(state, usable(1000, 0.88));
    expect(r.result.stableOpenObservation).toBeUndefined();
  });
});
