import { expect, test } from "@playwright/test";

test("home page runs production balloon game flow without diagnostic surfaces", async ({
  page
}) => {
  await page.addInitScript(() => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;

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
        getUserMedia: () => Promise.resolve(new MediaStream())
      }
    });
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "BalloonShoot v2" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "カメラを開始" })).toBeVisible();
  await expect(page.getByRole("link", { name: "diagnostic.html" })).toHaveCount(
    0
  );
  await expect(page.locator("#wb-fusion-panel")).toHaveCount(0);
  await expect(page.locator("[data-side-trigger-tuning]")).toHaveCount(0);
  await expect(page.locator("[data-fusion-tuning]")).toHaveCount(0);
  await expect(page.getByText("threshold")).not.toBeVisible();
  await expect(page.getByText("landmark")).not.toBeVisible();
  await expect(page.getByText("wireframe")).not.toBeVisible();
  await expect(page.getByText("SIDE_TRIGGER_")).not.toBeVisible();
  await expect(page.getByText("FUSION_")).not.toBeVisible();

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
    (window as unknown as { __fireGameFrame: (now: number) => void }).__fireGameFrame(
      nowMs
    );
  }, baseNow + 4_000);
  await expect(page.locator("#game-hud")).toContainText("残り");

  await page.evaluate((nowMs) => {
    (window as unknown as { __fireGameFrame: (now: number) => void }).__fireGameFrame(
      nowMs
    );
  }, baseNow + 64_000);
  await expect(page.getByRole("heading", { name: "結果" })).toBeVisible();
  await expect(page.getByRole("button", { name: "もう一度" })).toBeVisible();
});
