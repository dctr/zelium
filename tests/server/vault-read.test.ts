import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createServer } from '../../src/server/index';
import type { VaultRootConfig } from '../../src/server/config';

const tempDirs: string[] = [];

async function makeVault(name: string): Promise<VaultRootConfig> {
  const dir = await mkdtemp(path.join(tmpdir(), `zelium-${name}-`));
  tempDirs.push(dir);
  return { id: name, name, path: await realpath(dir) };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('vault read API', () => {
  it('GET /api/vaults returns configured root ids and names without filesystem paths', async () => {
    const first = await makeVault('alpha');
    const second = await makeVault('beta');
    const app = createServer({ roots: [first, second] });

    const response = await app.inject({ method: 'GET', url: '/api/vaults' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { id: 'alpha', name: 'alpha' },
      { id: 'beta', name: 'beta' },
    ]);
    await app.close();
  });

  it('GET /api/tree returns nested folders and markdown pages only', async () => {
    const root = await makeVault('root-1');
    await mkdir(path.join(root.path, 'b-folder'));
    await mkdir(path.join(root.path, 'a-folder', 'nested'), { recursive: true });
    await mkdir(path.join(root.path, '.git'));
    await writeFile(path.join(root.path, 'z-note.md'), '# Z');
    await writeFile(path.join(root.path, 'a-note.txt'), 'ignore me');
    await writeFile(path.join(root.path, '.hidden.md'), 'ignore me');
    await writeFile(path.join(root.path, '.git', 'config'), 'ignore me');
    await writeFile(path.join(root.path, 'a-folder', 'page.md'), '# Page');
    await writeFile(path.join(root.path, 'a-folder', 'nested', 'deep.md'), '# Deep');
    await writeFile(path.join(root.path, 'b-folder', 'b.md'), '# B');
    const app = createServer({ roots: [root] });

    const response = await app.inject({ method: 'GET', url: '/api/tree?rootId=root-1' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        rootId: 'root-1',
        path: 'a-folder',
        name: 'a-folder',
        kind: 'folder',
        children: [
          {
            rootId: 'root-1',
            path: 'a-folder/nested',
            name: 'nested',
            kind: 'folder',
            children: [{ rootId: 'root-1', path: 'a-folder/nested/deep.md', name: 'deep.md', kind: 'page' }],
          },
          { rootId: 'root-1', path: 'a-folder/page.md', name: 'page.md', kind: 'page' },
        ],
      },
      {
        rootId: 'root-1',
        path: 'b-folder',
        name: 'b-folder',
        kind: 'folder',
        children: [{ rootId: 'root-1', path: 'b-folder/b.md', name: 'b.md', kind: 'page' }],
      },
      { rootId: 'root-1', path: 'z-note.md', name: 'z-note.md', kind: 'page' },
    ]);
    await app.close();
  });

  it('GET /api/page returns markdown, split frontmatter, body, and etag', async () => {
    const root = await makeVault('root-1');
    const markdown = '---\ntitle: Test\n---\n# Body';
    await writeFile(path.join(root.path, 'note.md'), markdown);
    const app = createServer({ roots: [root] });

    const response = await app.inject({ method: 'GET', url: '/api/page?rootId=root-1&path=note.md' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      rootId: 'root-1',
      path: 'note.md',
      markdown,
      frontmatter: 'title: Test',
      body: '# Body',
      etag: expect.any(String),
    });
    expect(response.json().etag.length).toBeGreaterThan(0);
    await app.close();
  });

  it('GET /api/page returns 404 for a missing page', async () => {
    const root = await makeVault('root-1');
    const app = createServer({ roots: [root] });

    const response = await app.inject({ method: 'GET', url: '/api/page?rootId=root-1&path=missing.md' });

    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('GET /api/page returns 400 for non-markdown page paths', async () => {
    const root = await makeVault('root-1');
    await writeFile(path.join(root.path, 'note.txt'), 'plain text');
    const app = createServer({ roots: [root] });

    const response = await app.inject({ method: 'GET', url: '/api/page?rootId=root-1&path=note.txt' });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('GET /api/page returns 400 for traversal paths', async () => {
    const root = await makeVault('root-1');
    const app = createServer({ roots: [root] });

    const response = await app.inject({ method: 'GET', url: '/api/page?rootId=root-1&path=..%2Fsecret.md' });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
