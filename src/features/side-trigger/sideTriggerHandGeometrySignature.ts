import type { SideTriggerHandGeometrySignature } from "./sideTriggerRawMetric";

const MIN_RATIO_DENOMINATOR = 0.001;

export interface GeometryJumpDetectionResult {
  readonly isJump: boolean;
  readonly nextEma: SideTriggerHandGeometrySignature;
}

const blend = (previous: number, current: number, alpha: number): number =>
  (1 - alpha) * previous + alpha * current;

const componentJumped = (
  current: number,
  previous: number,
  jumpRatio: number
): boolean =>
  Math.abs(current - previous) / Math.max(previous, MIN_RATIO_DENOMINATOR) >
  jumpRatio;

export const detectGeometryJumpAndUpdateEma = (
  current: SideTriggerHandGeometrySignature,
  previousEma: SideTriggerHandGeometrySignature | undefined,
  config: { readonly jumpRatio: number; readonly emaAlpha: number }
): GeometryJumpDetectionResult => {
  if (previousEma === undefined) {
    return {
      isJump: false,
      nextEma: current
    };
  }

  const isJump =
    componentJumped(
      current.wristToIndexMcp,
      previousEma.wristToIndexMcp,
      config.jumpRatio
    ) ||
    componentJumped(
      current.wristToMiddleMcp,
      previousEma.wristToMiddleMcp,
      config.jumpRatio
    ) ||
    componentJumped(
      current.indexMcpToPinkyMcp,
      previousEma.indexMcpToPinkyMcp,
      config.jumpRatio
    );

  if (isJump) {
    return {
      isJump,
      nextEma: current
    };
  }

  return {
    isJump,
    nextEma: {
      wristToIndexMcp: blend(
        previousEma.wristToIndexMcp,
        current.wristToIndexMcp,
        config.emaAlpha
      ),
      wristToMiddleMcp: blend(
        previousEma.wristToMiddleMcp,
        current.wristToMiddleMcp,
        config.emaAlpha
      ),
      indexMcpToPinkyMcp: blend(
        previousEma.indexMcpToPinkyMcp,
        current.indexMcpToPinkyMcp,
        config.emaAlpha
      )
    }
  };
};
