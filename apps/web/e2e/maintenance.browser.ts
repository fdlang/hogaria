import { expect, test } from "@playwright/test";

test.skip(process.env.VITE_MAINTENANCE_MODE !== "true", "requires the maintenance build switch");

test("maintenance mode replaces the application without calling the API", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname.startsWith("/api")) apiRequests.push(request.url());
  });

  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");

  await expect(page).toHaveTitle("Mantenimiento | Hogaria");
  await expect(page.getByRole("heading", { name: "Volvemos enseguida." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Volver a intentar" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Contactar con Hogaria" })).toHaveAttribute(
    "href",
    "mailto:info@hogaria.design"
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
