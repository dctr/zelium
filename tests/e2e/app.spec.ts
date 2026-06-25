import { expect, type Page, test } from '@playwright/test';

const vaults = [
  { id: 'root-1', name: 'Vault A' },
  { id: 'root-2', name: 'Vault B' },
];

const trees = {
  'root-1': [
    {
      rootId: 'root-1',
      path: 'folder',
      name: 'folder',
      kind: 'folder',
      children: [{ rootId: 'root-1', path: 'folder/deep.md', name: 'deep.md', kind: 'page' }],
    },
    { rootId: 'root-1', path: 'broken.md', name: 'broken.md', kind: 'page' },
    { rootId: 'root-1', path: 'long-content.md', name: 'long-content.md', kind: 'page' },
    { rootId: 'root-1', path: 'INDEX.md', name: 'INDEX.md', kind: 'page' },
  ],
  'root-2': [{ rootId: 'root-2', path: 'note.md', name: 'note.md', kind: 'page' }],
} as const;

const pages = {
  'root-1:INDEX.md': {
    rootId: 'root-1',
    path: 'INDEX.md',
    markdown: '---\ntitle: Home\n---\n# Welcome\n\nHome body',
    frontmatter: 'title: Home',
    body: '# Welcome\n\nHome body',
    etag: 'W/"1-1"',
  },
  'root-1:folder/deep.md': {
    rootId: 'root-1',
    path: 'folder/deep.md',
    markdown: '# Deep',
    frontmatter: '',
    body: '# Deep',
    etag: 'W/"2-2"',
  },
  'root-1:long-content.md': {
    rootId: 'root-1',
    path: 'long-content.md',
    markdown:
      '# Long content\n\n![wide preview](data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221200%22%20height=%22120%22%3E%3C/svg%3E)\n\n| Identifier | Notes |\n| --- | --- |\n| a-very-long-unbroken-token-that-should-wrap-instead-of-forcing-horizontal-scroll-on-a-phone-viewport | still editable |',
    frontmatter: '',
    body:
      '# Long content\n\n![wide preview](data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221200%22%20height=%22120%22%3E%3C/svg%3E)\n\n| Identifier | Notes |\n| --- | --- |\n| a-very-long-unbroken-token-that-should-wrap-instead-of-forcing-horizontal-scroll-on-a-phone-viewport | still editable |',
    etag: 'W/"4-4"',
  },
  'root-2:note.md': {
    rootId: 'root-2',
    path: 'note.md',
    markdown: '# Note',
    frontmatter: '',
    body: '# Note',
    etag: 'W/"3-3"',
  },
} as const;

type SavePageRequest = {
  rootId: string;
  path: string;
  frontmatter: string;
  body: string;
  etag: string;
};

type MockVaultApiOptions = {
  beforePageResponse?: (rootId: string, path: string) => Promise<void>;
  pageErrors?: Record<string, string>;
  savePage?: (payload: SavePageRequest) => Promise<{ status?: number; json: unknown }>;
};

type ThemeSample = {
  name: string;
  foreground: string;
  background: string;
  minimumContrast: number;
};

async function mockVaultApi(page: Page, options: MockVaultApiOptions = {}) {
  await page.route('**/api/vaults', async (route) => {
    await route.fulfill({ json: vaults });
  });
  await page.route('**/api/tree**', async (route) => {
    const rootId = new URL(route.request().url()).searchParams.get('rootId') as keyof typeof trees;
    await route.fulfill({ json: trees[rootId] ?? [] });
  });
  await page.route('**/api/page**', async (route) => {
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON() as SavePageRequest;
      if (options.savePage) {
        const response = await options.savePage(payload);
        await route.fulfill({ status: response.status ?? 200, json: response.json });
        return;
      }

      await route.fulfill({
        json: {
          ...payload,
          markdown: `${payload.frontmatter ? `---\n${payload.frontmatter}\n---\n\n` : ''}${payload.body}`,
          etag: 'W/"saved"',
        },
      });
      return;
    }

    const url = new URL(route.request().url());
    const rootId = url.searchParams.get('rootId') ?? '';
    const path = url.searchParams.get('path') ?? '';
    await options.beforePageResponse?.(rootId, path);

    const key = `${rootId}:${path}`;
    const error = options.pageErrors?.[key];
    if (error) {
      await route.fulfill({ status: 500, json: { error } });
      return;
    }

    await route.fulfill({ json: pages[key as keyof typeof pages] });
  });
}

async function enablePageEdits(page: Page): Promise<void> {
  const readOnlyToggle = page.getByRole('checkbox', { name: 'Read only' });
  await expect(readOnlyToggle).toBeChecked();
  await readOnlyToggle.uncheck();
  await expect(readOnlyToggle).not.toBeChecked();
}

