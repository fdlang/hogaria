import { test, expect, type Page } from "@playwright/test";

const item = {
  id: 1, reference: "TST-001", category: "Prueba", description: "Partida guardada", unit: "ud",
  salePrice: 123, vatRate: 21, active: true, itemType: "simple" as const,
  reviewStatus: "verified" as "verified" | "pending_review" | "archived", replacementReference: null, reviewNote: null,
  costBreakdown: { laborCost: null, materialCost: null, auxiliaryCost: null, overheadPercent: null, targetMarginPercent: null },
  evidence: { sourceName: null, sourceUrl: null, priceDate: null, validFrom: null, validUntil: null },
  searchTerms: [], updatedAt: "2026-09-19",
};
async function setup(page: Page, state: { fail: boolean; items: typeof item[]; gate?: Promise<void>; searchGate?: Promise<void>; estimates?: unknown[]; failPageOnce?: number; pickerLimits?: number[] }) {
  await page.addInitScript(() => sessionStorage.setItem("rp_token", "test-token"));
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/catalog") {
      if (state.gate) await state.gate;
      const params = new URL(route.request().url()).searchParams;
      const picker = params.get("picker") === "true";
      if (picker && params.get("search") && state.searchGate) await state.searchGate;
      const page = Number(params.get("page") ?? 0);
      const limit = Number(params.get("limit") ?? 12);
      if (picker) state.pickerLimits?.push(limit);
      const pagedItems = state.items.slice(page * limit, (page + 1) * limit);
      const body = picker
        ? { items: pagedItems.map(entry => ({ ...entry, priceVersion: 1, unitCost: null })), total: state.items.length, page, limit, pages: Math.max(1, Math.ceil(state.items.length / limit)) }
        : state.items;
      const failThisPage = state.failPageOnce === page;
      if (failThisPage) state.failPageOnce = undefined;
      return route.fulfill({ status: state.fail || failThisPage ? 500 : 200, json: state.fail || failThisPage ? { message: "Error de prueba" } : body });
    }
    if (path === "/api/estimate-drafts" && route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { oportunidadId: number; borrador: unknown };
      return route.fulfill({ json: { id: 1, oportunidadId: body.oportunidadId, estado: "borrador", borrador: body.borrador, updatedAt: "2026-10-11T10:00:00.000Z" } });
    }
    if (path === "/api/estimates/1" && route.request().method() === "PATCH") {
      return route.fulfill({ json: { id: 1, numero: "HOG-2026-TEST", clienteNombre: "Cliente", titulo: "Propuesta de prueba", estado: "borrador", versionActual: 1, motivoRechazo: null, propuesta: null, createdAt: "2026-10-11T10:00:00.000Z", updatedAt: "2026-10-11T10:00:00.001Z" } });
    }
    if (path === "/api/estimates/8/duplicate" && route.request().method() === "POST") {
      return route.fulfill({ status: 201, json: { id: 9, oportunidadId: 1, clienteId: 2, numero: "HOG-2026-COPY", titulo: "Copia de Propuesta base", estado: "borrador", versionActual: 1, motivoRechazo: null, borrador: { titulo: "Copia de Propuesta base", validezDias: 30, condicionesPago: "Observaciones", garantia: "", notasCliente: "", notasInternas: "", partidas: [] }, createdAt: "2026-10-12T10:00:00.000Z", updatedAt: "2026-10-12T10:00:00.000Z" } });
    }
    return route.fulfill({ json: path === "/api/auth/me"
      ? { id: 1, nombre: "Admin", rol: "admin", activo: true, email: "admin@test.invalid" }
      : path === "/api/users" ? [{ id: 2, nombre: "Cliente", rol: "cliente", activo: true }]
      : path === "/api/opportunities" && route.request().method() === "POST" ? { id: 1, clienteId: 2, nombre: "Reforma prueba", direccion: "Dirección de prueba", tipo: "Reforma", descripcion: "", estado: "nueva", email: null, telefono: null, fechaVisita: null, notasInternas: "", createdAt: "2026-10-11T10:00:00.000Z", updatedAt: "2026-10-11T10:00:00.000Z" }
      : path === "/api/opportunities" ? { items: [{ id: 1, clienteId: 2, nombre: "Reforma prueba", direccion: "Dirección de prueba", tipo: "Reforma", descripcion: "", estado: "nueva", email: null, telefono: null, fechaVisita: null, notasInternas: "", createdAt: "2026-10-07T09:00:00.000Z", updatedAt: "2026-10-07T10:00:00.000Z" }], total: 1, page: 1, limit: 20, pages: 1 }
      : path === "/api/estimates" ? state.estimates ?? []
      : [] });
  });
}

