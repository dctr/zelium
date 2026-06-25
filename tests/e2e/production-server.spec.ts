import { expect, test } from '@playwright/test';

test('production server serves the app shell, API, and fixture vault content', async ({ page, request }) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(health.headers()['content-type']).toContain('application/json');
  expect(await health.json()).toEqual({ ok: true });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Zelium' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'vault-a' })).toBeVisible();

  await page.getByRole('button', { name: 'INDEX.md' }).click();
  await expect(page.getByRole('heading', { name: 'INDEX', level: 2 })).toBeVisible();
  await expect(page.getByLabel('Markdown editor').getByRole('heading', { name: 'Fixture Home', level: 1 })).toBeVisible();

  await page.goto('/client/side/route');
  await expect(page.getByRole('heading', { name: 'Zelium' })).toBeVisible();
});

test('production server serves PWA install assets with browser-usable content types', async ({ request }) => {
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.status()).toBe(200);
  expect(manifest.headers()['content-type']).toContain('application/manifest+json');
  expect(await manifest.json()).toMatchObject({ name: 'Zelium', display: 'standalone', start_url: '/' });

  const serviceWorker = await request.get('/sw.js');
  expect(serviceWorker.status()).toBe(200);
  expect(serviceWorker.headers()['content-type']).toContain('text/javascript');
  expect(await serviceWorker.text()).toContain('addEventListener');

  const icon = await request.get('/icons/icon-192.png');
  expect(icon.status()).toBe(200);
  expect(icon.headers()['content-type']).toContain('image/png');
});
