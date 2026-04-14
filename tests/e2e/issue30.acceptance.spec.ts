import { expect, test, type Page } from "@playwright/test";
import type { HandFrame } from "../../src/shared/types/hand";
import {
  createThumbTriggerFrame,
  withThumbTriggerPose
} from "../unit/features/input-mapping/thumbTriggerTestHelper";

interface TelemetrySnapshot {
  phase: string | null;
  rejectReason: string | null;
  trigger: string | null;
  gunPose: string | null;
  counters: string | null;
}

interface BrowserTestHooks {
  createHandTracker: () => Promise<{
    detect: (bitmap: ImageBitmap, frameAtMs: number) => Promise<HandFrame | undefined>;
  }>;
  getDetectCount: () => number;
  advanceCountdown: (ticks: number) => void;
  attachTelemetryObserver: () => void;
  getTelemetryTimeline: () => TelemetrySnapshot[];
}

declare global {
  interface Window {
    __balloonShootTestHooks?: BrowserTestHooks;
  }
}

const createBaseFrame = (): HandFrame => createThumbTriggerFrame("open");

const createFrameSequence = (
  frames: (HandFrame | undefined)[]
): (HandFrame | null)[] => frames.map((frame) => frame ?? null);

const bootHarness = async (page: Page, frames: (HandFrame | undefined)[]): Promise<void> => {
  await page.addInitScript(
    ({ scriptedFrames }) => {
      const frames = scriptedFrames.slice();
      let detectCount = 0;
      const intervalCallbacks = new Map<number, () => void>();
      let nextIntervalId = 1;
      const telemetryTimeline: TelemetrySnapshot[] = [];
      let telemetryObserver: MutationObserver | undefined;
      let snapshotScheduled = false;

      const snapshotCanvas = document.createElement("canvas");
      snapshotCanvas.width = 2;
      snapshotCanvas.height = 2;

      const snapshotContext = snapshotCanvas.getContext("2d");

      snapshotContext?.fillRect(0, 0, 2, 2);

      const mediaStream = snapshotCanvas.captureStream(1);

      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: () => Promise.resolve(mediaStream)
        }
      });

      Object.defineProperty(window, "ImageCapture", {
        configurable: true,
        value: class {
          grabFrame(): Promise<ImageBitmap> {
            return createImageBitmap(snapshotCanvas);
          }
        }
      });

      Object.defineProperty(window, "setInterval", {
        configurable: true,
        value: (callback: TimerHandler) => {
          const timerId = nextIntervalId;
          nextIntervalId += 1;

          intervalCallbacks.set(timerId, () => {
            if (typeof callback === "function") {
              const timerCallback = callback as () => void;
              timerCallback();
            }
          });

          return timerId;
        }
      });

      Object.defineProperty(window, "clearInterval", {
        configurable: true,
        value: (timerId: number) => {
          intervalCallbacks.delete(timerId);
        }
      });

      HTMLMediaElement.prototype.play = () => Promise.resolve();

      const readTelemetrySnapshot = () => ({
        phase: document.querySelector('[data-debug-output="phase"]')?.textContent ?? null,
        rejectReason: document.querySelector('[data-debug-output="rejectReason"]')?.textContent ?? null,
        trigger: document.querySelector('[data-debug-output="trigger"]')?.textContent ?? null,
        gunPose: document.querySelector('[data-debug-output="gunPose"]')?.textContent ?? null,
        counters: document.querySelector('[data-debug-output="counters"]')?.textContent ?? null
      });

      const pushTelemetrySnapshot = () => {
        snapshotScheduled = false;
        const snapshot = readTelemetrySnapshot();
        const previous = telemetryTimeline.at(-1);

        if (!previous || JSON.stringify(previous) !== JSON.stringify(snapshot)) {
          telemetryTimeline.push(snapshot);
        }
      };

      const scheduleTelemetrySnapshot = () => {
        if (snapshotScheduled) {
          return;
        }

        snapshotScheduled = true;
        queueMicrotask(pushTelemetrySnapshot);
      };

      window.__balloonShootTestHooks = {
        createHandTracker: () =>
          Promise.resolve({
            detect: () => {
              if (detectCount >= frames.length) {
                return Promise.resolve(undefined);
              }

              const nextFrame = frames[detectCount];
              detectCount += 1;
              return Promise.resolve(nextFrame ?? undefined);
            }
          }),
        getDetectCount: () => detectCount,
        advanceCountdown: (ticks: number) => {
          for (let index = 0; index < ticks; index += 1) {
            for (const callback of Array.from(intervalCallbacks.values())) {
              callback();
            }
          }
        },
        attachTelemetryObserver: () => {
          if (telemetryObserver) {
            return;
          }

          scheduleTelemetrySnapshot();
          telemetryObserver = new MutationObserver(scheduleTelemetrySnapshot);
          telemetryObserver.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
          });
        },
        getTelemetryTimeline: () => telemetryTimeline.map((entry) => ({ ...entry }))
      };
    },
    { scriptedFrames: createFrameSequence(frames) }
  );

  await page.goto("/");
  await expect(page.locator('[data-debug-output="phase"]')).toHaveText("--");
  await expect(page.locator('[data-debug-output="rejectReason"]')).toHaveText("--");
  await expect(page.locator('[data-debug-output="trigger"]')).toHaveText("--");
  await expect(page.locator('[data-debug-output="gunPose"]')).toHaveText("--");
  await expect(page.locator('[data-debug-output="counters"]')).toHaveText(
    "open=0 pull=0 track=0 pose=0"
  );

  await page.evaluate(() => {
    window.__balloonShootTestHooks?.attachTelemetryObserver();
  });

  await page.getByRole("button", { name: "カメラを準備" }).click();
  await expect(page.getByRole("button", { name: "スタート" })).toBeVisible();
  await page.getByRole("button", { name: "スタート" }).click();

  await page.evaluate(() => {
    window.__balloonShootTestHooks?.advanceCountdown(3);
  });
}

