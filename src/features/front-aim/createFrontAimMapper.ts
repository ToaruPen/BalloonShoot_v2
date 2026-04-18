import type {
  AimInputFrame,
  FrontAimLastLostReason,
  FrontAimTelemetry
} from "../../shared/types/aim";
import type { FrontHandDetection } from "../../shared/types/hand";
import {
  FRONT_AIM_LOST_FRAME_GRACE_FRAMES,
  FRONT_AIM_MIN_TRACKING_CONFIDENCE
} from "./frontAimConstants";
import type { FrontAimProjectionOptions } from "./frontAimProjection";
import { mapFrontHandToAimInput } from "./mapFrontHandToAimInput";
import { telemetryFromAimFrame } from "./frontAimTelemetry";

interface FrontAimMapperUpdate {
  readonly detection: FrontHandDetection | undefined;
  readonly viewportSize: { readonly width: number; readonly height: number };
  readonly projectionOptions?: FrontAimProjectionOptions;
}

interface FrontAimMapperResult {
  readonly aimFrame: AimInputFrame | undefined;
  readonly telemetry: FrontAimTelemetry;
}

interface FrontAimMapper {
  update(update: FrontAimMapperUpdate): FrontAimMapperResult;
  reset(): void;
}

const withAvailability = (
  frame: AimInputFrame,
  aimAvailability: AimInputFrame["aimAvailability"],
  frontHandDetected: boolean
): AimInputFrame => ({
  ...frame,
  aimAvailability,
  frontHandDetected,
  aimSmoothingState:
    aimAvailability === "estimatedFromRecentFrame"
      ? "recoveringAfterLoss"
      : frame.aimSmoothingState
});

const lostReasonFor = (
  detection: FrontHandDetection | undefined
): FrontAimLastLostReason | undefined => {
  if (detection === undefined) {
    return "handNotDetected";
  }

  if (detection.handPresenceConfidence < FRONT_AIM_MIN_TRACKING_CONFIDENCE) {
    return "lowHandConfidence";
  }

  if (detection.trackingQuality === "lost") {
    return "trackingQualityLost";
  }

  return undefined;
};

export const createFrontAimMapper = (): FrontAimMapper => {
  let sourceKey: string | undefined;
  let latestAimFrame: AimInputFrame | undefined;
  let hasTrackedCurrentSource = false;
  let lostFrameCount = 0;

  const reset = (): void => {
    sourceKey = undefined;
    latestAimFrame = undefined;
    hasTrackedCurrentSource = false;
    lostFrameCount = 0;
  };

  return {
    update(update) {
      const { detection } = update;
      const lostReason = lostReasonFor(detection);

      if (detection !== undefined) {
        const nextSourceKey = `${detection.deviceId}:${detection.streamId}`;

        if (nextSourceKey !== sourceKey) {
          sourceKey = nextSourceKey;
          latestAimFrame = undefined;
          hasTrackedCurrentSource = false;
          lostFrameCount = 0;
        }
      }

      if (detection === undefined) {
        lostFrameCount += 1;

        if (
          latestAimFrame !== undefined &&
          lostFrameCount <= FRONT_AIM_LOST_FRAME_GRACE_FRAMES
        ) {
          const estimatedFrame = withAvailability(
            latestAimFrame,
            "estimatedFromRecentFrame",
            false
          );

          return {
            aimFrame: estimatedFrame,
            telemetry: telemetryFromAimFrame(estimatedFrame, {
              lastLostReason: "handNotDetected"
            })
          };
        }

        return {
          aimFrame: undefined,
          telemetry: telemetryFromAimFrame(undefined, {
            lastLostReason: "handNotDetected"
          })
        };
      }

      if (lostReason !== undefined) {
        latestAimFrame = undefined;
        lostFrameCount = 0;
        return {
          aimFrame: undefined,
          telemetry: telemetryFromAimFrame(undefined, {
            lastLostReason: lostReason,
            frontTrackingConfidence: detection.handPresenceConfidence
          })
        };
      }

      lostFrameCount = 0;
      const aimFrame = mapFrontHandToAimInput({
        detection,
        viewportSize: update.viewportSize,
        aimSmoothingState: hasTrackedCurrentSource ? "tracking" : "coldStart",
        ...(update.projectionOptions === undefined
          ? {}
          : { projectionOptions: update.projectionOptions })
      });
      latestAimFrame = aimFrame;
      hasTrackedCurrentSource = true;

      return {
        aimFrame,
        telemetry: telemetryFromAimFrame(aimFrame)
      };
    },
    reset
  };
};
