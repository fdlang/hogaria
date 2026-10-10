import { test, expect, type Page } from "@playwright/test";

const item = {
  id: 1, reference: "TST-001", category: "Prueba", description: "Partida guardada", unit: "ud",
  salePrice: 123, vatRate: 21, active: true, itemType: "simple" as const,
  reviewStatus: "verified" as "verified" | "pending_review" | "archived", replacementReference: null, reviewNote: null,
  costBreakdown: { laborCost: null, materialCost: null, auxiliaryCost: null, overheadPercent: null, targetMarginPercent: null },
  evidence: { sourceName: null, sourceUrl: null, priceDate: null, validFrom: null, validUntil: null },
  searchTerms: [], updatedAt: "2026-09-19",
};
async function setup(page: Page, state: { fail: boolean; items: typeof item[]; gate?: Promise<void> }) {
  await page.addInitScript(() => sessionStorage.setItem("rp_token", "test-token"));
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/catalog") {
      if (state.gate) await state.gate;
      const picker = new URL(route.request().url()).searchParams.get("picker") === "true";
      const body = picker
        ? { items: state.items.map(entry => ({ ...entry, priceVersion: 1, unitCost: null })), total: state.items.length, page: 0, limit: 12, pages: 1 }
        : state.items;
      return route.fulfill({ status: state.fail ? 500 : 200, json: state.fail ? { message: "Error de prueba" } : body });
    }
    if (path === "/api/estimate-drafts" && route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { oportunidadId: number; borrador: unknown };
      return route.fulfill({ json: { id: 1, oportunidadId: body.oportunidadId, estado: "borrador", borrador: body.borrador, updatedAt: "2026-10-11T10:00:00.000Z" } });
    }
    if (path === "/api/estimates/1" && route.request().method() === "PATCH") {
      return route.fulfill({ json: { id: 1, numero: "HOG-2026-TEST", clienteNombre: "Cliente", titulo: "Propuesta de prueba", estado: "borrador", versionActual: 1, motivoRechazo: null, propuesta: null, createdAt: "2026-10-11T10:00:00.000Z", updatedAt: "2026-10-11T10:00:00.001Z" } });
    }
    return route.fulfill({ json: path === "/api/auth/me"
      ? { id: 1, nombre: "Admin", rol: "admin", activo: true, email: "admin@test.invalid" }
      : path === "/api/users" ? [{ id: 2, nombre: "Cliente", rol: "cliente", activo: true }]
      : path === "/api/opportunities" && route.request().method() === "POST" ? { id: 1, clienteId: 2, nombre: "Reforma prueba", direccion: "Dirección de prueba", tipo: "Reforma", descripcion: "", estado: "nueva", email: null, telefono: null, fechaVisita: null, notasInternas: "", createdAt: "2026-10-11T10:00:00.000Z", updatedAt: "2026-10-11T10:00:00.000Z" }
      : path === "/api/opportunities" ? { items: [{ id: 1, clienteId: 2, nombre: "Reforma prueba", direccion: "Dirección de prueba", tipo: "Reforma", descripcion: "", estado: "nueva", email: null, telefono: null, fechaVisita: null, notasInternas: "", createdAt: "2026-10-07T09:00:00.000Z", updatedAt: "2026-10-07T10:00:00.000Z" }], total: 1, page: 1, limit: 20, pages: 1 }
      : [] });
  });
}

test("catalog distinguishes loading, empty and unmatched filters", async ({ page }) => {
  let release!: () => void;
  const state = { fail: false, items: [] as typeof item[], gate: new Promise<void>(resolve => { release = resolve; }) };
  await setup(page, state);
  await page.goto("/admin/catalog");
  await expect(page.getByRole("status")).toHaveText("Cargando catálogo…");
  await expect(page.locator(".catalog-manager__empty")).toHaveCount(0);
  release();
  await expect(page.getByText("Todavía no hay partidas guardadas en el catálogo.")).toBeVisible();
  state.items = [item];
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect(page.getByText(item.description, { exact: true })).toBeVisible();
  await page.getByRole("searchbox").fill("inexistente");
  await expect(page.getByText("No hay partidas que coincidan con estos filtros.")).toBeVisible();
});

test("catalog clears errors on retry and distinguishes archived items", async ({ page }) => {
  const state = { fail: true, items: [item] };
  await setup(page, state);
  await page.goto("/admin/catalog");
  await expect(page.getByRole("alert")).toContainText("No se pudo cargar el catálogo");
  await expect(page.locator(".catalog-manager__empty")).toHaveCount(0);
  state.fail = false;
  await page.getByRole("button", { name: "Reintentar catálogo" }).click();
  await expect(page.getByText(item.description, { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  state.items = [{ ...item, active: false, reviewStatus: "archived" }];
  await page.getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect(page.getByText(/Todas las partidas están archivadas/)).toBeVisible();
  await page.getByLabel("Incluir archivadas").check();
  await expect(page.getByText(item.description, { exact: true })).toBeVisible();
});

for (const fail of [false, true]) test("estimate never falls back to static prices: failure=" + fail, async ({ page }) => {
  const state = { fail, items: [] as typeof item[] };
  await setup(page, state);
  await page.goto("/admin/budgets");
  await page.getByRole("button", { name: "Nuevo presupuesto" }).click();
  await page.getByLabel("Cliente existente").selectOption("2");
  await page.getByLabel("Nombre de la oportunidad").fill("Reforma prueba");
  await page.getByRole("textbox", { name: "Dirección *", exact: true }).fill("Dirección de prueba");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel("Título visible al cliente").fill("Propuesta de prueba");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Añadir desde catálogo" }).click();
  const catalog = page.locator(".catalog-picker-modal");
  await expect(catalog.getByRole("button", { name: "+ Añadir", exact: true })).toHaveCount(0);
  await expect(catalog.getByText("DEM-001", { exact: false })).toHaveCount(0);
  if (fail) {
    await expect(catalog.getByRole("alert")).toContainText("No se pudieron cargar las plantillas del catálogo");
    state.fail = false;
    state.items = [item];
    await catalog.getByRole("button", { name: "Reintentar catálogo" }).click();
    await catalog.getByRole("searchbox", { name: "Buscar partida" }).fill(item.reference);
    await expect(catalog.getByText(item.description, { exact: true })).toBeVisible();
    await expect(catalog.getByRole("alert")).toHaveCount(0);
    await catalog.getByRole("button", { name: `Añadir ${item.reference}: ${item.description}`, exact: true }).click();
    await expect(page.locator(".estimate-line")).toHaveCount(1);
  } else {
    await catalog.getByRole("searchbox", { name: "Buscar partida" }).fill("partida inexistente");
    await expect(catalog.getByText(/Ningún ítem coincide/)).toBeVisible();
    await catalog.getByRole("button", { name: "Cerrar modal" }).click();
    await page.getByRole("button", { name: "+ Partida manual", exact: true }).click();
    await expect(page.locator(".estimate-line")).toHaveCount(1);
  }
});