function parseRgb(value: string): [number, number, number] {
  const channels = value.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) throw new Error(`Expected rgb() color, received ${value}`);
  return channels as [number, number, number];
}

function luminance(value: string): number {
  const [red, green, blue] = parseRgb(value).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function expectLegibleColors(samples: ThemeSample[]): void {
  for (const sample of samples) {
    expect(contrastRatio(sample.foreground, sample.background), sample.name).toBeGreaterThanOrEqual(sample.minimumContrast);
  }
}

test('loads the Zelium shell', async ({ page }) => {
  await mockVaultApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Zelium' })).toBeVisible();
});

test('adapts the shell for a phone viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockVaultApi(page);

  await page.goto('/');
  await page.getByRole('button', { name: 'INDEX.md' }).click();

  await expect(page.getByRole('heading', { name: 'Zelium' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'INDEX', level: 2 })).toBeVisible();

  const layout = await page.evaluate(() => {
    const shell = document.querySelector('.app-shell')!;
    const sidebar = document.querySelector('.sidebar')!;
    return {
      columns: getComputedStyle(shell).gridTemplateColumns,
      sidebarBorderBottom: getComputedStyle(sidebar).borderBottomWidth,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });

  expect(layout.columns.trim().split(' ')).toHaveLength(1);
  expect(layout.sidebarBorderBottom).not.toBe('0px');
  expect(layout.horizontalOverflow).toBe(false);
});

test('wraps wide editor content instead of overflowing on a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockVaultApi(page);

  await page.goto('/');
  await page.getByRole('button', { name: 'long-content.md' }).click();
  await expect(page.getByLabel('Markdown editor')).toContainText('a-very-long-unbroken-token');
  await expect(page.getByLabel('Markdown editor').getByRole('img', { name: 'wide preview' })).toBeVisible();

  const viewportWidth = page.viewportSize()!.width;
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth);
  await expect.poll(() => page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(viewportWidth);
});

test('keeps system light and dark themes legible', async ({ page }) => {
  await mockVaultApi(page);

  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    await page.getByRole('button', { name: 'INDEX.md' }).click();
    await expect(page.getByLabel('Markdown editor')).toBeVisible();
    await page.getByRole('button', { name: /frontmatter/i }).click();

    const theme = await page.evaluate(() => {
      const stylesFor = (selector: string) => getComputedStyle(document.querySelector(selector)!);
      const root = stylesFor('html');
      const saveState = stylesFor('.save-state');
      const sidebar = stylesFor('.sidebar');
      const treeNode = stylesFor('.tree-node');
      const selectedTreeNode = stylesFor('.tree-node[aria-current="page"]');
      const frontmatterBlock = stylesFor('.frontmatter-block');
      const frontmatterDisclosure = stylesFor('.frontmatter-disclosure');
      const frontmatterTextarea = stylesFor('.frontmatter-editor textarea');
      const markdownEditor = stylesFor('.markdown-editor .milkdown');

      return {
        colorScheme: root.colorScheme,
        samples: [
          { name: 'document text', foreground: root.color, background: root.backgroundColor, minimumContrast: 4.5 },
          { name: 'save state text', foreground: saveState.color, background: root.backgroundColor, minimumContrast: 4.5 },
          { name: 'sidebar border', foreground: sidebar.borderRightColor, background: sidebar.backgroundColor, minimumContrast: 1.5 },
          { name: 'tree button text', foreground: treeNode.color, background: sidebar.backgroundColor, minimumContrast: 4.5 },
          { name: 'selected tree button text', foreground: selectedTreeNode.color, background: selectedTreeNode.backgroundColor, minimumContrast: 4.5 },
          { name: 'frontmatter button text', foreground: frontmatterDisclosure.color, background: frontmatterBlock.backgroundColor, minimumContrast: 4.5 },
          { name: 'frontmatter editor text', foreground: frontmatterTextarea.color, background: frontmatterTextarea.backgroundColor, minimumContrast: 4.5 },
          { name: 'frontmatter editor border', foreground: frontmatterTextarea.borderTopColor, background: frontmatterTextarea.backgroundColor, minimumContrast: 1.5 },
          { name: 'markdown editor text', foreground: markdownEditor.color, background: markdownEditor.backgroundColor, minimumContrast: 4.5 },
          { name: 'markdown editor border', foreground: markdownEditor.borderTopColor, background: markdownEditor.backgroundColor, minimumContrast: 1.5 },
        ],
      };
    });

    expect(theme.colorScheme).toContain(colorScheme);
    expectLegibleColors(theme.samples);
  }
});

