import { test, expect, type Page } from "@playwright/test";
const project = {
  id: 1,
  nombre: "Baño Pinto",
  descripcion: "Reforma de baño",
  direccion: "Pinto, Madrid",
  tipo: "Reforma integral",
  estado: "en_curso",
  progreso: 25,
  fechaInicio: "2026-09-01T00:00:00Z",
  fechaFinPrevista: "2026-10-01T00:00:00Z",
  profesionalesAsignados: [{ userId: 2 }],
  hitos: [],
};
const rate = {
  id: "rate",
  professionalId: 2,
  engagement: "empleado",
  rateUnit: "hora",
  rateCents: 2000,
  unitLabel: "hora",
  effectiveAt: "2026-09-01T08:00:00Z",
  createdAt: "2026-09-01T08:00:00Z",
};
const seed = {
  id: "12345678-1234-4234-8234-123456789012",
  professionalId: 2,
  professionalName: "Operario",
  profession: "electricista",
  projectId: 1,
  projectName: "Baño Pinto",
  kind: "jornada",
  startedAt: "2026-09-19T08:00:00Z",
  endedAt: null as string | null,
  pauses: [] as Array<{ startedAt: string; endedAt: string | null }>,
  breakSeconds: 0,
  units: null,
  unitLabel: "hora",
  notes: "",
  status: "abierto",
  revision: 1,
  rate,
  approvedCostCents: null as number | null,
  approvedBy: null,
  approvedAt: null,
  reviewReason: "",
  createdAt: "2026-09-19T08:00:00Z",
};
async function fixture(
  page: Page,
  role = "profesional",
  fail = false,
  options: {
    path?: string;
    projects?: typeof project[];
    engagement?: "empleado" | "autonomo" | "subcontrata" | null;
  } = {},
) {
  let entry: typeof seed | null =
    role === "admin"
      ? { ...seed, endedAt: "2026-09-19T10:00:00Z", status: "enviado" }
      : null;
  const calls: string[] = [];
  await page.addInitScript(() =>
    sessionStorage.setItem("rp_token", "test-token"),
  );
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname.replace("/api", "");
    calls.push(path);
    const req = route.request();
    let payload: unknown;
    if (path === "/auth/me")
      payload = {
        id: role === "admin" ? 1 : 2,
        nombre: "Operario",
        email: "pro@test.es",
        rol: role,
        activo: true,
      };
    else if (path === "/projects") payload = options.projects ?? [project];
    else if (path === "/users")
      payload = [
        { id: 2, nombre: "Operario", activo: true, rol: "profesional" },
      ];
    else if (path === "/work/current")
      payload = {
        engagement: options.engagement === undefined ? "empleado" : options.engagement,
        rateUnit: options.engagement === null ? null : "hora",
        unitLabel: options.engagement === null ? null : "hora",
        open: entry?.status === "abierto" ? entry : null,
      };
    else if (path === "/work/entries")
      payload = {
        items: entry ? [entry] : [],
        total: entry ? 1 : 0,
        page: 0,
        pageSize: 50,
      };
    else if (path === "/work/start") {
      entry = { ...structuredClone(seed), id: req.postDataJSON().operationId };
      payload = entry;
    } else if (path.endsWith("/actions")) {
      if (fail) {
        await route.fulfill({
          status: 409,
          json: { message: "El registro ha cambiado. Actualiza." },
        });
        return;
      }
      const input = req.postDataJSON();
      if (entry) {
        entry.revision++;
        if (input.action === "pausa")
          entry.pauses.push({
            startedAt: "2026-09-19T09:00:00Z",
            endedAt: null,
          });
        if (input.action === "reanudar")
          entry.pauses[0]!.endedAt = "2026-09-19T09:30:00Z";
        if (input.action === "salida") {
          entry.endedAt = "2026-09-19T10:00:00Z";
          entry.status = "enviado";
        }
        if (input.action === "aprobar") {
          entry.status = "aprobado";
          entry.approvedCostCents = 4000;
        }
      }
      payload = entry;
    } else if (path.endsWith("/rates"))
      payload = req.method() === "GET" ? [rate] : rate;
    else if (path.endsWith("/summary"))
      payload = {
        projectId: 1,
        approvedHours: entry?.status === "aprobado" ? 2 : 0,
        approvedCostCents: entry?.approvedCostCents ?? 0,
        pending: entry?.status === "enviado" ? 1 : 0,
        open: 0,
        budget: null,
        hoursDeviation: null,
        costDeviationCents: null,
        byProfessional: [],
      };
    else if (path.endsWith("/history")) payload = [];
    else {
      await route.fulfill({
        status: 404,
        json: { message: "Unexpected test request" },
      });
      return;
    }
    await route.fulfill({ json: payload });
  });
  await page.goto(options.path ?? `/${role}/work`);
  return calls;
}
test("professional can discover work tracking from the dashboard", async ({
  page,
}) => {
  await fixture(page, "profesional", false, { path: "/profesional" });
  await expect(
    page.getByRole("button", { name: "Registrar trabajo", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Registrar trabajo", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mi trabajo", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Obra asignada")).toHaveValue("1");
});
test("work tracking explains when no assigned work is available", async ({ page }) => {
  await fixture(page, "profesional", false, { projects: [] });
  await expect(
    page.getByText("No tienes ninguna obra disponible para registrar trabajo."),
  ).toBeVisible();
});
test("work tracking explains when configuration is incomplete", async ({ page }) => {
  await fixture(page, "profesional", false, { engagement: null });
  await expect(
    page.getByText("Tu acceso está activo, pero falta configurar el fichaje."),
  ).toBeVisible();
});
for (const width of [390, 1440])
  test(`employee workflow at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = await fixture(page);
    await expect(
      page.getByRole("heading", { name: "Mi trabajo", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".work-page__header")).toBeVisible();
    await page.getByLabel("Obra asignada").selectOption("1");
    await page
      .getByRole("button", { name: "Registrar entrada", exact: true })
      .click();
    await expect(page.getByText("En curso", { exact: false })).toBeVisible();
    await page
      .getByRole("button", { name: "Iniciar pausa", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Reanudar", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Reanudar", exact: true }).click();
    await page
      .getByRole("button", { name: "Registrar salida", exact: true })
      .click();
    await expect(page.getByText("1.50 horas netas")).toBeVisible();
    expect(calls).not.toContain("/users");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("work-professional.png"),
      fullPage: true,
    });
  });
test("admin approves a part and sees project cost and rate history", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fixture(page, "admin");
  await page
    .getByRole("combobox", { name: "Profesional", exact: true })
    .selectOption("2");
  await page
    .getByRole("combobox", { name: "Obra", exact: true })
    .selectOption("1");
  await expect(
    page.getByRole("heading", { name: "Vinculación y tarifas internas" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Aprobar registro", exact: true })
    .click();
  await expect(page.getByText("40,00", { exact: false }).first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("work-admin.png"),
    fullPage: true,
  });
});
for (const width of [390, 768, 1024, 1440])
  test(`admin layout at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page, "admin");
    await expect(
      page.getByRole("heading", { name: "Jornadas y costes", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const brand = await page.locator(".private-brand").boundingBox(),
      nav = await page.locator(".private-nav").boundingBox();
    if (brand && nav)
      expect(
        nav.x >= brand.x + brand.width - 1 ||
          nav.y >= brand.y + brand.height - 1,
      ).toBe(true);
    await page.screenshot({
      path: info.outputPath("layout.png"),
      fullPage: true,
    });
  });
test("action failures keep the form and show a recoverable error", async ({
  page,
}) => {
  await fixture(page, "admin", true);
  await page
    .getByLabel("Motivo del rechazo", { exact: true })
    .fill("Horas por revisar");
  await page.getByRole("button", { name: "Rechazar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Actualiza");
  await expect(
    page.getByLabel("Motivo del rechazo", { exact: true }),
  ).toHaveValue("Horas por revisar");
});
