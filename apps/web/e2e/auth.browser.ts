import { expect, test } from "@playwright/test";

const client = {
  id: 7,
  email: "cliente@hogaria.design",
  nombre: "Cliente Hogaria",
  rol: "cliente",
  activo: true,
};

test("login stores the server expiry and redirects an expired private session", async ({ page }) => {
  await page.route("**/api/auth/login", route => route.fulfill({
    json: { user: client, token: "session-token", expiresAt: Date.now() + 2_000 },
  }));
  await page.route("**/api/projects", route => route.fulfill({ json: [] }));
  await page.goto("/#/login");
  await page.getByLabel("Email").fill(client.email);
  await page.getByLabel("Contraseña").fill("contraseña-segura");
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();

  await expect(page).toHaveURL(/\/cliente$/);
  await expect.poll(() => page.evaluate(() => Number(sessionStorage.getItem("rp_expires_at")))).toBeGreaterThan(Date.now());
  await expect(page).toHaveURL(/\/login$/, { timeout: 5_000 });
  await expect(page.getByRole("alert")).toContainText("sesión ha caducado");
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("rp_token"))).toBeNull();
});

test("a role cannot render another role's private route", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("rp_token", "session-token"));
  await page.route("**/api/auth/me", route => route.fulfill({ json: client }));
  await page.goto("/#/admin/users");

  await expect(page.getByRole("heading", { name: "Usuarios" })).toHaveCount(0);
  await expect(page.getByText("Página no encontrada")).toBeVisible();
});
