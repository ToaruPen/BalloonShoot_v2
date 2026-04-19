import { describe, expect, it } from "vitest";
import {
  detectGeometryJumpAndUpdateEma,
  type SideTriggerHandGeometrySignature
} from "../../../../src/features/side-trigger";

const signature = (
  wristToIndexMcp: number,
  wristToMiddleMcp: number,
  indexMcpToPinkyMcp: number
): SideTriggerHandGeometrySignature => ({
  wristToIndexMcp,
  wristToMiddleMcp,
  indexMcpToPinkyMcp
});

const config = {
  jumpRatio: 0.25,
  emaAlpha: 0.1
};

describe("detectGeometryJumpAndUpdateEma", () => {
  it("initializes EMA without treating the first signature as a jump", () => {
    const current = signature(1, 2, 3);

    expect(detectGeometryJumpAndUpdateEma(current, undefined, config)).toEqual({
      isJump: false,
      nextEma: current
    });
  });

  it("updates EMA when all component changes are below the jump ratio", () => {
    const result = detectGeometryJumpAndUpdateEma(
      signature(1.2, 2.4, 3.6),
      signature(1, 2, 3),
      config
    );

    expect(result.isJump).toBe(false);
    expect(result.nextEma).toEqual({
      wristToIndexMcp: 1.02,
      wristToMiddleMcp: 2.04,
      indexMcpToPinkyMcp: 3.06
    });
  });

  it("detects a positive jump in any component and reinitializes EMA", () => {
    const current = signature(1.3, 2, 3);

    expect(
      detectGeometryJumpAndUpdateEma(current, signature(1, 2, 3), config)
    ).toEqual({
      isJump: true,
      nextEma: current
    });
  });

  it("detects a negative jump by absolute ratio", () => {
    const current = signature(1, 1, 3);

    expect(
      detectGeometryJumpAndUpdateEma(current, signature(1, 2, 3), config)
        .isJump
    ).toBe(true);
  });

  it("converges toward repeated input over consecutive EMA updates", () => {
    const current = signature(2, 4, 6);
    let ema = signature(0, 0, 0);

    for (let index = 0; index < 100; index += 1) {
      ema = detectGeometryJumpAndUpdateEma(current, ema, {
        jumpRatio: 10_000,
        emaAlpha: 0.1
      }).nextEma;
    }

    expect(ema.wristToIndexMcp).toBeCloseTo(2, 3);
    expect(ema.wristToMiddleMcp).toBeCloseTo(4, 3);
    expect(ema.indexMcpToPinkyMcp).toBeCloseTo(6, 3);
  });

  it("uses a minimum denominator for zero-valued EMA components", () => {
    const result = detectGeometryJumpAndUpdateEma(
      signature(0.1, 0, 0),
      signature(0, 0, 0),
      config
    );

    expect(result.isJump).toBe(true);
    expect(result.nextEma.wristToIndexMcp).toBe(0.1);
  });
});
