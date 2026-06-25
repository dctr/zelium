import { expect, type Page, test } from '@playwright/test';

const vaults = [{ id: 'root-1', name: 'Vault A' }];

const trees = {
  'root-1': [
    { rootId: 'root-1', path: 'INDEX.md', name: 'INDEX.md', kind: 'page' },
    {
      rootId: 'root-1',
      path: 'projects',
      name: 'projects',
      kind: 'folder',
      children: [{ rootId: 'root-1', path: 'projects/brief.md', name: 'brief.md', kind: 'page' }],
    },
  ],
} as const;

async function mockVaultApi(page: Page): Promise<void> {
  await page.route('**/api/vaults', async (route) => {
    await route.fulfill({ json: vaults });
  });
  await page.route('**/api/tree**', async (route) => {
    const rootId = new URL(route.request().url()).searchParams.get('rootId') as keyof typeof trees;
    await route.fulfill({ json: trees[rootId] ?? [] });
  });
}

test('sidebar shows vault tree without file operation controls', async ({ page }) => {
  await mockVaultApi(page);

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Vault A', level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'INDEX.md' })).toBeVisible();
  await page.getByRole('button', { name: /projects/ }).click();
  await expect(page.getByRole('button', { name: 'brief.md' })).toBeVisible();

  await expect(page.getByRole('button', { name: 'New page' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New folder' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rename' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Move' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  await expect(page.getByTestId('file-action-form')).toHaveCount(0);
  await expect(page.locator('[data-testid^="root-actions-"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="node-actions-"]')).toHaveCount(0);
});
