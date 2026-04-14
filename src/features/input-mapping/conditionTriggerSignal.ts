import type { TriggerState } from "./evaluateThumbTrigger";

export type ConditionedTriggerEdge = "none" | "pull" | "release";

export interface ConditionedTriggerState {
  scalar: number;
  latched: boolean;
  edge: ConditionedTriggerEdge;
  releaseReady: boolean;
}

export interface ConditionedTriggerInput {
  rawState: TriggerState;
  rawCosine: number;
  pullFloor: number;
  releaseFloor: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const PULL_EDGE_FLOOR = 0.9;

const normalizeScalar = ({ rawCosine, pullFloor, releaseFloor }: ConditionedTriggerInput): number => {
  const span = pullFloor - releaseFloor;

  if (!Number.isFinite(span) || span <= 0) {
    return rawCosine >= pullFloor ? 1 : 0;
  }

  return clamp01((rawCosine - releaseFloor) / span);
};

export const createInitialConditionedTriggerState = (): ConditionedTriggerState => ({
  scalar: 0,
  latched: false,
  edge: "none",
  releaseReady: true
});

export const updateConditionedTriggerSignal = (
  previous: ConditionedTriggerState = createInitialConditionedTriggerState(),
  input: ConditionedTriggerInput
): ConditionedTriggerState => {
  const scalar = normalizeScalar(input);
  const pullEdge = !previous.latched && input.rawState === "pulled" && scalar >= PULL_EDGE_FLOOR;
  const releaseEdge = previous.latched && input.rawState === "open" && scalar <= 0;
  const latched = releaseEdge ? false : previous.latched || pullEdge;

  return {
    scalar,
    latched,
    edge: pullEdge ? "pull" : releaseEdge ? "release" : "none",
    releaseReady: input.rawState === "open"
  };
};
