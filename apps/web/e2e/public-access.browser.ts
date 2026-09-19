import { test, expect } from '@playwright/test';

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`public menu private access at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    const button = nav.getByRole('button', { name: 'Área privada' });
    await expect(button).toBeVisible();
    const brand = await nav.locator('.nav-brand').boundingBox();
    const access = await button.boundingBox();
    expect(access!.x).toBeGreaterThanOrEqual(brand!.x + brand!.width);
    expect(await nav.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await button.click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  });
}
