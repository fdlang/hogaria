import { expect, test } from "@playwright/test";

async function openActivity(page: import("@playwright/test").Page, width: number) {
  await page.setViewportSize({ width, height: 850 });
  await page.addInitScript(() => sessionStorage.setItem("rp_token", "test-token"));
  await page.route("**/api/auth/me", route => route.fulfill({
    json: { id: 1, nombre: "Administración", email: "admin@hogaria.test", rol: "admin", activo: true },
  }));
  await page.route("**/api/audit?*", route => route.fulfill({
    json: {
      total: 2,
      page: 0,
      limit: 50,
      pages: 1,
      items: [
        {
          id: "business-1",
          action: "PROYECTO_ACTUALIZADO",
          userId: 1,
          userName: "admin",
          timestamp: "2026-09-20T20:11:32.000Z",
          ip: "127.0.0.1",
          userAgent: "browser-test",
          details: { type: "ProjectUpdated", projectId: 2, changedFields: ["estado"] },
        },
        {
          id: "technical-1",
          action: "DB_PROJECTS_UPDATE",
          userId: 1,
          userName: "admin",
          timestamp: "2026-09-20T20:11:31.000Z",
          ip: "127.0.0.1",
          userAgent: "browser-test",
          details: { table: "projects", recordId: "2", operation: "UPDATE", changedFields: ["payload"] },
        },
      ],
    },
  }));
  await page.goto("/#/admin/audit");
}

for (const width of [390, 1440]) {
  test(`activity is readable and traceable at ${width}px`, async ({ page }) => {
    await openActivity(page, width);
    await expect(page.getByRole("heading", { name: "Historial de actividad" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Proyecto actualizado" })).toBeVisible();
    await expect(page.getByText("Se actualizó el proyecto #2: estado.")).toBeVisible();
    await expect(page.getByText("DB_PROJECTS_UPDATE", { exact: true })).toBeHidden();
    await expect(page.getByText("1 registro técnico oculto")).toBeVisible();

    await page.getByText("Ver detalles técnicos").first().click();
    await expect(page.getByText("PROYECTO_ACTUALIZADO", { exact: true })).toBeVisible();
    await expect(page.getByText("127.0.0.1", { exact: true })).toBeVisible();

    await page.getByLabel("Mostrar registros técnicos").check();
    await expect(page.getByText("Control interno de actualización en proyectos, registro #2.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
