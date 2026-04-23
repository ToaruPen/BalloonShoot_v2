import { describe, expect, it } from "vitest";
import { drawGameFrame } from "../../../../src/features/rendering/drawGameFrame";
import type { BalloonSprites } from "../../../../src/features/rendering/loadBalloonSprites";

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
    drawImage: (
      image: CanvasImageSource,
      dx: number,
      dy: number,
      dw: number,
      dh: number
    ) => {
      const tag =
        (image as { dataset?: { tag?: string } }).dataset?.tag ?? "image";
      operations.push(
        `drawImage:${tag},${String(dx)},${String(dy)},${String(dw)},${String(dh)}`
      );
    },
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 0
  }) as unknown as CanvasRenderingContext2D;

const createMockSprites = (frameTags: string[]): BalloonSprites => ({
  frames: frameTags.map((tag) =>
    ({
      naturalWidth: 94,
      naturalHeight: 187,
      dataset: { tag }
    }) as unknown as HTMLImageElement
  )
});

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

  it("omits dead balloons and unavailable crosshair", () => {
    const operations: string[] = [];
    const ctx = createMockContext(operations);

    drawGameFrame(ctx, {
      balloons: [
        {
          id: "dead",
          x: 120,
          y: 160,
          radius: 52,
          vy: 36,
          size: "normal",
          alive: false
        }
      ],
      crosshair: undefined
    });

    expect(operations).toEqual(["clear"]);
  });

  it("draws balloon sprites instead of arcs when sprites are provided", () => {
    const operations: string[] = [];
    const ctx = createMockContext(operations);
    const sprites = createMockSprites(["frame0", "frame1", "frame2"]);

    drawGameFrame(ctx, {
      balloons: [
        { id: "b1", x: 200, y: 300, radius: 50, vy: 36, size: "normal", alive: true }
      ],
      crosshair: undefined,
      balloonSprites: sprites,
      balloonFrameIndex: 1
    });

    const drawImageEntry = operations.find((op) => op.startsWith("drawImage:"));
    expect(drawImageEntry).toBeDefined();
    expect(drawImageEntry).toContain("frame1");
    expect(operations).not.toContain("fill");
    expect(
      operations.find((op) => op.startsWith("arc:200,300,50"))
    ).toBeUndefined();
  });

  it("falls back to circles when balloon sprites are absent", () => {
    const operations: string[] = [];
    const ctx = createMockContext(operations);

    drawGameFrame(ctx, {
      balloons: [
        { id: "b1", x: 120, y: 160, radius: 52, vy: 36, size: "normal", alive: true }
      ],
      crosshair: undefined
    });

    expect(operations).toContain("arc:120,160,52");
    expect(operations.find((op) => op.startsWith("drawImage:"))).toBeUndefined();
  });

  it("wraps balloonFrameIndex modulo the available frame count", () => {
    const operations: string[] = [];
    const ctx = createMockContext(operations);
    const sprites = createMockSprites(["frame0", "frame1", "frame2"]);

    drawGameFrame(ctx, {
      balloons: [
        { id: "b1", x: 200, y: 300, radius: 50, vy: 36, size: "normal", alive: true }
      ],
      crosshair: undefined,
      balloonSprites: sprites,
      balloonFrameIndex: 7
    });

    const drawImageEntry = operations.find((op) => op.startsWith("drawImage:"));
    expect(drawImageEntry).toContain("frame1");
  });

  it("draws shot and hit effects without mutating balloons", () => {
    const operations: string[] = [];
    const ctx = createMockContext(operations);
    const balloons = [
      {
        id: "b1",
        x: 120,
        y: 160,
        radius: 52,
        vy: 36,
        size: "normal" as const,
        alive: true
      }
    ];

    drawGameFrame(ctx, {
      balloons,
      crosshair: undefined,
      shotEffect: { x: 240, y: 180 },
      hitEffect: { x: 120, y: 160 }
    });

    expect(operations).toContain("arc:240,180,14");
    expect(operations).toContain("arc:120,160,34");
    expect(balloons).toEqual([
      {
        id: "b1",
        x: 120,
        y: 160,
        radius: 52,
        vy: 36,
        size: "normal",
        alive: true
      }
    ]);
  });
});
