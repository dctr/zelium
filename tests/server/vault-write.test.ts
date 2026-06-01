import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { VaultRootConfig } from '../../src/server/config';
import { createServer } from '../../src/server/index';

const tempDirs: string[] = [];

async function makeVault(name: string): Promise<VaultRootConfig> {
  const dir = await mkdtemp(path.join(tmpdir(), `zelium-${name}-`));
  tempDirs.push(dir);
  return { id: name, name, path: await realpath(dir) };
}

async function currentEtag(root: VaultRootConfig, pagePath: string): Promise<string> {
  const app = createServer({ roots: [root] });
  const response = await app.inject({ method: 'GET', url: `/api/page?rootId=${root.id}&path=${encodeURIComponent(pagePath)}` });
  await app.close();
  return response.json().etag;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('vault write API', () => {
  it('PUT /api/page writes joined frontmatter and body to disk', async () => {
    const root = await makeVault('root-1');
    await writeFile(path.join(root.path, 'note.md'), '---\ntitle: Old\n---\n# Old');
    const etag = await currentEtag(root, 'note.md');
    const app = createServer({ roots: [root] });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/page',
      payload: { rootId: 'root-1', path: 'note.md', frontmatter: 'title: New', body: '# New body', etag },
    });

    expect(response.statusCode).toBe(200);
    expect(await readFile(path.join(root.path, 'note.md'), 'utf8')).toBe('---\ntitle: New\n---\n\n# New body');
    expect(response.json()).toMatchObject({
      rootId: 'root-1',
      path: 'note.md',
      markdown: '---\ntitle: New\n---\n\n# New body',
      frontmatter: 'title: New',
      body: '# New body',
      etag: expect.any(String),
    });
    expect(response.json().etag).not.toBe(etag);
    await app.close();
  });

  it('requires a matching etag', async () => {
    const root = await makeVault('root-1');
    await writeFile(path.join(root.path, 'note.md'), '# Original');
    const app = createServer({ roots: [root] });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/page',
      payload: { rootId: 'root-1', path: 'note.md', frontmatter: '', body: '# Changed' },
    });

    expect(response.statusCode).toBe(400);
    expect(await readFile(path.join(root.path, 'note.md'), 'utf8')).toBe('# Original');
    await app.close();
  });

  it('returns 409 and leaves the file unchanged when the etag is stale', async () => {
    const root = await makeVault('root-1');
    await writeFile(path.join(root.path, 'note.md'), '# Original');
    const app = createServer({ roots: [root] });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/page',
      payload: { rootId: 'root-1', path: 'note.md', frontmatter: '', body: '# Stale overwrite', etag: 'W/"0-0"' },
    });

    expect(response.statusCode).toBe(409);
    expect(await readFile(path.join(root.path, 'note.md'), 'utf8')).toBe('# Original');
    await app.close();
  });

  it('returns 409 for exactly one concurrent save using the same etag', async () => {
    const root = await makeVault('root-1');
    await writeFile(path.join(root.path, 'note.md'), '# Original');
    const etag = await currentEtag(root, 'note.md');
    const app = createServer({ roots: [root] });

    const [first, second] = await Promise.all([
      app.inject({
        method: 'PUT',
        url: '/api/page',
        payload: { rootId: 'root-1', path: 'note.md', frontmatter: '', body: '# First accepted', etag },
      }),
      app.inject({
        method: 'PUT',
        url: '/api/page',
        payload: { rootId: 'root-1', path: 'note.md', frontmatter: '', body: '# Second accepted', etag },
      }),
    ]);

    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
    expect(['# First accepted', '# Second accepted']).toContain(await readFile(path.join(root.path, 'note.md'), 'utf8'));
    await app.close();
  });

  it('writes through a temporary file and renames over the target without leaving temp files', async () => {
    const root = await makeVault('root-1');
    await mkdir(path.join(root.path, 'folder'));
    await writeFile(path.join(root.path, 'folder', 'note.md'), '# Original');
    const etag = await currentEtag(root, 'folder/note.md');
    const app = createServer({ roots: [root] });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/page',
      payload: { rootId: 'root-1', path: 'folder/note.md', frontmatter: '', body: '# Atomically written', etag },
    });

    expect(response.statusCode).toBe(200);
    expect(await readFile(path.join(root.path, 'folder', 'note.md'), 'utf8')).toBe('# Atomically written');
    expect((await readdir(path.join(root.path, 'folder'))).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    await app.close();
  });

  it('returns 400 for invalid YAML and leaves the file unchanged', async () => {
    const root = await makeVault('root-1');
    await writeFile(path.join(root.path, 'note.md'), '---\ntitle: Old\n---\n# Original');
    const etag = await currentEtag(root, 'note.md');
    const app = createServer({ roots: [root] });

    const response = await app.inject({
      method: 'PUT',
      url: '/api/page',
      payload: { rootId: 'root-1', path: 'note.md', frontmatter: 'title: [unterminated', body: '# Changed', etag },
    });

    expect(response.statusCode).toBe(400);
    expect(await readFile(path.join(root.path, 'note.md'), 'utf8')).toBe('---\ntitle: Old\n---\n# Original');
    await app.close();
  });
});
