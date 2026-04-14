import { describe, expect, it } from "vitest";
import { drawGameFrame } from "../../../../src/features/rendering/drawGameFrame";

const createMockContext = (operations: string[]): CanvasRenderingContext2D =>
  ({
    canvas: { width: 960, height: 540 },
    clearRect: () => operations.push("clear"),
    beginPath: () => operations.push("begin"),
    arc: (x: number, y: number, radius: number) => {
      operations.push(`arc:${String(x)},${String(y)},${String(radius)}`);
    },
    fill: () => operations.push("fill"),
    moveTo: (x: number, y: number) => operations.push(`move:${String(x)},${String(y)}`),
    lineTo: (x: number, y: number) => operations.push(`line:${String(x)},${String(y)}`),
    stroke: () => operations.push("stroke"),
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 0
  }) as unknown as CanvasRenderingContext2D;

describe("drawGameFrame", () => {
  it("draws balloons and the crosshair overlay", () => {
    const operations: string[] = [];
    const ctx = createMockContext(operations);

    drawGameFrame(ctx, {
      balloons: [{ id: "b1", x: 120, y: 160, radius: 52, vy: 36, size: "normal", alive: true }],
      crosshair: { x: 200, y: 180 }
    });

    expect(operations).toContain("clear");
    expect(operations).toContain("arc:120,160,52");
    expect(operations).toContain("arc:200,180,24");
    expect(operations).toContain("stroke");
  });
});