test('exposes PWA install metadata and registers the service worker', async ({ page }) => {
  await mockVaultApi(page);

  await page.goto('/');

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/icon-192.png');

  const manifestResponse = await page.request.get('/manifest.webmanifest');
  expect(manifestResponse.status()).toBe(200);
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({ name: 'Zelium', display: 'standalone', start_url: '/' });
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192', type: 'image/png' }),
      expect.objectContaining({ sizes: '512x512', type: 'image/png' }),
    ]),
  );

  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.getRegistration('/').then(Boolean))).toBe(true);
});

test('renders configured vault roots, expands folders, and selects pages', async ({ page }) => {
  await mockVaultApi(page);

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Vault A' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vault B' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'INDEX.md' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'note.md' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'deep.md' })).toHaveCount(0);

  await page.getByTestId('node-folder').locator('button.tree-folder').click();
  await expect(page.getByRole('button', { name: 'deep.md' })).toBeVisible();

  await page.getByRole('button', { name: 'deep.md' }).click();
  await expect(page.getByRole('button', { name: 'deep.md' })).toHaveAttribute('aria-current', 'page');
});

test('loads the selected page with a filename-derived title and markdown body', async ({ page }) => {
  await mockVaultApi(page);

  await page.goto('/');
  await page.getByRole('button', { name: 'INDEX.md' }).click();

  await expect(page.getByRole('heading', { name: 'INDEX', level: 2 })).toBeVisible();
  await expect(page.getByLabel('Markdown editor').getByRole('heading', { name: 'Welcome', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Markdown editor')).toContainText('Home body');
});

test('prevents page edits while read-only is checked by default', async ({ page }) => {
  const saveCalls: SavePageRequest[] = [];
  await mockVaultApi(page, {
    savePage: async (payload) => {
      saveCalls.push(payload);
      return { json: { ...payload, markdown: payload.body, etag: 'W/"should-not-save"' } };
    },
  });

  await page.goto('/');
  await expect(page.getByRole('checkbox', { name: 'Read only' })).toBeChecked();
  await page.getByRole('button', { name: 'INDEX.md' }).click();

  const editor = page.getByLabel('Markdown editor');
  await expect(editor).toHaveAttribute('contenteditable', 'false');
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Blocked body edit');
  await expect(editor).toContainText('Home body');
  await expect(editor).not.toContainText('Blocked body edit');

  await page.getByRole('button', { name: /frontmatter/i }).click();
  const frontmatter = page.getByLabel('YAML frontmatter');
  await expect(frontmatter).toBeDisabled();
  await expect(frontmatter).toHaveValue('title: Home');
  await page.waitForTimeout(700);
  expect(saveCalls).toHaveLength(0);
});

test('resets read-only state after a page reload', async ({ page }) => {
  await mockVaultApi(page);

  await page.goto('/');
  const readOnlyToggle = page.getByRole('checkbox', { name: 'Read only' });
  await expect(readOnlyToggle).toBeChecked();
  await readOnlyToggle.uncheck();
  await expect(readOnlyToggle).not.toBeChecked();

  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Read only' })).toBeChecked();
});

test('renders existing markdown as inline document structure without raw markers', async ({ page }) => {
  await mockVaultApi(page);

  await page.goto('/');
  await page.getByRole('button', { name: 'INDEX.md' }).click();

  const editor = page.getByLabel('Markdown editor');
  await expect(editor.getByRole('heading', { name: 'Welcome', level: 1 })).toBeVisible();
  await expect(editor).not.toContainText('# Welcome');
});

test('converts markdown shortcuts to inline headings and lists while typing', async ({ page }) => {
  await mockVaultApi(page);

  await page.goto('/');
  await enablePageEdits(page);
  await page.getByRole('button', { name: 'INDEX.md' }).click();

  const editor = page.getByLabel('Markdown editor');
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('# ');
  await page.keyboard.type('Draft title');

  await expect(editor.getByRole('heading', { name: 'Draft title', level: 1 })).toBeVisible();

  await page.keyboard.press('Enter');
  await page.keyboard.type('- ');
  await page.keyboard.type('First bullet');
  await expect(editor.getByRole('listitem').filter({ hasText: 'First bullet' })).toBeVisible();

  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- [ ] ');
  await page.keyboard.type('First task');

  const taskItem = editor.locator('li[data-item-type="task"][data-checked="false"]').filter({ hasText: 'First task' });
  await expect(taskItem).toBeVisible();
});

test('autosaves body edits with visible save states and updated etag', async ({ page }) => {
  const saveCalls: SavePageRequest[] = [];
  let releaseSave!: () => void;
  const saveCanFinish = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });

  await mockVaultApi(page, {
    savePage: async (payload) => {
      saveCalls.push(payload);
      await saveCanFinish;
      return {
        json: {
          ...payload,
          markdown: `${payload.frontmatter ? `---\n${payload.frontmatter}\n---\n\n` : ''}${payload.body}`,
          etag: 'W/"saved-body"',
        },
      };
    },
  });

  await page.goto('/');
  await enablePageEdits(page);
  await page.getByRole('button', { name: 'INDEX.md' }).click();
  await expect(page.getByText('Saved')).toBeVisible();

  const editor = page.getByLabel('Markdown editor');
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Edited body');

  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await expect(page.getByText('Saving…')).toBeVisible();
  expect(saveCalls[0]).toMatchObject({
    rootId: 'root-1',
    path: 'INDEX.md',
    frontmatter: 'title: Home',
    body: expect.stringContaining('Edited body'),
    etag: 'W/"1-1"',
  });

  releaseSave();
  await expect(page.getByText('Saved')).toBeVisible();

  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Edited again');
  await expect.poll(() => saveCalls.length).toBe(2);
  expect(saveCalls[1]).toMatchObject({ etag: 'W/"saved-body"', body: expect.stringContaining('Edited again') });
});

test('invalid frontmatter prevents autosave and shows invalid save state', async ({ page }) => {
  const saveCalls: SavePageRequest[] = [];
  await mockVaultApi(page, {
    savePage: async (payload) => {
      saveCalls.push(payload);
      return { json: { ...payload, markdown: payload.body, etag: 'W/"should-not-save"' } };
    },
  });

  await page.goto('/');
  await enablePageEdits(page);
  await page.getByRole('button', { name: 'INDEX.md' }).click();
  await page.getByRole('button', { name: /frontmatter/i }).click();

  await page.getByLabel('YAML frontmatter').fill('title: [unterminated');

  await expect(page.getByRole('alert')).toContainText('Invalid YAML');
  await expect(page.getByText('Invalid frontmatter')).toBeVisible();
  await page.waitForTimeout(700);
  expect(saveCalls).toHaveLength(0);
});

test('etag conflicts show conflict state and stop further overwrite attempts', async ({ page }) => {
  const saveCalls: SavePageRequest[] = [];
  await mockVaultApi(page, {
    savePage: async (payload) => {
      saveCalls.push(payload);
      return { status: 409, json: { error: 'Page changed on disk.' } };
    },
  });

  await page.goto('/');
  await enablePageEdits(page);
  await page.getByRole('button', { name: 'INDEX.md' }).click();

  const editor = page.getByLabel('Markdown editor');
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('First conflicting edit');

  await expect(page.getByText('Conflict: page changed on disk. Reload to continue.')).toBeVisible();
  expect(saveCalls).toHaveLength(1);

  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Second edit that must not overwrite');
  await page.waitForTimeout(700);
  expect(saveCalls).toHaveLength(1);
});

test('renders collapsed editable frontmatter and validates pending edits', async ({ page }) => {
  await mockVaultApi(page);

  await page.goto('/');
  await enablePageEdits(page);
  await page.getByRole('button', { name: 'INDEX.md' }).click();
  await expect(page.getByRole('heading', { name: 'INDEX', level: 2 })).toBeVisible();

  const disclosure = page.getByRole('button', { name: /frontmatter/i });
  await expect(disclosure).toBeVisible();
  await expect(disclosure).toHaveText(/>/);
  await expect(page.getByLabel('YAML frontmatter')).toHaveCount(0);

  await disclosure.click();
  const editor = page.getByLabel('YAML frontmatter');
  await expect(editor).toHaveValue('title: Home');

  await editor.fill('title: [unterminated');
  await expect(page.getByRole('alert')).toContainText('Invalid YAML');
  await expect(page.getByText('Invalid frontmatter')).toBeVisible();

  await editor.fill('title: Edited');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Invalid frontmatter')).toHaveCount(0);
  await expect(page.getByText('Unsaved changes')).toBeVisible();
});

test('shows page loading and error states when a selected page cannot be loaded', async ({ page }) => {
  let releasePageResponse!: () => void;
  const waitForRelease = new Promise<void>((resolve) => {
    releasePageResponse = resolve;
  });
  await mockVaultApi(page, {
    beforePageResponse: async (_rootId, path) => {
      if (path === 'broken.md') {
        await waitForRelease;
      }
    },
    pageErrors: { 'root-1:broken.md': 'Unable to load page.' },
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'broken.md' }).click();

  await expect(page.getByRole('status')).toHaveText('Loading page…');
  releasePageResponse();
  await expect(page.getByRole('alert')).toHaveText('Unable to load page.');
});
