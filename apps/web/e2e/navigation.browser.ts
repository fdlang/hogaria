import { test, expect } from "@playwright/test";

const labels = ["Inicio", "Solicitudes", "Presupuestos", "Proyectos", "Jornadas y costes", "Profesionales", "Catálogo", "Usuarios y accesos", "Registro de actividad"];
for (const width of [390, 768, 1440, 1920]) {
  test("navigation and dashboard share groups at " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => sessionStorage.setItem("rp_token", "test-token"));
    await page.route("**/api/**", route => route.fulfill({
      json: new URL(route.request().url()).pathname === "/api/auth/me"
        ? { id: 1, nombre: "Prueba", email: "admin@test.invalid", rol: "admin", activo: true }
        : [],
    }));
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Panel de administración" })).toBeVisible();
    await expect(page.locator(".admin-home-group > header h2")).toHaveText(["Comercial", "Obras", "Recursos", "Administración"]);
    await expect(page.locator(".admin-home-grid a")).toHaveText([
      /Solicitudes/, /Presupuestos/, /Proyectos/, /Jornadas y costes/, /Profesionales/, /Catálogo/, /Usuarios y accesos/, /Registro de actividad/,
    ]);
    const mobile = width <= 720;
    if (mobile) await page.getByRole("button", { name: "Abrir menú" }).click();
    const nav = page.getByRole("navigation", { name: mobile ? "Secciones privadas" : "Navegación privada", exact: true });
    await expect(nav.getByRole("link")).toHaveText(labels);
    await expect(nav.locator('[aria-current="page"]')).toHaveText("Inicio");
    await nav.getByRole("link", { name: "Presupuestos", exact: true }).click();
    await expect(page.getByRole("heading", { name: "De oportunidad a obra" })).toBeVisible();
    if (mobile) {
      await expect(page.getByRole("dialog", { name: "Menú privado" })).toHaveCount(0);
      await page.getByRole("button", { name: "Abrir menú" }).click();
    }
    await expect(nav.locator('[aria-current="page"]')).toHaveText("Presupuestos");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
