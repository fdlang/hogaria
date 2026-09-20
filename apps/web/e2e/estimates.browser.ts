import { test, expect, type Page } from "@playwright/test";
const proposal = {
  id: 1,
  numero: "HOG-2026-001",
  titulo: "Reforma de baño Pinto",
  clienteNombre: "María García",
  estado: "enviado",
  versionActual: 1,
  motivoRechazo: null,
  createdAt: "2026-09-01",
  updatedAt: "2026-09-01",
  propuesta: {
    titulo: "Reforma de baño Pinto",
    referencia: "REF-" + "x".repeat(160),
    validezDias: 30,
    condicionesPago: "50% por adelantado y 50% al finalizar.",
    garantia: "Según propuesta",
    notasCliente: "Nota pública",
    enviadoAt: "2026-09-01",
    expiresAt: "2026-10-01",
    firmadoAt: null,
    hash: null,
    totalSinIva: 200,
    totalIva: 42,
    totalConIva: 242,
    partidas: [
      {
        id: "1",
        categoria: "Baño",
        descripcion: "Porcelánico de gran formato " + "detalle".repeat(30),
        cantidad: 2,
        unidad: "m²",
        precioVentaUnitario: 100,
        descuento: 0,
        iva: 21,
        notaCliente: "Acabado mate",
      },
    ],
  },
};
async function fixture(page: Page, role: string) {
  const emails: unknown[] = [];
  await page.addInitScript(() =>
    sessionStorage.setItem("rp_token", "test-token"),
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api", "");
    if (path.endsWith("/pdf"))
      return route.fulfill({
        contentType: "application/pdf",
        body: "%PDF-1.4\n%%EOF",
      });
    if (path.endsWith("/email")) {
      emails.push(route.request().postDataJSON());
      if (emails.length === 1)
        return route.fulfill({
          status: 409,
          json: { message: "El proveedor no ha aceptado el correo" },
        });
      return route.fulfill({
        json: {
          messageId: "1",
          recipient: "cliente@test.es",
          status: "accepted",
        },
      });
    }
    const json =
      path === "/auth/me"
        ? {
            id: 1,
            nombre: "Prueba",
            rol: role,
            activo: true,
            email: "cliente@test.es",
          }
        : path === "/estimates"
          ? [proposal]
          : [];
    return route.fulfill({ json });
  });
  await page.goto(role === "admin" ? "/#/admin/budgets" : "/#/cliente/budgets");
  if (role === "admin") {
    await expect(page.getByLabel("Buscar presupuestos")).toBeVisible();
    await expect(page.getByRole("button", { name: "Ver presupuesto" })).toBeHidden();
  }
  return emails;
}
for (const state of ["borrador", "en_revision", "rechazado"]) {
  test(`admin resumes ${state} and saves the same estimate`, async ({ page }) => {
    await fixture(page, "admin");
    let saved = false, revised = false;
    const draft = { ...proposal.propuesta, notasInternas: "Nota interna", partidas: proposal.propuesta.partidas.map(line => ({ ...line, costeUnitario: 30 })) };
    await page.route("**/api/opportunities", route => route.fulfill({ json: [{ id: 4, clienteId: 2, nombre: "Obra", direccion: "Madrid" }] }));
    await page.route("**/api/estimates?*", route => {
      expect(route.request().method()).toBe("GET");
      return route.fulfill({ json: [{ ...proposal, estado: state }] });
    });
    await page.route("**/api/estimates/1/draft", route => route.fulfill({ json: { id: 1, oportunidadId: 4, estado: "borrador", borrador: draft } }));
    await page.route("**/api/estimates/1/revise", route => {
      revised = true;
      return route.fulfill({ json: { id: 1, oportunidadId: 4, estado: "en_revision", borrador: draft } });
    });
    await page.route("**/api/estimates/1", route => {
      expect(route.request().method()).toBe("PATCH");
      expect(route.request().postDataJSON().borrador.titulo).toBe("Título corregido");
      saved = true;
      return route.fulfill({ json: { ...proposal, titulo: "Título corregido", estado: "borrador" } });
    });
    await page.reload();
    await page.getByRole("button", { name: "Mostrar propuestas" }).click();
    await page.getByRole("button", { name: ["borrador", "en_revision"].includes(state) ? "Editar borrador" : "Crear revisión" }).click();
    const title = page.getByLabel("Título visible al cliente");
    await expect(title).toHaveValue(draft.titulo);
    await expect(title).toBeInViewport();
    await page.getByLabel("Título visible al cliente").fill("Título corregido");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByRole("button", { name: "Revisar propuesta" }).click();
    await page.getByRole("button", { name: "Guardar como borrador" }).click();
    await expect(page.getByRole("dialog", { name: /Presupuesto de María García/ })).toBeVisible();
    await expect(page.getByLabel("Buscar presupuestos")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nueva oportunidad" })).toBeHidden();
    expect(saved).toBe(true);
    expect(revised).toBe(state === "rechazado");
  });
}
for (const role of ["admin", "cliente"])
  for (const width of [320, 390, 768, 1440]) {
    test(role + " budget detail fits " + width + "px", async ({ page }) => {
      await page.setViewportSize({ width, height: 850 });
      await fixture(page, role);
      await page.getByLabel("Buscar presupuestos").fill("inexistente");
      await expect(
        page.getByText("No hay presupuestos que coincidan con los filtros."),
      ).toBeVisible();
      await page.getByLabel("Buscar presupuestos").fill("bano pinto");
      await page
        .getByRole("button", {
          name: role === "admin" ? "Ver presupuesto" : /Ver propuesta/,
        })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("María García", { exact: true })).toBeVisible();
      await expect(dialog.getByTitle("Vista previa del presupuesto en PDF")).toBeVisible();
      expect(
        await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      const download = page.waitForEvent("download");
      await dialog.getByRole("button", { name: "Descargar PDF" }).click();
      expect((await download).suggestedFilename()).toBe(
        "presupuesto-HOG-2026-001-v1.pdf",
      );
      await page.screenshot({
        path: "test-results/estimate-" + role + "-" + width + ".png",
        fullPage: true,
      });
    });
  }
test("budget detail offers download only, never email", async ({ page }) => {
  const emails = await fixture(page, "admin");
  await page.getByRole("button", { name: "Mostrar propuestas" }).click();
  await page.getByRole("button", { name: "Ver presupuesto" }).click();
  await expect(
    page.getByRole("button", { name: "Descargar PDF" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Enviar PDF|Recibir PDF|Confirmar envío/,
    }),
  ).toHaveCount(0);
  expect(emails).toHaveLength(0);
});

test("admin sees search first and opens the creation wizard explicitly", async ({ page }) => {
  await fixture(page, "admin");
  await expect(page.getByLabel("Buscar presupuestos")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nueva oportunidad" })).toBeHidden();
  await page.getByRole("button", { name: "Nuevo presupuesto" }).click();
  await expect(page.getByRole("heading", { name: "Nueva oportunidad" })).toBeVisible();
});

test("search stays visible and opens results independently of recent estimates", async ({ page }) => {
  await fixture(page, "admin");
  await page.getByLabel("Buscar presupuestos").fill("Pinto");
  await expect(page.getByRole("heading", { name: "Resultados de búsqueda" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ver presupuesto" })).toBeVisible();
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await expect(page.getByRole("button", { name: "Ver presupuesto" })).toBeHidden();
  await page.getByRole("combobox", { name: "Estado", exact: true }).selectOption("rechazado");
  await expect(page.getByText("No hay presupuestos que coincidan con los filtros.")).toBeVisible();
  await page.getByRole("combobox", { name: "Estado", exact: true }).selectOption("enviado");
  await expect(page.getByRole("button", { name: "Ver presupuesto" })).toBeVisible();
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await page.getByRole("button", { name: "Mostrar propuestas" }).click();
  await expect(page.getByRole("button", { name: "Ver presupuesto" })).toBeVisible();
  await page.getByRole("button", { name: "Ocultar propuestas" }).click();
  await expect(page.getByLabel("Buscar presupuestos")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Estado", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ver presupuesto" })).toBeHidden();
});

test("request changes uses one modal, clears cancelled text and preserves the proposal", async ({ page }) => {
  await fixture(page, "cliente");
  await page.getByRole("button", { name: /Ver propuesta/ }).click();
  await page.getByRole("button", { name: "Solicitar cambios" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Cambios solicitados" }).fill("Cambiar el revestimiento seleccionado");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("button", { name: "Solicitar cambios" })).toBeVisible();
  await page.getByRole("button", { name: "Solicitar cambios" }).click();
  await expect(page.getByRole("textbox", { name: "Cambios solicitados" })).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Solicitar cambios" })).toBeVisible();
});
