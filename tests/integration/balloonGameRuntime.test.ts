import { describe, expect, it, vi } from "vitest";
import { createBalloonGameRuntime } from "../../src/app/balloonGameRuntime";
import type { Balloon } from "../../src/features/gameplay/domain/balloon";
import type { FusedGameInputFrame } from "../../src/shared/types/fusion";
import {
  createAimFrame,
  createTriggerFrame
} from "../unit/features/input-fusion/testFactory";

const createFusedFrame = (
  patch: Partial<FusedGameInputFrame> = {}
): FusedGameInputFrame => ({
  fusionTimestampMs: 4_016,
  fusionMode: "pairedFrontAndSide",
  timeDeltaBetweenLanesMs: 0,
  aim: createAimFrame(4_016, {
    aimPointViewport: { x: 100, y: 100 },
    aimPointNormalized: { x: 0.2, y: 0.2 }
  }),
  trigger: createTriggerFrame(4_016, {
    triggerEdge: "shotCommitted",
    triggerPulled: true
  }),
  shotFired: true,
  inputConfidence: 0.9,
  frontSource: {
    laneRole: "frontAim",
    frameTimestamp: createAimFrame(4_016).timestamp,
    frameAgeMs: 0,
    laneHealth: "tracking",
    availability: "available",
    rejectReason: "none"
  },
  sideSource: {
    laneRole: "sideTrigger",
    frameTimestamp: createTriggerFrame(4_016).timestamp,
    frameAgeMs: 0,
    laneHealth: "tracking",
    availability: "available",
    rejectReason: "none"
  },
  fusionRejectReason: "none",
  ...patch
});

const createRaf = () => {
  let callback: FrameRequestCallback | undefined;

  return {
    requestAnimationFrame: vi.fn((next: FrameRequestCallback) => {
      callback = next;
      return 1;
    }),
    cancelAnimationFrame: vi.fn(),
    fire(nowMs: number) {
      const next = callback;
      callback = undefined;
      next?.(nowMs);
    }
  };
};

const createCanvas = () =>
  ({
    width: 640,
    height: 480,
    clientWidth: 640,
    clientHeight: 480,
    getContext: vi.fn(() => ({ canvas: { width: 640, height: 480 } }))
  }) as unknown as HTMLCanvasElement;

const createAudio = () => ({
  startBgm: vi.fn(() => Promise.resolve()),
  stopBgm: vi.fn(),
  playShot: vi.fn(() => Promise.resolve()),
  playHit: vi.fn(() => Promise.resolve()),
  playTimeout: vi.fn(() => Promise.resolve()),
  playResult: vi.fn(() => Promise.resolve())
});

describe("createBalloonGameRuntime", () => {
  it("processes one fused shot once across repeated render ticks", () => {
    const raf = createRaf();
    const hudRoot = { innerHTML: "" } as HTMLElement;
    const drawGameFrame = vi.fn();
    const audio = createAudio();
    const balloon: Balloon = {
      id: "target",
      x: 100,
      y: 100,
      radius: 32,
      vy: 0,
      size: "normal",
      alive: true
    };
    const frame = createFusedFrame();
    const runtime = createBalloonGameRuntime({
      frontDeviceId: "front",
      sideDeviceId: "side",
      frontVideo: {} as HTMLVideoElement,
      sideVideo: {} as HTMLVideoElement,
      canvas: createCanvas(),
      hudRoot,
      readFusedInputFrame: () => frame,
      initialBalloons: [balloon],
      nowMs: () => 0,
      createAudioController: () => audio,
      drawGameFrame,
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame
    });

    runtime.start();
    raf.fire(4_000);
    raf.fire(4_016);
    raf.fire(4_032);

    expect(audio.playShot).toHaveBeenCalledTimes(1);
    expect(audio.playHit).toHaveBeenCalledTimes(1);
    expect(hudRoot.innerHTML).toMatch(
      /<span[^>]*>スコア<\/span>\s*<strong[^>]*>1<\/strong>/
    );
    expect(drawGameFrame).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        crosshair: { x: 100, y: 100 },
        shotEffect: { x: 100, y: 100 }
      })
    );
  });

  it("fires time-up and result audio once when playing duration ends", () => {
    const raf = createRaf();
    const hudRoot = { innerHTML: "" } as HTMLElement;
    const audio = createAudio();
    const runtime = createBalloonGameRuntime({
      frontDeviceId: "front",
      sideDeviceId: "side",
      frontVideo: {} as HTMLVideoElement,
      sideVideo: {} as HTMLVideoElement,
      canvas: createCanvas(),
      hudRoot,
      readFusedInputFrame: () => undefined,
      nowMs: () => 0,
      createAudioController: () => audio,
      drawGameFrame: vi.fn(),
      requestAnimationFrame: raf.requestAnimationFrame,
      cancelAnimationFrame: raf.cancelAnimationFrame
    });

    runtime.start();
    raf.fire(4_000);
    raf.fire(64_000);
    raf.fire(64_016);

    expect(audio.stopBgm).toHaveBeenCalledTimes(1);
    expect(audio.playTimeout).toHaveBeenCalledTimes(1);
    expect(audio.playResult).toHaveBeenCalledTimes(1);
    expect(hudRoot.innerHTML).toContain("結果");
    expect(hudRoot.innerHTML).toContain('data-game-action="retry"');
  });
});
