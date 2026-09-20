import { expect, test } from "@playwright/test";

test("professional access is automatic and personnel documents are managed privately", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => sessionStorage.setItem("rp_token", "test-token"));
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/auth/me") return route.fulfill({ json: { id: 1, nombre: "Admin", email: "admin@test.invalid", rol: "admin", activo: true } });
    if (url.pathname === "/api/users") return route.fulfill({ json: [
      { id: 2, nombre: "Pendiente", email: "pending@test.invalid", rol: "profesional", profesion: "reformista", activo: false, accountStatus: "pending_activation", createdAt: "2026-09-20T00:00:00.000Z" },
      { id: 3, nombre: "Archivado", email: "archived@test.invalid", rol: "profesional", profesion: "reformista", activo: false, accountStatus: "archived", createdAt: "2026-09-20T00:00:00.000Z" },
    ] });
    if (url.pathname === "/api/projects" || url.pathname === "/api/professionals/2/documents") return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { message: "not mocked" } });
  });

  await page.goto("/#/admin/profesionales");
  await expect(page.getByRole("heading", { name: "Profesionales" })).toBeVisible();
  await expect(page.getByText("Pendiente", { exact: true })).toBeVisible();
  await expect(page.getByText("Invitación pendiente", { exact: true })).toBeVisible();
  await expect(page.getByText("Archivado", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enviar acceso" })).toHaveCount(0);
  await expect(page.getByText("subir imagen", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Documentación" }).click();
  await expect(page.getByRole("dialog", { name: "Documentación · Pendiente" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Subir documentación" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
