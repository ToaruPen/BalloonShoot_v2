import { expect, test, type Page } from "@playwright/test";

type FakeCameraMode = "ok" | "permissionDenied";

interface FakeCameraDevice {
  readonly deviceId: string;
  readonly label: string;
}

const installFakeCameras = async (
  page: Page,
  devices: FakeCameraDevice[],
  mode: FakeCameraMode = "ok"
): Promise<void> => {
  await page.addInitScript(
    ({ fakeDevices, fakeMode }) => {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          enumerateDevices: () =>
            Promise.resolve(
              fakeDevices.map((device) => ({
                kind: "videoinput",
                deviceId: device.deviceId,
                label: device.label,
                groupId: `${device.deviceId}-group`,
                toJSON: () => ({})
              }))
            ),
          getUserMedia: () => {
            if (fakeMode === "permissionDenied") {
              return Promise.reject(
                new DOMException("Camera denied", "NotAllowedError")
              );
            }

            return Promise.resolve(new MediaStream());
          }
        }
      });
    },
    { fakeDevices: devices, fakeMode: mode }
  );
};

test("diagnostic workbench runs permission, device selection, previews, swap, and reselect", async ({
  page
}) => {
  await installFakeCameras(page, [
    { deviceId: "front-device-id", label: "Front Camera" },
    { deviceId: "side-device-id", label: "Side Camera" }
  ]);

  await page.goto("/diagnostic.html");
  await page.getByRole("button", { name: "カメラ許可" }).click();

  await expect(page.getByRole("heading", { name: "カメラ選択" })).toBeVisible();
  await page.locator("#wb-front-select").selectOption("front-device-id");
  await page.locator("#wb-side-select").selectOption("side-device-id");
  await page.getByRole("button", { name: "確定" }).click();

  await expect(page.getByRole("heading", { name: "ライブプレビュー" })).toBeVisible();
  await expect(page.locator("#wb-front-video")).toBeVisible();
  await expect(page.locator("#wb-side-video")).toBeVisible();
  await expect(page.locator(".wb-preview-lane").first()).toContainText("Front Camera");
  await expect(page.locator(".wb-preview-lane").nth(1)).toContainText("Side Camera");

  await page.getByRole("button", { name: "左右入れ替え" }).click();
  await expect(page.locator(".wb-preview-lane").first()).toContainText("Side Camera");
  await expect(page.locator(".wb-preview-lane").nth(1)).toContainText("Front Camera");

  await page.getByRole("button", { name: "再選択" }).click();
  await expect(page.getByRole("heading", { name: "カメラ選択" })).toBeVisible();
});

test("diagnostic workbench shows permission denial details", async ({ page }) => {
  await installFakeCameras(
    page,
    [{ deviceId: "front-device-id", label: "Front Camera" }],
    "permissionDenied"
  );

  await page.goto("/diagnostic.html");
  await page.getByRole("button", { name: "カメラ許可" }).click();

  await expect(page.getByRole("heading", { name: "カメラ許可が拒否されました" })).toBeVisible();
  await expect(page.getByText("原因:")).toBeVisible();
  await expect(page.getByText("影響:")).toBeVisible();
  await expect(page.getByText("再現:")).toBeVisible();
  await expect(page.getByText("対処:")).toBeVisible();
});

test("diagnostic workbench warns when only one camera is available", async ({ page }) => {
  await installFakeCameras(page, [
    { deviceId: "front-device-id", label: "Front Camera" }
  ]);

  await page.goto("/diagnostic.html");
  await page.getByRole("button", { name: "カメラ許可" }).click();

  await expect(page.getByRole("heading", { name: "カメラが1台しか検出されません" })).toBeVisible();
  await expect(
    page.getByText("1台のカメラをフロントとサイドの両方に再利用することはできません")
  ).toBeVisible();
});
