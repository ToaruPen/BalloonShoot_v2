import { expect, test } from "@playwright/test";

test("home page renders the clean front aim game shell", async ({ page }) => {
  await page.addInitScript(() => {
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
  await expect(
    page.getByRole("button", { name: "フロントカメラを開始" })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "diagnostic.html" })).toHaveCount(
    0
  );
  await expect(page.getByText("landmark")).not.toBeVisible();
  await expect(page.getByText("threshold")).not.toBeVisible();
  await expect(page.getByText("slider")).not.toBeVisible();
  await expect(page.locator(".debug-panel")).toHaveCount(0);
  await expect(
    page.getByText("SIDE_TRIGGER_PULL_ENTER_THRESHOLD")
  ).not.toBeVisible();
  await expect(page.locator("[data-side-trigger-tuning]")).toHaveCount(0);
  await expect(page.getByText("FUSION_MAX_PAIR_DELTA_MS")).not.toBeVisible();
  await expect(page.locator("[data-fusion-tuning]")).toHaveCount(0);
  await expect(page.locator("#wb-fusion-panel")).toHaveCount(0);

  await page.getByRole("button", { name: "フロントカメラを開始" }).click();
  await expect(
    page.getByRole("heading", { name: "フロントカメラ選択" })
  ).toBeVisible();
  await page.getByRole("button", { name: "照準を開始" }).click();
  await expect(page.locator("#game-camera-feed")).toBeVisible();
  await expect(page.locator("#game-canvas")).toBeVisible();
  await expect(page.locator("#game-canvas")).not.toHaveClass(/landmark/);
});