const readFrameSnapshots = async (
  page: Page,
  expectedPhases: readonly string[]
): Promise<TelemetrySnapshot[]> => {
  const timeline = await page.evaluate<TelemetrySnapshot[]>(() =>
    window.__balloonShootTestHooks?.getTelemetryTimeline() ?? []
  );
  const meaningfulTimeline = timeline.filter((snapshot) => snapshot.phase !== "--");

  return meaningfulTimeline.slice(0, expectedPhases.length);
};

const waitForFrameSequence = async (
  page: Page,
  expectedPhases: readonly string[]
): Promise<TelemetrySnapshot[]> => {
  let snapshots: TelemetrySnapshot[] = [];

  await expect.poll(async () => {
    snapshots = await readFrameSnapshots(page, expectedPhases);

    return snapshots.map((snapshot) => snapshot.phase);
  }).toEqual(expectedPhases);

  return snapshots;
};

test.describe("issue-30 acceptance", () => {
  test("intentional pull emits exactly one shot", async ({ page }) => {
    const base = createBaseFrame();
    const frames = [
      withThumbTriggerPose(base, "open"),
      withThumbTriggerPose(base, "open"),
      withThumbTriggerPose(base, "open"),
      withThumbTriggerPose(base, "pulled"),
      withThumbTriggerPose(base, "pulled")
    ];
    const expectedPhases = ["idle", "ready", "armed", "armed", "fired", "tracking_lost"];

    await bootHarness(page, frames);
    const snapshots = await waitForFrameSequence(page, expectedPhases);

    expect(snapshots.map((snapshot) => snapshot.phase)).toEqual(expectedPhases);
    expect(snapshots).toContainEqual(
      expect.objectContaining({
        phase: "fired",
        rejectReason: "waiting_for_release"
      })
    );
    expect(snapshots.filter((snapshot) => snapshot.phase === "fired")).toHaveLength(1);
  });

  test("held pull does not auto-repeat", async ({ page }) => {
    const base = createBaseFrame();
    const frames = [
      withThumbTriggerPose(base, "open"),
      withThumbTriggerPose(base, "open"),
      withThumbTriggerPose(base, "open"),
      withThumbTriggerPose(base, "pulled"),
      withThumbTriggerPose(base, "pulled"),
      withThumbTriggerPose(base, "pulled"),
      withThumbTriggerPose(base, "pulled")
    ];
    const expectedPhases = [
      "idle",
      "ready",
      "armed",
      "armed",
      "fired",
      "recovering",
      "recovering",
      "tracking_lost"
    ];

    await bootHarness(page, frames);
    const snapshots = await waitForFrameSequence(page, expectedPhases);

    expect(snapshots.map((snapshot) => snapshot.phase)).toEqual(expectedPhases);
    expect(snapshots.filter((snapshot) => snapshot.phase === "fired")).toHaveLength(1);
    expect(snapshots.at(-1)?.rejectReason).toBe("tracking_lost");
  });

  test("brief thumb jitter does not fire", async ({ page }) => {
    const base = createBaseFrame();
    const frames = [
      withThumbTriggerPose(base, "open"),
      withThumbTriggerPose(base, "open"),
      withThumbTriggerPose(base, "open"),
      withThumbTriggerPose(base, "pulled"),
      withThumbTriggerPose(base, "open"),
      withThumbTriggerPose(base, "open")
    ];
    const expectedPhases = ["idle", "ready", "armed", "armed", "armed", "armed"];

    await bootHarness(page, frames);
    const meaningfulSnapshots = await waitForFrameSequence(page, expectedPhases);

    expect(meaningfulSnapshots.map((snapshot) => snapshot.phase)).toEqual([
      "idle",
      "ready",
      "armed",
      "armed",
      "armed",
      "armed"
    ]);
    expect(meaningfulSnapshots.filter((snapshot) => snapshot.phase === "fired")).toHaveLength(0);
    expect(meaningfulSnapshots.at(-1)?.rejectReason).toBe("waiting_for_stable_pulled");
  });

  test("tracking loss plus reacquisition does not ghost-fire", async ({ page }) => {
    const base = createBaseFrame();
    const frames = [
      withThumbTriggerPose(base, "open"),
      withThumbTriggerPose(base, "open"),
      undefined,
      undefined,
      withThumbTriggerPose(base, "open"),
      withThumbTriggerPose(base, "open")
    ];
    const expectedPhases = ["idle", "ready", "tracking_lost", "tracking_lost", "idle"];

    await bootHarness(page, frames);
    const meaningfulSnapshots = await waitForFrameSequence(page, expectedPhases);

    expect(meaningfulSnapshots.map((snapshot) => snapshot.phase)).toEqual(expectedPhases);
    expect(meaningfulSnapshots.filter((snapshot) => snapshot.phase === "fired")).toHaveLength(0);
    expect(meaningfulSnapshots.at(2)?.rejectReason).toBe("tracking_lost");
    expect(meaningfulSnapshots.at(-1)?.rejectReason).toBe("waiting_for_stable_open");
  });
});
