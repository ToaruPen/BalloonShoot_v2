import { describe, expect, it } from "vitest";
import { createFusionFrameBuffers } from "../../../../src/features/input-fusion";
import { createAimFrame, createTriggerFrame } from "./testFactory";

describe("fusion frame buffers", () => {
  it("stores frames sorted by timestamp without mutating them", () => {
    const buffers = createFusionFrameBuffers();
    const later = createAimFrame(200);
    const earlier = createAimFrame(100);

    buffers.addFrontFrame(later, 500);
    buffers.addFrontFrame(earlier, 500);

    expect(buffers.frontFrames).toEqual([earlier, later]);
    expect(later.timestamp.frameTimestampMs).toBe(200);
  });

  it("prunes old front and side frames by retention window", () => {
    const buffers = createFusionFrameBuffers();

    buffers.addFrontFrame(createAimFrame(100), 50);
    buffers.addFrontFrame(createAimFrame(180), 50);
    buffers.addSideFrame(createTriggerFrame(90), 50);
    buffers.addSideFrame(createTriggerFrame(181), 50);

    expect(buffers.frontFrames.map((frame) => frame.timestamp.frameTimestampMs))
      .toEqual([180]);
    expect(buffers.sideFrames.map((frame) => frame.timestamp.frameTimestampMs))
      .toEqual([181]);
  });

  it("clears front and side buffers independently", () => {
    const buffers = createFusionFrameBuffers();
    buffers.addFrontFrame(createAimFrame(100), 200);
    buffers.addSideFrame(createTriggerFrame(100), 200);

    buffers.clearFront();
    expect(buffers.frontFrames).toEqual([]);
    expect(buffers.sideFrames).toHaveLength(1);

    buffers.clearSide();
    expect(buffers.sideFrames).toEqual([]);
  });
});
