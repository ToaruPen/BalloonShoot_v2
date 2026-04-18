import type { AimInputFrame } from "../../shared/types/aim";
import type { TriggerInputFrame } from "../../shared/types/trigger";

interface FusionFrameBuffers {
  readonly frontFrames: readonly AimInputFrame[];
  readonly sideFrames: readonly TriggerInputFrame[];
  addFrontFrame(frame: AimInputFrame, retentionWindowMs: number): void;
  addSideFrame(frame: TriggerInputFrame, retentionWindowMs: number): void;
  clearFront(): void;
  clearSide(): void;
  clearAll(): void;
}

const timestampOf = (
  frame: AimInputFrame | TriggerInputFrame
): number => frame.timestamp.frameTimestampMs;

const sortByTimestamp = <T extends AimInputFrame | TriggerInputFrame>(
  frames: readonly T[]
): T[] => [...frames].sort((a, b) => timestampOf(a) - timestampOf(b));

const retainRecent = <T extends AimInputFrame | TriggerInputFrame>(
  frames: readonly T[],
  currentTimestampMs: number,
  retentionWindowMs: number
): T[] =>
  frames.filter(
    (frame) => currentTimestampMs - timestampOf(frame) <= retentionWindowMs
  );

export const createFusionFrameBuffers = (): FusionFrameBuffers => {
  let frontFrames: readonly AimInputFrame[] = [];
  let sideFrames: readonly TriggerInputFrame[] = [];

  return {
    get frontFrames() {
      return frontFrames;
    },
    get sideFrames() {
      return sideFrames;
    },
    addFrontFrame(frame, retentionWindowMs) {
      frontFrames = sortByTimestamp(
        retainRecent(
          [...frontFrames, frame],
          frame.timestamp.frameTimestampMs,
          retentionWindowMs
        )
      );
      sideFrames = sortByTimestamp(
        retainRecent(
          sideFrames,
          frame.timestamp.frameTimestampMs,
          retentionWindowMs
        )
      );
    },
    addSideFrame(frame, retentionWindowMs) {
      sideFrames = sortByTimestamp(
        retainRecent(
          [...sideFrames, frame],
          frame.timestamp.frameTimestampMs,
          retentionWindowMs
        )
      );
      frontFrames = sortByTimestamp(
        retainRecent(
          frontFrames,
          frame.timestamp.frameTimestampMs,
          retentionWindowMs
        )
      );
    },
    clearFront() {
      frontFrames = [];
    },
    clearSide() {
      sideFrames = [];
    },
    clearAll() {
      frontFrames = [];
      sideFrames = [];
    }
  };
};
