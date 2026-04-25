import { describe, expect, it } from "vitest";
import { drawGameFrame } from "../../../../src/features/rendering/drawGameFrame";
import type { BalloonSprites } from "../../../../src/features/rendering/balloonSpriteUtils";

const createMockContext = (operations: string[]): CanvasRenderingContext2D =>
  ({
    canvas: { width: 960, height: 540 },
    clearRect: () => operations.push("clear"),
    beginPath: () => operations.push("begin"),
    arc: (x: number, y: number, radius: number) => {
      operations.push(`arc:${String(x)},${String(y)},${String(radius)}`);
    },
    fill: () => operations.push("fill"),
    moveTo: (x: number, y: number) =>
      operations.push(`move:${String(x)},${String(y)}`),
    lineTo: (x: number, y: number) =>
      operations.push(`line:${String(x)},${String(y)}`),
    stroke: () => operations.push("stroke"),
    save: () => operations.push("save"),
    restore: () => operations.push("restore"),
    translate: (x: number, y: number) =>
      operations.push(`translate:${String(x)},${String(y)}`),
    scale: (x: number, y: number) =>
      operations.push(`scale:${String(x)},${String(y)}`),
    fillRect: (x: number, y: number, w: number, h: number) =>
      operations.push(
        `fillRect:${String(x)},${String(y)},${String(w)},${String(h)}`
      ),
    strokeRect: (x: number, y: number, w: number, h: number) =>
      operations.push(
        `strokeRect:${String(x)},${String(y)},${String(w)},${String(h)}`
      ),
    fillText: (text: string, x: number, y: number) =>
      operations.push(`fillText:${text},${String(x)},${String(y)}`),
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
    lineWidth: 0,
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    globalAlpha: 1
  }) as unknown as CanvasRenderingContext2D;

const createMockSprites = (frameTags: string[]): BalloonSprites => ({
  frames: frameTags.map(
    (tag) =>
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
      balloons: [
        {
          id: "b1",
          x: 120,
          y: 160,
          radius: 52,
          vy: 36,
          size: "normal",
          alive: true
        }
      ],
      crosshair: { x: 200, y: 180 }
    });

    expect(operations).toContain("clear");
    expect(operations).toContain("arc:120,160,52");
    expect(operations).toContain("translate:200,180");
    expect(operations).toContain("arc:0,0,24");
    expect(operations).toContain("move:-21,0");
    expect(operations).toContain("line:21,0");
    expect(operations).toContain("move:0,-21");
    expect(operations).toContain("line:0,21");
    expect(operations).not.toContain("arc:0,0,4");
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

  it("draws stable arcade balloon variants instead of arcs when sprites are provided", () => {
    const operations: string[] = [];
    const ctx = createMockContext(operations);
    const sprites = createMockSprites([
      "normal-candy",
      "normal-mint",
      "small-alert"
    ]);

    drawGameFrame(ctx, {
      balloons: [
        {
          id: "b2",
          x: 200,
          y: 300,
          radius: 50,
          vy: 36,
          size: "normal",
          alive: true
        },
        {
          id: "small",
          x: 340,
          y: 260,
          radius: 30,
          vy: 48,
          size: "small",
          alive: true
        }
      ],
      crosshair: undefined,
      balloonSprites: sprites
    });

    const drawImageEntries = operations.filter((op) =>
      op.startsWith("drawImage:")
    );
    expect(drawImageEntries).toHaveLength(2);
    expect(drawImageEntries[0]).toContain("normal-candy");
    expect(drawImageEntries[1]).toContain("small-alert");
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
        {
          id: "b1",
          x: 120,
          y: 160,
          radius: 52,
          vy: 36,
          size: "normal",
          alive: true
        }
      ],
      crosshair: undefined
    });

    expect(operations).toContain("arc:120,160,52");
    expect(
      operations.find((op) => op.startsWith("drawImage:"))
    ).toBeUndefined();
  });

  it("keeps each balloon sprite stable across frame timestamps", () => {
    const operations: string[] = [];
    const ctx = createMockContext(operations);
    const sprites = createMockSprites([
      "normal-candy",
      "normal-mint",
      "small-alert"
    ]);
    const balloon = {
      id: "b2",
      x: 200,
      y: 300,
      radius: 50,
      vy: 36,
      size: "normal" as const,
      alive: true
    };

    drawGameFrame(ctx, {
      balloons: [balloon],
      crosshair: undefined,
      balloonSprites: sprites,
      frameNowMs: 0
    });
    drawGameFrame(ctx, {
      balloons: [balloon],
      crosshair: undefined,
      balloonSprites: sprites,
      frameNowMs: 10_000
    });

    const drawImageEntries = operations.filter((op) =>
      op.startsWith("drawImage:")
    );
    expect(drawImageEntries).toHaveLength(2);
    expect(drawImageEntries[0]).toContain("normal-candy");
    expect(drawImageEntries[1]).toContain("normal-candy");
  });

  it("falls back to the first sprite when a small arcade variant is unavailable", () => {
    const operations: string[] = [];
    const ctx = createMockContext(operations);
    const sprites = createMockSprites(["only-frame"]);

    drawGameFrame(ctx, {
      balloons: [
        {
          id: "b1",
          x: 200,
          y: 300,
          radius: 50,
          vy: 36,
          size: "small",
          alive: true
        }
      ],
      crosshair: undefined,
      balloonSprites: sprites
    });

    const drawImageEntry = operations.find((op) => op.startsWith("drawImage:"));
    expect(drawImageEntry).toBeDefined();
    expect(drawImageEntry).toContain("only-frame");
  });

  it("draws arcade hit rings, shards, and floating score labels", () => {
    const operations: string[] = [];
    const ctx = createMockContext(operations);

    drawGameFrame(ctx, {
      balloons: [],
      crosshair: { x: 200, y: 180 },
      frameNowMs: 1_100,
      shotEffect: { x: 200, y: 180, startedAtMs: 1_050 },
      hitEffects: [
        {
          x: 200,
          y: 180,
          startedAtMs: 1_000,
          points: 3,
          scoreLabel: "+3",
          color: "#ff5a8a",
          shards: [{ dx: -70, dy: -54, rotationDeg: -28, color: "#ff5a8a" }]
        }
      ]
    });

    expect(operations).toContain("scale:0.7666666666666666,0.7666666666666666");
    expect(operations).toContain("fillText:+3,242,98");
    expect(operations.some((op) => op.startsWith("fillRect:"))).toBe(true);
  });
});
