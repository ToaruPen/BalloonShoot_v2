import type { TriggerInputFrame } from "../../shared/types/trigger";

interface ShotEdgeConsumption {
  peekIsUnconsumedShotCommit(frame: TriggerInputFrame): boolean;
  consumeIfShotCommit(frame: TriggerInputFrame): boolean;
  reset(): void;
}

const isShotCommitEdge = (frame: TriggerInputFrame): boolean =>
  frame.triggerEdge === "shotCommitted" ||
  frame.triggerEdge === "pullStarted+shotCommitted";

const shotConsumptionKeyFor = (frame: TriggerInputFrame): string =>
  [
    frame.timestamp.frameTimestampMs,
    frame.timestamp.presentedFrames ?? "unpresented",
    frame.timestamp.receivedAtPerformanceMs,
    frame.triggerEdge
  ].join(":");

export const createShotEdgeConsumption = (): ShotEdgeConsumption => {
  const consumedKeys = new Set<string>();

  return {
    peekIsUnconsumedShotCommit(frame) {
      return (
        isShotCommitEdge(frame) &&
        !consumedKeys.has(shotConsumptionKeyFor(frame))
      );
    },
    consumeIfShotCommit(frame) {
      if (!isShotCommitEdge(frame)) {
        return false;
      }

      const key = shotConsumptionKeyFor(frame);

      if (consumedKeys.has(key)) {
        return false;
      }

      consumedKeys.add(key);
      return true;
    },
    reset() {
      consumedKeys.clear();
    }
  };
};