async function openCatalogPicker(page: Page) {
  await page.goto("/admin/budgets");
  await page.getByRole("button", { name: "Nuevo presupuesto" }).click();
  await page.getByLabel("Cliente existente").selectOption("2");
  await page.getByLabel("Nombre de la oportunidad").fill("Reforma prueba");
  await page.getByRole("textbox", { name: "Dirección *", exact: true }).fill("Dirección de prueba");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByLabel("Título visible al cliente").fill("Propuesta de prueba");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Añadir desde catálogo" }).click();
  return page.locator(".catalog-picker-modal");
}

test("an administrator duplicates a proposal into an independent editable draft", async ({ page }) => {
  const estimate = { id: 8, numero: "HOG-2026-BASE", clienteNombre: "Cliente", titulo: "Propuesta base", estado: "enviado", versionActual: 1, motivoRechazo: null, propuesta: null, createdAt: "2026-10-11T10:00:00.000Z", updatedAt: "2026-10-11T10:00:00.000Z" };
  await setup(page, { fail: false, items: [], estimates: [estimate] });

  await page.goto("/admin/budgets");
  await page.getByRole("button", { name: "Mostrar propuestas" }).click();
  await page.getByRole("button", { name: "Duplicar" }).click();

  await expect(page.getByRole("region", { name: "Editor de presupuesto" })).toBeVisible();
  await expect(page.getByLabel("Título visible al cliente")).toHaveValue("Copia de Propuesta base");
  await expect(page.getByText("Cambios guardados")).toBeVisible();
});

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

test("a kitchen template requests contextual measurements and imports the right quantities", async ({ page }) => {
  const kitchenItems = ["PRE-001", "DEM-003", "FON-004", "REV-003", "COC-001", "COC-002", "COC-003", "COC-005", "PRE-004"]
    .map((reference, index) => ({ ...item, id: index + 10, reference, description: `Partida ${reference}`, unit: reference === "COC-001" || reference === "COC-002" || reference === "COC-003" ? "ml" : "ud" }));
  const state = { fail: false, items: kitchenItems, pickerLimits: [] as number[] };
  await setup(page, state);
  const catalog = await openCatalogPicker(page);
  await expect(catalog.getByRole("searchbox", { name: "Buscar partida" })).toBeVisible();
  expect(state.pickerLimits.some(limit => limit > 12)).toBe(true);
  await expect(catalog.getByRole("button", { name: /Cocina completa/ })).toHaveCount(0);
  await catalog.getByRole("tab", { name: "Ver por categorías" }).click();
  await expect(catalog.getByText("9 de 9", { exact: true })).toBeVisible();
  await catalog.getByText("Prueba", { exact: true }).click();
  await expect(catalog.getByRole("button", { name: /Añadir COC-001:/ })).toBeVisible();
  await catalog.getByRole("tab", { name: "Usar plantilla" }).click();
  await expect(catalog.getByRole("searchbox", { name: "Buscar partida" })).toHaveCount(0);
  await catalog.getByRole("button", { name: /Cocina completa/ }).click();
  await expect(catalog.getByLabel("Longitud de muebles bajos *")).toBeVisible();
  await expect(catalog.getByLabel("Longitud de muebles altos (opcional)")).toBeVisible();
  await expect(catalog.getByText("Frente (ml)", { exact: true })).toHaveCount(0);
  await catalog.getByRole("button", { name: "Añadir plantilla al presupuesto" }).click();
  await expect(catalog.getByText(/Introduce una medida mayor que cero/)).toHaveCount(3);

  await catalog.getByLabel("Superficie de suelo *").fill("8,5");
  await catalog.getByLabel("Longitud de muebles bajos *").fill("4,2");
  await catalog.getByLabel("Longitud de encimera *").fill("3,8");
  await expect(catalog.getByText("8 de 8 partidas verificadas disponibles")).toBeVisible();
  await catalog.getByRole("button", { name: "Añadir plantilla al presupuesto" }).click();

  await expect(page.locator(".estimate-line")).toHaveCount(8);
  await expect(page.locator(".estimate-line").getByRole("button", { name: "Editar", exact: true })).toHaveCount(8);
  const lowerCabinets = page.locator(".estimate-line").filter({ hasText: "COC-001" });
  await expect(lowerCabinets.getByLabel("Cantidad")).toHaveCount(0);
  await lowerCabinets.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(lowerCabinets.getByLabel("Cantidad")).toHaveValue("4.2");
  const worktop = page.locator(".estimate-line").filter({ hasText: "COC-003" });
  await worktop.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(worktop.getByLabel("Cantidad")).toHaveValue("3.8");
  await expect(page.locator(".estimate-line").filter({ hasText: "COC-002" })).toHaveCount(0);
});

