import {
  SIDE_TRIGGER_LOST_HAND_GRACE_FRAMES,
  SIDE_TRIGGER_MIN_CONFIDENCE_FOR_COMMIT,
  SIDE_TRIGGER_MIN_PULL_DWELL_FRAMES,
  SIDE_TRIGGER_MIN_RELEASE_DWELL_FRAMES,
  SIDE_TRIGGER_PULL_ENTER_THRESHOLD,
  SIDE_TRIGGER_PULL_EXIT_THRESHOLD,
  SIDE_TRIGGER_RELEASE_ENTER_THRESHOLD,
  SIDE_TRIGGER_RELEASE_EXIT_THRESHOLD,
  SIDE_TRIGGER_SHOT_COOLDOWN_FRAMES,
  SIDE_TRIGGER_STABLE_POSE_REQUIRED_FRAMES
} from "./sideTriggerConstants";

export interface SideTriggerTuning {
  readonly pullEnterThreshold: number;
  readonly pullExitThreshold: number;
  readonly releaseEnterThreshold: number;
  readonly releaseExitThreshold: number;
  readonly minPullDwellFrames: number;
  readonly minReleaseDwellFrames: number;
  readonly stablePoseRequiredFrames: number;
  readonly lostHandGraceFrames: number;
  readonly shotCooldownFrames: number;
  readonly minConfidenceForCommit: number;
}

export type SideTriggerTuningKey = keyof SideTriggerTuning;

interface SideTriggerSliderMetadata {
  readonly key: SideTriggerTuningKey;
  readonly constantName: string;
  readonly displayName: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly defaultValue: number;
  readonly numericKind: "ratio" | "frames";
}

export const defaultSideTriggerTuning: SideTriggerTuning = {
  pullEnterThreshold: SIDE_TRIGGER_PULL_ENTER_THRESHOLD,
  pullExitThreshold: SIDE_TRIGGER_PULL_EXIT_THRESHOLD,
  releaseEnterThreshold: SIDE_TRIGGER_RELEASE_ENTER_THRESHOLD,
  releaseExitThreshold: SIDE_TRIGGER_RELEASE_EXIT_THRESHOLD,
  minPullDwellFrames: SIDE_TRIGGER_MIN_PULL_DWELL_FRAMES,
  minReleaseDwellFrames: SIDE_TRIGGER_MIN_RELEASE_DWELL_FRAMES,
  stablePoseRequiredFrames: SIDE_TRIGGER_STABLE_POSE_REQUIRED_FRAMES,
  lostHandGraceFrames: SIDE_TRIGGER_LOST_HAND_GRACE_FRAMES,
  shotCooldownFrames: SIDE_TRIGGER_SHOT_COOLDOWN_FRAMES,
  minConfidenceForCommit: SIDE_TRIGGER_MIN_CONFIDENCE_FOR_COMMIT
};

export const sideTriggerSliderMetadata: readonly SideTriggerSliderMetadata[] = [
  {
    key: "pullEnterThreshold",
    constantName: "SIDE_TRIGGER_PULL_ENTER_THRESHOLD",
    displayName: "Pull enter threshold",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: SIDE_TRIGGER_PULL_ENTER_THRESHOLD,
    numericKind: "ratio"
  },
  {
    key: "pullExitThreshold",
    constantName: "SIDE_TRIGGER_PULL_EXIT_THRESHOLD",
    displayName: "Pull exit threshold",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: SIDE_TRIGGER_PULL_EXIT_THRESHOLD,
    numericKind: "ratio"
  },
  {
    key: "releaseEnterThreshold",
    constantName: "SIDE_TRIGGER_RELEASE_ENTER_THRESHOLD",
    displayName: "Release enter threshold",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: SIDE_TRIGGER_RELEASE_ENTER_THRESHOLD,
    numericKind: "ratio"
  },
  {
    key: "releaseExitThreshold",
    constantName: "SIDE_TRIGGER_RELEASE_EXIT_THRESHOLD",
    displayName: "Release exit threshold",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: SIDE_TRIGGER_RELEASE_EXIT_THRESHOLD,
    numericKind: "ratio"
  },
  {
    key: "minPullDwellFrames",
    constantName: "SIDE_TRIGGER_MIN_PULL_DWELL_FRAMES",
    displayName: "Minimum pull dwell frames",
    min: 1,
    max: 20,
    step: 1,
    defaultValue: SIDE_TRIGGER_MIN_PULL_DWELL_FRAMES,
    numericKind: "frames"
  },
  {
    key: "minReleaseDwellFrames",
    constantName: "SIDE_TRIGGER_MIN_RELEASE_DWELL_FRAMES",
    displayName: "Minimum release dwell frames",
    min: 1,
    max: 20,
    step: 1,
    defaultValue: SIDE_TRIGGER_MIN_RELEASE_DWELL_FRAMES,
    numericKind: "frames"
  },
  {
    key: "stablePoseRequiredFrames",
    constantName: "SIDE_TRIGGER_STABLE_POSE_REQUIRED_FRAMES",
    displayName: "Stable pose required frames",
    min: 1,
    max: 30,
    step: 1,
    defaultValue: SIDE_TRIGGER_STABLE_POSE_REQUIRED_FRAMES,
    numericKind: "frames"
  },
  {
    key: "lostHandGraceFrames",
    constantName: "SIDE_TRIGGER_LOST_HAND_GRACE_FRAMES",
    displayName: "Lost hand grace frames",
    min: 1,
    max: 30,
    step: 1,
    defaultValue: SIDE_TRIGGER_LOST_HAND_GRACE_FRAMES,
    numericKind: "frames"
  },
  {
    key: "shotCooldownFrames",
    constantName: "SIDE_TRIGGER_SHOT_COOLDOWN_FRAMES",
    displayName: "Shot cooldown frames",
    min: 1,
    max: 60,
    step: 1,
    defaultValue: SIDE_TRIGGER_SHOT_COOLDOWN_FRAMES,
    numericKind: "frames"
  },
  {
    key: "minConfidenceForCommit",
    constantName: "SIDE_TRIGGER_MIN_CONFIDENCE_FOR_COMMIT",
    displayName: "Minimum confidence for commit",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: SIDE_TRIGGER_MIN_CONFIDENCE_FOR_COMMIT,
    numericKind: "ratio"
  }
];

export const coerceSideTriggerTuningValue = (
  metadata: SideTriggerSliderMetadata,
  value: number
): number => {
  const clamped = Math.min(metadata.max, Math.max(metadata.min, value));

  return metadata.numericKind === "frames" ? Math.round(clamped) : clamped;
};
