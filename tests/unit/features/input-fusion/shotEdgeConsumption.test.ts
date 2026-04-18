import { describe, expect, it } from "vitest";
import { createShotEdgeConsumption } from "../../../../src/features/input-fusion";
import type { TriggerInputFrame } from "../../../../src/shared/types/trigger";
import { createTriggerFrame } from "./testFactory";

describe("shot edge consumption", () => {
  it.each(["shotCommitted", "pullStarted+shotCommitted"] as const)(
    "fires %s once for one accepted pair",
    (triggerEdge) => {
      const consumption = createShotEdgeConsumption();
      const frame = createTriggerFrame(100, { triggerEdge });

      expect(consumption.consumeIfShotCommit(frame)).toBe(true);
      expect(consumption.consumeIfShotCommit(frame)).toBe(false);
    }
  );

  it("does not consume side-only diagnostic edges until an accepted pair exists", () => {
    const consumption = createShotEdgeConsumption();
    const frame = createTriggerFrame(100, {
      triggerEdge: "shotCommitted"
    });

    expect(consumption.peekIsUnconsumedShotCommit(frame)).toBe(true);
    expect(consumption.peekIsUnconsumedShotCommit(frame)).toBe(true);
    expect(consumption.consumeIfShotCommit(frame)).toBe(true);
  });

  it("reset allows a future side stream edge to fire", () => {
    const consumption = createShotEdgeConsumption();
    const frame = createTriggerFrame(100, {
      triggerEdge: "shotCommitted"
    });

    expect(consumption.consumeIfShotCommit(frame)).toBe(true);
    consumption.reset();
    expect(consumption.consumeIfShotCommit(frame)).toBe(true);
  });

  it("does not consume future edge names by partial match", () => {
    const consumption = createShotEdgeConsumption();
    const frame = {
      ...createTriggerFrame(100),
      triggerEdge: "notshotCommittedForDiagnostics"
    } as unknown as TriggerInputFrame;

    expect(consumption.peekIsUnconsumedShotCommit(frame)).toBe(false);
    expect(consumption.consumeIfShotCommit(frame)).toBe(false);
  });
});
