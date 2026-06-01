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
