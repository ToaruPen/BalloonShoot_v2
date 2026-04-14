import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAudioController } from "../../../../src/features/audio/createAudioController";

interface FakeAudioInstance {
  src: string;
  loop: boolean;
  currentTime: number;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
}

describe("createAudioController", () => {
  beforeEach(() => {
    const created: FakeAudioInstance[] = [];

    class FakeAudio {
      src: string;
      loop = false;
      currentTime = 0;
      play = vi.fn(() => Promise.resolve(undefined));
      pause = vi.fn(() => undefined);

      constructor(src: string) {
        this.src = src;
        created.push(this);
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
    const bgm = (globalThis as unknown as { __createdAudio: FakeAudioInstance[] }).__createdAudio[0];

    expect(bgm?.src).toBe("/audio/bgm.mp3");
    expect(bgm?.loop).toBe(true);

    await audio.startBgm();
    audio.stopBgm();

    expect(bgm?.play).toHaveBeenCalledTimes(1);
    expect(bgm?.pause).toHaveBeenCalledTimes(1);
    expect(bgm?.currentTime).toBe(0);
  });

  it("creates dedicated one-shot players for every sound effect", async () => {
    const audio = createAudioController();

    await audio.playShot();
    await audio.playHit();
    await audio.playTimeout();
    await audio.playResult();

    const created = (globalThis as unknown as { __createdAudio: FakeAudioInstance[] }).__createdAudio;
    const effectSources = created.slice(1).map((instance) => instance.src);

    expect(effectSources).toEqual([
      "/audio/shot.mp3",
      "/audio/hit.mp3",
      "/audio/time-up.mp3",
      "/audio/result.mp3"
    ]);
    created.slice(1).forEach((instance) => {
      expect(instance.play).toHaveBeenCalledTimes(1);
    });
  });

  it("surfaces one-shot playback failures to callers", async () => {
    const blocked = new Error("autoplay blocked");

    class RejectingAudio {
      src: string;
      loop = false;
      currentTime = 0;
      play = vi.fn(() =>
        this.src === "/audio/shot.mp3" ? Promise.reject(blocked) : Promise.resolve(undefined)
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
