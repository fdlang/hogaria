import { test, expect } from "@playwright/test";

const labels = ["Inicio", "Solicitudes", "Presupuestos", "Proyectos", "Jornadas y costes", "Profesionales", "Catálogo", "Usuarios y accesos", "Registro de actividad"];
for (const width of [390, 768, 1024, 1440, 1920]) {
  test("navigation and dashboard share groups at " + width, async ({ page }, info) => {
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
    if (mobile) await expect(nav.getByRole("link")).toHaveText(labels);
    else {
      await expect(nav.getByRole("link")).toHaveText(["Inicio"]);
      await expect(nav.getByRole("button")).toHaveText(["Comercial", "Obras", "Recursos", "Administración"]);
    }
    await expect(nav.locator('[aria-current="page"]')).toHaveText("Inicio");
    if (!mobile) {
      const trigger = nav.getByRole("button", { name: "Comercial", exact: true });
      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(nav.getByRole("link", { name: "Solicitudes" })).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(nav.getByRole("link", { name: "Solicitudes" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await trigger.click();
      await nav.getByRole("button", { name: "Obras", exact: true }).click();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await page.getByRole("heading", { name: "Panel de administración" }).click({ position: { x: 4, y: 4 } });
      await expect(nav.getByRole("button", { name: "Obras", exact: true })).toHaveAttribute("aria-expanded", "false");
      await trigger.click();
    }
    await nav.getByRole("link", { name: "Presupuestos", exact: true }).click();
    await expect(page.getByRole("heading", { name: "De oportunidad a obra" })).toBeVisible();
    if (mobile) {
      await expect(page.getByRole("dialog", { name: "Menú privado" })).toHaveCount(0);
      await page.getByRole("button", { name: "Abrir menú" }).click();
    } else {
      const trigger = nav.getByRole("button", { name: "Comercial", exact: true });
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(trigger).toHaveAttribute("data-active", "true");
      await trigger.click();
    }
    await expect(nav.locator('[aria-current="page"]')).toHaveText("Presupuestos");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (width >= 1024) {
      const brand = await page.locator(".private-brand").boundingBox();
      const bar = await nav.boundingBox();
      const account = await page.locator(".private-account").boundingBox();
      expect(brand && bar && account && bar.x >= brand.x + brand.width && account.x >= bar.x + bar.width).toBeTruthy();
    }
    await page.screenshot({ path: info.outputPath("navigation.png") });
  });
}
