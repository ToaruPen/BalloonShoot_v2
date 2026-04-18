import type { AimPoint2D } from "../../../shared/types/aim";
import type {
  FusedGameInputFrame,
  FusionRejectReason
} from "../../../shared/types/fusion";

interface FusedGameInputAdapter {
  readonly consumedShotKeys: Set<string>;
}

interface InputPreparingStatus {
  readonly kind: "inputPreparing";
  readonly reason: FusionRejectReason;
}

interface GameplayInputRead {
  readonly crosshair: AimPoint2D | undefined;
  readonly shot: AimPoint2D | undefined;
  readonly status: InputPreparingStatus | undefined;
}

export const createFusedGameInputAdapter = (): FusedGameInputAdapter => ({
  consumedShotKeys: new Set<string>()
});

export const resetFusedGameInputAdapter = (
  adapter: FusedGameInputAdapter
): void => {
  adapter.consumedShotKeys.clear();
};

const crosshairFromFrame = (
  frame: FusedGameInputFrame
): AimPoint2D | undefined => {
  if (
    frame.aim?.aimAvailability === "available" ||
    frame.aim?.aimAvailability === "estimatedFromRecentFrame"
  ) {
    return frame.aim.aimPointViewport;
  }

  return undefined;
};

const shotKeyForFrame = (frame: FusedGameInputFrame): string =>
  [
    frame.fusionTimestampMs,
    frame.sideSource.frameTimestamp?.frameTimestampMs ?? "no-side-time",
    frame.sideSource.frameTimestamp?.presentedFrames ?? "no-presented-frame",
    frame.sideSource.frameTimestamp?.timestampSource ?? "no-source"
  ].join(":");

export const readFusedGameInput = (
  adapter: FusedGameInputAdapter,
  frame: FusedGameInputFrame
): GameplayInputRead => {
  const crosshair = crosshairFromFrame(frame);
  const status =
    frame.fusionMode === "noUsableInput" ||
    frame.fusionRejectReason !== "none"
      ? { kind: "inputPreparing" as const, reason: frame.fusionRejectReason }
      : undefined;

  if (
    frame.fusionMode !== "pairedFrontAndSide" ||
    !frame.shotFired ||
    crosshair === undefined
  ) {
    return { crosshair, shot: undefined, status };
  }

  const shotKey = shotKeyForFrame(frame);

  if (adapter.consumedShotKeys.has(shotKey)) {
    return { crosshair, shot: undefined, status };
  }

  adapter.consumedShotKeys.add(shotKey);

  return { crosshair, shot: crosshair, status };
};
