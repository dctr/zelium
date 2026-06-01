import { expect, type Page, test } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { VaultRootConfig } from '../../src/server/config';
import { createServer } from '../../src/server/index';

type Harness = {
  app: FastifyInstance;
  root: VaultRootConfig;
  dir: string;
  mutationRequests: string[];
};

const harnesses: Harness[] = [];

test.afterEach(async () => {
  await Promise.all(
    harnesses.splice(0).map(async (harness) => {
      await harness.app.close();
      await rm(harness.dir, { recursive: true, force: true });
    }),
  );
});

test('creates a page under the root, refreshes the tree, and selects the new page', async ({ page }) => {
  const harness = await setupFixtureVault(page, { 'INDEX.md': '# Home' });
  await page.goto('/');
  await rootActions(page).getByRole('button', { name: 'New page' }).click();
  await page.getByLabel('Page name').fill('created.md');
  await page.getByRole('button', { name: 'Create page' }).click();
  await expect(page.getByRole('button', { name: 'created.md' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'created', level: 2 })).toBeVisible();
  await expect(fileExists(path.join(harness.root.path, 'created.md'))).resolves.toBe(true);
});

test('creates a folder under the root and creates a page inside that folder', async ({ page }) => {
  const harness = await setupFixtureVault(page, { 'INDEX.md': '# Home' });
  await page.goto('/');
  await rootActions(page).getByRole('button', { name: 'New folder' }).click();
  await page.getByLabel('Folder name').fill('projects');
  await page.getByRole('button', { name: 'Create folder' }).click();
  await expect(page.getByTestId('node-projects')).toBeVisible();
  await expect.poll(() => fileExists(path.join(harness.root.path, 'projects'))).toBe(true);
  await page.getByTestId('node-projects').getByRole('button', { name: /projects/ }).click();
  await nodeActions(page, 'projects').getByRole('button', { name: 'New page' }).click();
  await page.getByLabel('Page name').fill('brief.md');
  await page.getByRole('button', { name: 'Create page' }).click();
  await expect(page.getByRole('button', { name: 'brief.md' })).toHaveAttribute('aria-current', 'page');
  await expect(await readFile(path.join(harness.root.path, 'projects', 'brief.md'), 'utf8')).toBe('');
});

test('validates create names before sending a mutation request', async ({ page }) => {
  const harness = await setupFixtureVault(page, { 'INDEX.md': '# Home' });
  await page.goto('/');
  await rootActions(page).getByRole('button', { name: 'New page' }).click();
  await page.getByLabel('Page name').fill('../secret.md');
  await page.getByRole('button', { name: 'Create page' }).click();
  await expect(page.getByRole('alert')).toContainText('Use a name, not a path.');
  expect(harness.mutationRequests).toEqual([]);
});

test('renames a page and refreshes the tree', async ({ page }) => {
  const harness = await setupFixtureVault(page, { 'old.md': '# Old' });
  await page.goto('/');
  await nodeActions(page, 'old.md').getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('New name').fill('renamed.md');
  await activeFileAction(page).getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByRole('button', { name: 'old.md' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'renamed.md' })).toBeVisible();
  await expect(fileExists(path.join(harness.root.path, 'old.md'))).resolves.toBe(false);
  await expect(await readFile(path.join(harness.root.path, 'renamed.md'), 'utf8')).toBe('# Old');
});

test('moves a page to another folder in the same root', async ({ page }) => {
  const harness = await setupFixtureVault(page, { 'source.md': '# Source', target: null });
  await page.goto('/');
  await nodeActions(page, 'source.md').getByRole('button', { name: 'Move' }).click();
  await page.getByLabel('Destination folder').fill('target');
  await activeFileAction(page).getByRole('button', { name: 'Move' }).click();
  await expect.poll(() => fileExists(path.join(harness.root.path, 'source.md'))).toBe(false);
  await expect(await readFile(path.join(harness.root.path, 'target', 'source.md'), 'utf8')).toBe('# Source');
  await page.getByTestId('node-target').getByRole('button', { name: /target/ }).click();
  await expect(page.getByRole('button', { name: 'source.md' })).toBeVisible();
});

test('renames a folder and preserves its children', async ({ page }) => {
  const harness = await setupFixtureVault(page, { 'old-folder/page.md': '# Child' });
  await page.goto('/');
  await nodeActions(page, 'old-folder').getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('New name').fill('renamed-folder');
  await activeFileAction(page).getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByRole('button', { name: 'old-folder' })).toHaveCount(0);
  await page.getByTestId('node-renamed-folder').getByRole('button', { name: /renamed-folder/ }).click();
  await expect(page.getByRole('button', { name: 'page.md' })).toBeVisible();
  await expect(fileExists(path.join(harness.root.path, 'old-folder'))).resolves.toBe(false);
  await expect(await readFile(path.join(harness.root.path, 'renamed-folder', 'page.md'), 'utf8')).toBe('# Child');
});

test('requires confirmation before deleting a page', async ({ page }) => {
  const harness = await setupFixtureVault(page, { 'delete-me.md': '# Delete', 'keep-me.md': '# Keep' });
  await page.goto('/');
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('delete-me.md');
    await dialog.dismiss();
  });
  await nodeActions(page, 'delete-me.md').getByRole('button', { name: 'Delete' }).click();
  await expect(fileExists(path.join(harness.root.path, 'delete-me.md'))).resolves.toBe(true);
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('delete-me.md');
    await dialog.accept();
  });
  await nodeActions(page, 'delete-me.md').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('button', { name: 'delete-me.md' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'keep-me.md' })).toBeVisible();
  await expect(fileExists(path.join(harness.root.path, 'delete-me.md'))).resolves.toBe(false);
});

test('requires confirmation naming the folder before deleting a non-empty folder', async ({ page }) => {
  const harness = await setupFixtureVault(page, { 'archive/page.md': '# Archived' });
  await page.goto('/');
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('archive');
    await dialog.accept();
  });
  await nodeActions(page, 'archive').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('button', { name: 'archive' })).toHaveCount(0);
  await expect(fileExists(path.join(harness.root.path, 'archive', 'page.md'))).resolves.toBe(false);
});

async function setupFixtureVault(page: Page, files: Record<string, string | null>): Promise<Harness> {
  const dir = await mkdtemp(path.join(tmpdir(), 'zelium-file-ops-'));
  const root: VaultRootConfig = { id: 'root-1', name: 'Vault A', path: await realpath(dir) };
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(root.path, relativePath);
    if (contents === null) {
      await mkdir(absolutePath, { recursive: true });
    } else {
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents);
    }
  }
  const app = createServer({ roots: [root] });
  const harness: Harness = { app, root, dir, mutationRequests: [] };
  harnesses.push(harness);
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method !== 'GET') harness.mutationRequests.push(`${method} ${url.pathname}`);
    const response = await app.inject({
      method: method as any,
      url: `${url.pathname}${url.search}`,
      headers: request.headers(),
      payload: request.postData() ?? undefined,
    });
    await route.fulfill({
      status: response.statusCode,
      headers: responseHeadersForPlaywright(response.headers),
      body: response.body,
    });
  });
  return harness;
}

function rootActions(page: Page) {
  return page.getByTestId('root-actions-root-1');
}

function nodeActions(page: Page, nodePath: string) {
  return page.getByTestId(`node-actions-${nodePath}`);
}

function activeFileAction(page: Page) {
  return page.getByTestId('file-action-form');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

function responseHeadersForPlaywright(headers: Record<string, string | number | string[] | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) => {
      if (value === undefined) return [];
      return [[key, Array.isArray(value) ? value.join(', ') : String(value)]];
    }),
  );
}
