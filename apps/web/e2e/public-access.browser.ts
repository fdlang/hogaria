import { test, expect } from '@playwright/test';

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`public menu private access at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    const button = nav.getByRole('button', { name: width <= 720 ? 'Área cliente' : 'Área privada' });
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

test('public footer actions form a readable column on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const footer = page.locator('.portfolio > footer');
  const links = footer.locator('.footer-links');
  await footer.scrollIntoViewIfNeeded();
  await expect(footer.getByText('Instagram', { exact: true })).toBeVisible();
  await expect(footer).toHaveCSS('flex-direction', 'column');
  await expect(links).toHaveCSS('flex-direction', 'column');
  const footerOrder = await footer.locator(':scope > *').evaluateAll(elements => elements.map(element => element.className || element.tagName.toLowerCase()));
  expect(footerOrder).toEqual(['footer-brand', 'footer-contact', 'footer-links', 'footer-signature']);
  const instagramLink = links.getByRole('link', { name: 'Instagram de Hogaria' });
  await expect(instagramLink).toHaveAttribute('href', 'https://www.instagram.com/hogaria.desing?stkn=MTlvYzRnbHVsY2FmYg==');
  const instagram = await instagramLink.boundingBox();
  const privacy = await links.getByRole('link', { name: 'Privacidad' }).boundingBox();
  const client = await links.getByRole('button', { name: 'Área cliente' }).boundingBox();
  await expect(links.getByRole('button', { name: 'Área cliente' })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(links.getByRole('button', { name: 'Área cliente' })).toHaveCSS('border-top-width', '0px');
  expect(privacy!.y).toBeGreaterThanOrEqual(instagram!.y + instagram!.height);
  expect(client!.y).toBeGreaterThanOrEqual(privacy!.y + privacy!.height);
});

test('portrait portfolio video stays inside the mobile viewport without changing its aspect ratio', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const section = page.locator('.project-showcase__video');
  const video = section.locator(':scope > video');
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator('.project-showcase__video-frame')).toHaveCount(0);
  await expect(section.locator('.project-showcase__sound')).toHaveCount(0);
  await expect(video).toHaveAttribute('controls', '');
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
  const dimensions = await video.evaluate(element => {
    const media = element as HTMLVideoElement;
    const box = media.getBoundingClientRect();
    const frameBox = media.parentElement!.getBoundingClientRect();
    return {
      renderedRatio: box.width / box.height,
      intrinsicRatio: media.videoWidth / media.videoHeight,
      renderedWidth: box.width,
      renderedHeight: box.height,
      frameWidth: frameBox.width,
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  expect(dimensions.renderedWidth).toBeLessThanOrEqual(dimensions.frameWidth);
  expect(dimensions.renderedHeight).toBeLessThanOrEqual(608);
  expect(Math.abs(dimensions.renderedRatio - dimensions.intrinsicRatio)).toBeLessThan(0.02);
  expect(dimensions.pageWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
});

test('activation link survives a reload until it is consumed', async ({ page }) => {
  const token = 'a'.repeat(48);
  await page.goto(`/#/activar-cuenta?token=${token}`);
  await expect(page.getByRole('heading', { name: 'Crea tu contraseña' })).toBeVisible();
  await expect(page).not.toHaveURL(/token=/);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('hogaria_activation_token'))).toBe(token);

  await page.reload();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('hogaria_activation_token'))).toBe(token);
  await expect(page.getByRole('heading', { name: 'Crea tu contraseña' })).toBeVisible();
});
