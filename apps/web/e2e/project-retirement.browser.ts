import { expect, test } from "@playwright/test";

test("admin archives a project without erasing its history", async ({ page }) => {
  const baseProject = {
    id: 7, revision: 3, nombre: "Reforma cocina", descripcion: "Obra contractual",
    direccion: "Madrid", tipo: "Reforma integral", estado: "en_curso", progreso: 35,
    presupuesto: 1000, financialSummary: null,
    fechaInicio: "2026-10-01T00:00:00.000Z", fechaFinPrevista: "2026-12-01T00:00:00.000Z",
    profesionalesAsignados: [{ userId: 3, profesion: "reformista" }], hitos: [],
    archivedAt: null, archiveReason: null,
  };
  let project = { ...baseProject };
  let requestBody: Record<string, unknown> | null = null;
  await page.addInitScript(() => sessionStorage.setItem("rp_token", "test-token"));
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api", "");
    if (path === "/auth/me") return route.fulfill({ json: { id: 1, nombre: "Admin", rol: "admin", activo: true, email: "admin@test.es" } });
    if (path === "/projects/7/archive") {
      requestBody = route.request().postDataJSON();
      project = { ...project, revision: 4, profesionalesAsignados: [], archivedAt: "2026-10-13T00:00:00.000Z", archiveReason: String(requestBody?.reason ?? "") };
      return route.fulfill({ json: project });
    }
    if (path === "/projects/7") return route.fulfill({ json: project });
    if (path === "/projects/7/files" || path === "/projects/7/change-orders" || path === "/users") return route.fulfill({ json: [] });
    if (path === "/notifications/unread-count") return route.fulfill({ json: { count: 0 } });
    return route.fulfill({ json: [] });
  });

  await page.goto("/#/admin/projects/7");
  await page.getByRole("button", { name: "Cancelar y archivar obra" }).click();
  const dialog = page.getByRole("dialog", { name: "Cancelar y archivar obra" });
  await dialog.getByLabel("Motivo").fill("Cancelación acordada y cierre administrativo");
  await dialog.getByRole("button", { name: "Cancelar y archivar" }).click();

  await expect(dialog).toBeHidden();
  expect(requestBody).toMatchObject({ reason: "Cancelación acordada y cierre administrativo", revision: 3 });
  await expect(page.getByText("ARCHIVADO")).toBeVisible();
  await expect(page.getByText("Cancelación acordada y cierre administrativo")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelar y archivar obra" })).toHaveCount(0);
});
