import { expect, test } from "@playwright/test";

test("home page renders the v2 setup placeholder", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "BalloonShoot v2" })).toBeVisible();
  const diagnosticLink = page.getByRole("link", { name: "diagnostic.html" });

  await expect(diagnosticLink).toBeVisible();
  await expect(diagnosticLink).toHaveAttribute("href", "./diagnostic.html");
});
