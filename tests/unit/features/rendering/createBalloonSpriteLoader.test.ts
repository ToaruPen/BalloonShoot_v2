import { describe, expect, it, vi } from "vitest";
import { createBalloonSpriteLoader } from "../../../../src/features/rendering/createBalloonSpriteLoader";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
};

describe("createBalloonSpriteLoader", () => {
  it("starts loading at most once while a load is pending", async () => {
    const pending = deferred<string>();
    const load = vi.fn(() => pending.promise);
    const loader = createBalloonSpriteLoader({
      load,
      onLoaded: vi.fn(),
      onError: vi.fn()
    });

    loader.ensureStarted();
    loader.ensureStarted();
    await flushMicrotasks();

    expect(load).toHaveBeenCalledOnce();
  });

  it("reports loaded sprites once and does not reload after success", async () => {
    const pending = deferred<string>();
    const load = vi.fn(() => pending.promise);
    const onLoaded = vi.fn();
    const loader = createBalloonSpriteLoader({
      load,
      onLoaded,
      onError: vi.fn()
    });

    loader.ensureStarted();
    await flushMicrotasks();
    pending.resolve("sprites");
    await pending.promise;
    await flushMicrotasks();

    expect(onLoaded).toHaveBeenCalledWith("sprites");
    loader.ensureStarted();
    expect(load).toHaveBeenCalledOnce();
  });

  it("reports errors and allows a later retry", async () => {
    const loadError = new Error("load failed");
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(loadError)
      .mockResolvedValueOnce("sprites");
    const onError = vi.fn();
    const onLoaded = vi.fn();
    const loader = createBalloonSpriteLoader({
      load,
      onLoaded,
      onError
    });

    loader.ensureStarted();
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(loadError);
    });

    loader.ensureStarted();
    await vi.waitFor(() => {
      expect(onLoaded).toHaveBeenCalledWith("sprites");
    });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
