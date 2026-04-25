import { expect, test } from "@playwright/test";

test("home page runs production balloon game flow without diagnostic surfaces", async ({
  page
}) => {
  await page.addInitScript(() => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    const tracksByDeviceId = new Map<string, MediaStreamTrack[]>();

    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        const id = nextFrameId;
        nextFrameId += 1;
        callbacks.set(id, callback);
        return id;
      }
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: (id: number) => callbacks.delete(id)
    });
    Object.defineProperty(window, "__fireGameFrame", {
      configurable: true,
      value: (nowMs: number) => {
        const pending = Array.from(callbacks.entries());
        callbacks.clear();
        for (const [, callback] of pending) {
          callback(nowMs);
        }
      }
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: () =>
          Promise.resolve([
            {
              kind: "videoinput",
              deviceId: "front-device-id",
              label: "Front Camera",
              groupId: "front-device-id-group",
              toJSON: () => ({})
            },
            {
              kind: "videoinput",
              deviceId: "side-device-id",
              label: "Side Camera",
              groupId: "side-device-id-group",
              toJSON: () => ({})
            }
          ]),
        getUserMedia: (constraints: MediaStreamConstraints) => {
          const videoConstraints = constraints.video;
          const requestedDeviceId =
            typeof videoConstraints === "object" &&
            typeof videoConstraints.deviceId === "object" &&
            "exact" in videoConstraints.deviceId
              ? String(videoConstraints.deviceId.exact)
              : "front-device-id";
          const canvas = document.createElement("canvas");
          canvas.width = 2;
          canvas.height = 2;
          const track = canvas.captureStream(15).getVideoTracks()[0];
          if (track === undefined) {
            throw new Error("fake camera track was not created");
          }

          tracksByDeviceId.set(requestedDeviceId, [
            ...(tracksByDeviceId.get(requestedDeviceId) ?? []),
            track
          ]);

          return Promise.resolve(new MediaStream([track]));
        }
      }
    });
    Object.defineProperty(window, "__endFakeCameraTrack", {
      configurable: true,
      value: (deviceId: string) => {
        const track = tracksByDeviceId.get(deviceId)?.at(-1);
        track?.stop();
        track?.dispatchEvent(new Event("ended"));
      }
    });
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "BalloonShoot v2" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "カメラを開始" })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "diagnostic.html" })).toHaveCount(
    0
  );
  await expect(page.locator("#wb-fusion-panel")).toHaveCount(0);
  await expect(page.locator("[data-side-trigger-tuning]")).toHaveCount(0);
  await expect(page.locator("[data-fusion-tuning]")).toHaveCount(0);
  await expect(page.locator("[data-front-aim-calibration]")).toHaveCount(0);
  await expect(page.locator("[data-side-trigger-calibration]")).toHaveCount(0);
  await expect(page.getByText("threshold")).not.toBeVisible();
  await expect(page.getByText("landmark")).not.toBeVisible();
  await expect(page.getByText("wireframe")).not.toBeVisible();
  await expect(page.getByText("SIDE_TRIGGER_")).not.toBeVisible();
  await expect(page.getByText("FUSION_")).not.toBeVisible();
  await expect(page.getByText("DEFAULT_FRONT_AIM_")).not.toBeVisible();
  await expect(page.getByText("DEFAULT_SIDE_TRIGGER_")).not.toBeVisible();

  await page.getByRole("button", { name: "カメラを開始" }).click();
  await expect(page.getByRole("heading", { name: "カメラ選択" })).toBeVisible();
  await expect(page.locator("#front-camera-select")).toBeVisible();
  await expect(page.locator("#side-camera-select")).toBeVisible();

  await page.locator("#side-camera-select").selectOption("front-device-id");
  await page.getByRole("button", { name: "ゲーム開始" }).click();
  await expect(page.getByText("異なるカメラを選択してください")).toBeVisible();

  await page.locator("#side-camera-select").selectOption("side-device-id");
  await page.getByRole("button", { name: "ゲーム開始" }).click();
  await expect(page.locator("#game-camera-feed-front")).toBeVisible();
  await expect(page.locator("#game-camera-feed-side")).toHaveCount(1);
  await expect(page.locator("#game-canvas")).toBeVisible();
  await expect(page.locator("#game-hud")).toContainText("スコア");
  await expect(page.locator("#game-hud")).toContainText("3");

  const baseNow = await page.evaluate(() => performance.now());
  await page.evaluate((nowMs) => {
    (
      window as unknown as { __fireGameFrame: (now: number) => void }
    ).__fireGameFrame(nowMs);
  }, baseNow + 4_000);
  await expect(page.locator("#game-hud")).toContainText("残り");

  await page.evaluate(() => {
    (
      window as unknown as { __endFakeCameraTrack: (deviceId: string) => void }
    ).__endFakeCameraTrack("front-device-id");
  });
  await page.evaluate((nowMs) => {
    (
      window as unknown as { __fireGameFrame: (now: number) => void }
    ).__fireGameFrame(nowMs);
  }, baseNow + 4_016);
  await expect(page.locator("#game-hud")).toContainText(
    "カメラが切断されました"
  );
  await expect(
    page.getByRole("button", { name: "カメラを選び直す" })
  ).toBeVisible();
  await expect(page.locator("#game-hud")).not.toContainText("captureLost");
  await expect(page.locator("#game-hud")).not.toContainText("laneFailed");

  await page.evaluate((nowMs) => {
    (
      window as unknown as { __fireGameFrame: (now: number) => void }
    ).__fireGameFrame(nowMs);
  }, baseNow + 64_000);
  await expect(page.getByRole("heading", { name: "ナイスシュート" })).toBeVisible();
  await page.getByRole("button", { name: "もういっかい" }).click();
  await expect(page.locator("#game-hud")).toContainText("3");
});
