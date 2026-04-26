import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAudioController } from "../../../../src/features/audio/createAudioController";

interface FakeAudioInstance {
  src: string;
  loop: boolean;
  currentTime: number;
  volume: number;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatch(type: string): void;
}

describe("createAudioController", () => {
  beforeEach(() => {
    const created: FakeAudioInstance[] = [];

    class FakeAudio {
      src: string;
      loop = false;
      currentTime = 0;
      volume = 1;
      listeners = new Map<string, Set<() => void>>();
      play = vi.fn(() => Promise.resolve(undefined));
      pause = vi.fn(() => undefined);
      addEventListener = vi.fn((type: string, listener: () => void) => {
        const listeners = this.listeners.get(type) ?? new Set<() => void>();
        listeners.add(listener);
        this.listeners.set(type, listeners);
      });
      removeEventListener = vi.fn((type: string, listener: () => void) => {
        this.listeners.get(type)?.delete(listener);
      });

      constructor(src: string) {
        this.src = src;
        created.push(this);
      }

      dispatch(type: string): void {
        for (const listener of this.listeners.get(type) ?? []) {
          listener();
        }
      }
    }

    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      value: FakeAudio
    });
    Object.defineProperty(globalThis, "__createdAudio", {
      configurable: true,
      value: created
    });
  });

  it("loops bgm and resets it on stop", async () => {
    const audio = createAudioController();
    const bgm = (
      globalThis as unknown as { __createdAudio: FakeAudioInstance[] }
    ).__createdAudio[0];

    expect(bgm?.src).toBe("/audio/bgm.mp3");
    expect(bgm?.loop).toBe(true);

    await audio.startBgm();
    audio.stopBgm();

    expect(bgm?.play).toHaveBeenCalledTimes(1);
    expect(bgm?.pause).toHaveBeenCalledTimes(1);
    expect(bgm?.currentTime).toBe(0);
  });

  it("uses named mix levels and can briefly duck bgm", () => {
    const audio = createAudioController();
    const bgm = (
      globalThis as unknown as { __createdAudio: FakeAudioInstance[] }
    ).__createdAudio[0];

    expect(bgm?.volume).toBe(0.13);
    audio.duckBgm(0.07);
    expect(bgm?.volume).toBe(0.07);
    audio.restoreBgmVolume();
    expect(bgm?.volume).toBe(0.13);
  });

  it("uses the default ducked bgm volume when no volume is passed", () => {
    const audio = createAudioController();
    const bgm = (
      globalThis as unknown as { __createdAudio: FakeAudioInstance[] }
    ).__createdAudio[0];

    audio.duckBgm();

    expect(bgm?.volume).toBe(0.07);
  });

  it("creates dedicated one-shot players for every sound effect", async () => {
    const audio = createAudioController();

    await audio.playShot();
    await audio.playHit();
    const timeoutPlayback = audio.playTimeout();
    await Promise.resolve();
    (
      globalThis as unknown as { __createdAudio: FakeAudioInstance[] }
    ).__createdAudio.at(-1)?.dispatch("ended");
    await timeoutPlayback;
    await audio.playResult();

    const created = (
      globalThis as unknown as { __createdAudio: FakeAudioInstance[] }
    ).__createdAudio;
    const effectSources = created.slice(1).map((instance) => instance.src);

    expect(effectSources).toEqual([
      "/audio/shot.mp3",
      "/audio/hit.mp3",
      "/audio/time-up.mp3",
      "/audio/result.mp3"
    ]);
    created.slice(1).forEach((instance) => {
      expect(instance.play).toHaveBeenCalledTimes(1);
      expect(instance.volume).toBe(0.5);
    });
  });

  it("resolves timeout playback after the time-up clip ends", async () => {
    const audio = createAudioController();
    let resolved = false;

    const timeoutPlayback = audio.playTimeout().then(() => {
      resolved = true;
    });
    await Promise.resolve();

    const created = (
      globalThis as unknown as { __createdAudio: FakeAudioInstance[] }
    ).__createdAudio;
    const timeoutAudio = created.at(-1);

    expect(timeoutAudio?.src).toBe("/audio/time-up.mp3");
    expect(timeoutAudio?.play).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(false);

    timeoutAudio?.dispatch("ended");
    await timeoutPlayback;

    expect(resolved).toBe(true);
    expect(timeoutAudio?.removeEventListener).toHaveBeenCalled();
  });

  it("surfaces one-shot playback failures to callers", async () => {
    const blocked = new Error("autoplay blocked");

    class RejectingAudio {
      src: string;
      loop = false;
      currentTime = 0;
      volume = 1;
      play = vi.fn(() =>
        this.src === "/audio/shot.mp3"
          ? Promise.reject(blocked)
          : Promise.resolve(undefined)
      );
      pause = vi.fn(() => undefined);

      constructor(src: string) {
        this.src = src;
      }
    }

    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      value: RejectingAudio
    });

    const audio = createAudioController();

    await expect(audio.playShot()).rejects.toThrow("autoplay blocked");
  });
});
