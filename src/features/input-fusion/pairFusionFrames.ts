import type { AimInputFrame } from "../../shared/types/aim";
import type { TriggerInputFrame } from "../../shared/types/trigger";

interface PairingOptions {
  readonly maxPairDeltaMs: number;
  readonly isCandidateUsable?: (
    frame: AimInputFrame | TriggerInputFrame
  ) => boolean;
}

export interface FusionFramePair {
  readonly frontFrame: AimInputFrame;
  readonly sideFrame: TriggerInputFrame;
  readonly timeDeltaBetweenLanesMs: number;
}

const frameTime = (frame: AimInputFrame | TriggerInputFrame): number =>
  frame.timestamp.frameTimestampMs;

const pickNearest = <T extends AimInputFrame | TriggerInputFrame>(
  incomingFrameTimestampMs: number,
  candidates: readonly T[],
  options: PairingOptions
): { frame: T; deltaMs: number } | undefined => {
  let best: { frame: T; deltaMs: number } | undefined;

  for (const frame of candidates) {
    if (options.isCandidateUsable?.(frame) === false) {
      continue;
    }

    const deltaMs = Math.abs(frameTime(frame) - incomingFrameTimestampMs);

    if (deltaMs > options.maxPairDeltaMs) {
      continue;
    }

    if (
      best === undefined ||
      deltaMs < best.deltaMs ||
      (deltaMs === best.deltaMs && frameTime(frame) > frameTime(best.frame))
    ) {
      best = { frame, deltaMs };
    }
  }

  return best;
};

export const pairAimWithSideFrames = (
  frontFrame: AimInputFrame,
  sideFrames: readonly TriggerInputFrame[],
  options: PairingOptions
): FusionFramePair | undefined => {
  const nearest = pickNearest(
    frontFrame.timestamp.frameTimestampMs,
    sideFrames,
    options
  );

  return nearest === undefined
    ? undefined
    : {
        frontFrame,
        sideFrame: nearest.frame,
        timeDeltaBetweenLanesMs: nearest.deltaMs
      };
};

export const pairTriggerWithFrontFrames = (
  sideFrame: TriggerInputFrame,
  frontFrames: readonly AimInputFrame[],
  options: PairingOptions
): FusionFramePair | undefined => {
  const nearest = pickNearest(
    sideFrame.timestamp.frameTimestampMs,
    frontFrames,
    options
  );

  return nearest === undefined
    ? undefined
    : {
        frontFrame: nearest.frame,
        sideFrame,
        timeDeltaBetweenLanesMs: nearest.deltaMs
      };
};
