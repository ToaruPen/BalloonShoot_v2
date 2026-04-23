import type { ResetReason } from "./sideTriggerTelemetryTypes";

export type CyclePhase = "open" | "drop" | "hold" | "recovery" | "pendingPostOpen";

export interface ConfirmedCycleEvent {
  readonly timestampMs: number;
  readonly pulledMedian: number;
  readonly openPreMedian: number;
  readonly openPostMedian: number;
  readonly durationMs: number;
}

export interface CycleSample {
  readonly timestampMs: number;
  readonly value: number;
}

export interface StableOpenObservation {
  readonly timestampMs: number;
  readonly value: number;
}

export interface CycleResult {
  readonly cyclePhase: CyclePhase;
  readonly confirmedCycleEvent?: ConfirmedCycleEvent;
  readonly stableOpenObservation?: StableOpenObservation;
  readonly resetSignal?: ResetReason;
}

export interface CycleSegmenterState {
  readonly phase: CyclePhase;
  readonly baselineBuffer: readonly CycleSample[];
  readonly baselineWindowReady: boolean;
  readonly cycleStart?: { readonly timestampMs: number; readonly baselineAtStart: number };
  readonly belowSinceMs?: number;
  readonly cycleSamples: readonly CycleSample[];
  readonly holdSamples: readonly CycleSample[];
  readonly pulledMedianFrozen?: number;
  readonly recoveryThreshold?: number;
  readonly postOpenSamples: readonly CycleSample[];
  readonly postOpenStartMs?: number;
  readonly lastStableOpenEmittedMs: number;
  readonly lastConfirmedCycleAtMs?: number;
}

export const createInitialCycleSegmenterState = (): CycleSegmenterState => ({
  phase: "open",
  baselineBuffer: [],
  baselineWindowReady: false,
  cycleSamples: [],
  holdSamples: [],
  postOpenSamples: [],
  lastStableOpenEmittedMs: 0
});