test("category browsing retries the failed next page without losing loaded items", async ({ page }) => {
  const items = Array.from({ length: 51 }, (_, index) => ({
    ...item, id: index + 1, reference: `TST-${String(index + 1).padStart(3, "0")}`, description: `Partida ${index + 1}`,
  }));
  const state = { fail: false, items, failPageOnce: 1 };
  await setup(page, state);
  const catalog = await openCatalogPicker(page);
  await catalog.getByRole("tab", { name: "Ver por categorías" }).click();
  await expect(catalog.getByText("50 de 51", { exact: true })).toBeVisible();
  await catalog.getByRole("button", { name: "Mostrar 1 más" }).click();
  await expect(catalog.getByRole("alert")).toContainText("No se pudo cargar el catálogo por categorías");
  await catalog.getByRole("button", { name: "Reintentar catálogo" }).click();
  await expect(catalog.getByText("51 de 51", { exact: true })).toBeVisible();
  await catalog.getByText("Prueba", { exact: true }).click();
  await expect(catalog.getByText("Partida 1", { exact: true })).toBeVisible();
  await expect(catalog.getByText("Partida 51", { exact: true })).toBeVisible();
});

test("clearing a search discards a late catalog response", async ({ page }) => {
  let release!: () => void;
  const state = { fail: false, items: [item], searchGate: new Promise<void>(resolve => { release = resolve; }) };
  await setup(page, state);
  const catalog = await openCatalogPicker(page);
  const search = catalog.getByRole("searchbox", { name: "Buscar partida" });
  await search.fill(item.reference);
  await page.waitForTimeout(300);
  await search.fill("");
  release();
  await expect(catalog.getByText("Escribe para buscar o utiliza una plantilla rápida.")).toBeVisible();
  await expect(catalog.getByText(item.description, { exact: true })).toHaveCount(0);
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
    await catalog.getByRole("tab", { name: "Usar plantilla" }).click();
    await expect(catalog.getByRole("alert")).toContainText("No se pudieron cargar las plantillas del catálogo");
    state.fail = false;
    state.items = [item];
    await catalog.getByRole("button", { name: "Reintentar catálogo" }).click();
    await catalog.getByRole("tab", { name: "Buscar partida" }).click();
    await catalog.getByRole("searchbox", { name: "Buscar partida" }).fill(item.reference);
    await expect(catalog.getByText(item.description, { exact: true })).toBeVisible();
    await expect(catalog.getByRole("alert")).toHaveCount(0);
    await catalog.getByRole("button", { name: `Añadir a favoritas: ${item.reference}` }).click();
    await catalog.getByRole("button", { name: `Añadir ${item.reference}: ${item.description}`, exact: true }).click();
    await expect(page.locator(".estimate-line")).toHaveCount(1);
  } else {
    await catalog.getByRole("searchbox", { name: "Buscar partida" }).fill("partida inexistente");
    await expect(catalog.getByText(/Ningún ítem coincide/)).toBeVisible();
    await catalog.getByRole("button", { name: "Cerrar modal" }).click();
    await page.getByRole("button", { name: "+ Partida manual", exact: true }).click();
    await expect(page.locator(".estimate-line")).toHaveCount(1);
  }
  if (await catalog.isVisible()) await catalog.getByRole("button", { name: "Cerrar modal" }).click();
  if (fail) {
    await page.getByRole("button", { name: "Añadir desde catálogo" }).click();
    await expect(catalog.getByText("Favoritas", { exact: true })).toBeVisible();
    await expect(catalog.getByRole("button", { name: `+ ${item.reference}`, exact: true })).toBeVisible();
    await catalog.getByRole("button", { name: `Quitar de favoritas: ${item.reference}` }).click();
    await expect(catalog.getByText("Usadas recientemente", { exact: true })).toBeVisible();
    await catalog.getByRole("button", { name: "Cerrar modal" }).click();
  }
  const line = page.locator(".estimate-line").first();
  if (await line.getByRole("button", { name: "Editar", exact: true }).isVisible()) await line.getByRole("button", { name: "Editar", exact: true }).click();
  await line.getByText(/Añadir observación para el cliente/).click();
  await line.getByLabel("Observación de la partida").fill("Acabado mate confirmado con el cliente");
  const pendingConfirmation = line.getByLabel("Marcar como estimación pendiente de confirmación");
  await expect(pendingConfirmation).toHaveCSS("width", "17px");
  await expect(pendingConfirmation).toHaveCSS("height", "17px");
  await pendingConfirmation.check();
  await expect(line.getByText("ESTIMACIÓN PENDIENTE DE CONFIRMACIÓN", { exact: true })).toBeVisible();
  await expect(line.getByText("Se mostrará al cliente y en el PDF del presupuesto.")).toBeVisible();
});
