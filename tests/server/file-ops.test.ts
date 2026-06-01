import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
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

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('vault file operations API', () => {
  it('POST /api/page creates a markdown page with optional frontmatter and body', async () => {
    const root = await makeVault('root-1');
    await mkdir(path.join(root.path, 'folder'));
    const app = createServer({ roots: [root] });

    const response = await app.inject({
      method: 'POST',
      url: '/api/page',
      payload: { rootId: 'root-1', path: 'folder/new.md', frontmatter: 'title: New', body: '# Body' },
    });

    expect(response.statusCode).toBe(201);
    expect(await readFile(path.join(root.path, 'folder', 'new.md'), 'utf8')).toBe('---\ntitle: New\n---\n\n# Body');
    expect(response.json()).toMatchObject({
      rootId: 'root-1',
      path: 'folder/new.md',
      markdown: '---\ntitle: New\n---\n\n# Body',
      frontmatter: 'title: New',
      body: '# Body',
      etag: expect.any(String),
    });
    await app.close();
  });

  it('POST /api/page refuses to overwrite an existing page', async () => {
    const root = await makeVault('root-1');
    await writeFile(path.join(root.path, 'note.md'), '# Existing');
    const app = createServer({ roots: [root] });

    const response = await app.inject({
      method: 'POST',
      url: '/api/page',
      payload: { rootId: 'root-1', path: 'note.md', body: '# Replacement' },
    });

    expect(response.statusCode).toBe(409);
    expect(await readFile(path.join(root.path, 'note.md'), 'utf8')).toBe('# Existing');
    await app.close();
  });

  it('POST /api/page returns 404 when the parent folder is missing', async () => {
    const root = await makeVault('root-1');
    const app = createServer({ roots: [root] });

    const response = await app.inject({
      method: 'POST',
      url: '/api/page',
      payload: { rootId: 'root-1', path: 'missing/new.md', body: '# New' },
    });

    expect(response.statusCode).toBe(404);
    await expect(stat(path.join(root.path, 'missing', 'new.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    await app.close();
  });

  it('POST /api/folder creates a folder', async () => {
    const root = await makeVault('root-1');
    const app = createServer({ roots: [root] });

    const response = await app.inject({
      method: 'POST',
      url: '/api/folder',
      payload: { rootId: 'root-1', path: 'projects' },
    });

    expect(response.statusCode).toBe(201);
    expect((await stat(path.join(root.path, 'projects'))).isDirectory()).toBe(true);
    expect(response.json()).toEqual({ rootId: 'root-1', path: 'projects', name: 'projects', kind: 'folder', children: [] });
    await app.close();
  });

  it('POST /api/folder refuses collisions with files and folders', async () => {
    const root = await makeVault('root-1');
    await mkdir(path.join(root.path, 'existing-folder'));
    await writeFile(path.join(root.path, 'existing-file'), 'content');
    const app = createServer({ roots: [root] });

    const folderCollision = await app.inject({
      method: 'POST',
      url: '/api/folder',
      payload: { rootId: 'root-1', path: 'existing-folder' },
    });
    const fileCollision = await app.inject({
      method: 'POST',
      url: '/api/folder',
      payload: { rootId: 'root-1', path: 'existing-file' },
    });

    expect(folderCollision.statusCode).toBe(409);
    expect(fileCollision.statusCode).toBe(409);
    await app.close();
  });

  it('PATCH /api/node renames a page', async () => {
    const root = await makeVault('root-1');
    await writeFile(path.join(root.path, 'old.md'), '# Old');
    const app = createServer({ roots: [root] });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/node',
      payload: { rootId: 'root-1', fromPath: 'old.md', toPath: 'new.md', kind: 'page' },
    });

    expect(response.statusCode).toBe(200);
    expect(await readFile(path.join(root.path, 'new.md'), 'utf8')).toBe('# Old');
    await expect(stat(path.join(root.path, 'old.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(response.json()).toEqual({ rootId: 'root-1', path: 'new.md', name: 'new.md', kind: 'page' });
    await app.close();
  });

  it('PATCH /api/node moves a page to another folder', async () => {
    const root = await makeVault('root-1');
    await mkdir(path.join(root.path, 'folder'));
    await mkdir(path.join(root.path, 'other'));
    await writeFile(path.join(root.path, 'folder', 'page.md'), '# Page');
    const app = createServer({ roots: [root] });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/node',
      payload: { rootId: 'root-1', fromPath: 'folder/page.md', toPath: 'other/page.md', kind: 'page' },
    });

    expect(response.statusCode).toBe(200);
    expect(await readFile(path.join(root.path, 'other', 'page.md'), 'utf8')).toBe('# Page');
    await expect(stat(path.join(root.path, 'folder', 'page.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    await app.close();
  });

  it('PATCH /api/node moves a folder with its children', async () => {
    const root = await makeVault('root-1');
    await mkdir(path.join(root.path, 'folder', 'child'), { recursive: true });
    await writeFile(path.join(root.path, 'folder', 'child', 'page.md'), '# Child');
    const app = createServer({ roots: [root] });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/node',
      payload: { rootId: 'root-1', fromPath: 'folder', toPath: 'moved', kind: 'folder' },
    });

    expect(response.statusCode).toBe(200);
    expect(await readFile(path.join(root.path, 'moved', 'child', 'page.md'), 'utf8')).toBe('# Child');
    await expect(stat(path.join(root.path, 'folder'))).rejects.toMatchObject({ code: 'ENOENT' });
    await app.close();
  });

  it('PATCH /api/node rejects cross-root moves for V1', async () => {
    const first = await makeVault('alpha');
    const second = await makeVault('beta');
    await writeFile(path.join(first.path, 'note.md'), '# Note');
    const app = createServer({ roots: [first, second] });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/node',
      payload: { rootId: 'alpha', toRootId: 'beta', fromPath: 'note.md', toPath: 'note.md', kind: 'page' },
    });

    expect(response.statusCode).toBe(400);
    expect(await readFile(path.join(first.path, 'note.md'), 'utf8')).toBe('# Note');
    await expect(stat(path.join(second.path, 'note.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    await app.close();
  });

  it('PATCH /api/node rejects destination collisions', async () => {
    const root = await makeVault('root-1');
    await writeFile(path.join(root.path, 'old.md'), '# Old');
    await writeFile(path.join(root.path, 'new.md'), '# New');
    const app = createServer({ roots: [root] });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/node',
      payload: { rootId: 'root-1', fromPath: 'old.md', toPath: 'new.md', kind: 'page' },
    });

    expect(response.statusCode).toBe(409);
    expect(await readFile(path.join(root.path, 'old.md'), 'utf8')).toBe('# Old');
    expect(await readFile(path.join(root.path, 'new.md'), 'utf8')).toBe('# New');
    await app.close();
  });

  it('PATCH /api/node rejects moving a folder into itself', async () => {
    const root = await makeVault('root-1');
    await mkdir(path.join(root.path, 'folder', 'child'), { recursive: true });
    const app = createServer({ roots: [root] });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/node',
      payload: { rootId: 'root-1', fromPath: 'folder', toPath: 'folder/child/moved', kind: 'folder' },
    });

    expect(response.statusCode).toBe(400);
    expect((await stat(path.join(root.path, 'folder', 'child'))).isDirectory()).toBe(true);
    await app.close();
  });

  it('DELETE /api/node deletes a page and leaves sibling pages untouched', async () => {
    const root = await makeVault('root-1');
    await writeFile(path.join(root.path, 'delete-me.md'), '# Delete');
    await writeFile(path.join(root.path, 'keep-me.md'), '# Keep');
    const app = createServer({ roots: [root] });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/node',
      payload: { rootId: 'root-1', path: 'delete-me.md', kind: 'page' },
    });

    expect(response.statusCode).toBe(204);
    await expect(stat(path.join(root.path, 'delete-me.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(path.join(root.path, 'keep-me.md'), 'utf8')).toBe('# Keep');
    await app.close();
  });

  it('DELETE /api/node deletes an empty folder', async () => {
    const root = await makeVault('root-1');
    await mkdir(path.join(root.path, 'empty'));
    const app = createServer({ roots: [root] });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/node',
      payload: { rootId: 'root-1', path: 'empty', kind: 'folder' },
    });

    expect(response.statusCode).toBe(204);
    await expect(stat(path.join(root.path, 'empty'))).rejects.toMatchObject({ code: 'ENOENT' });
    await app.close();
  });

  it('DELETE /api/node recursively deletes a non-empty folder without following symlink descendants outside the root', async () => {
    const root = await makeVault('root-1');
    const outside = await makeVault('outside');
    await mkdir(path.join(root.path, 'folder', 'child'), { recursive: true });
    await writeFile(path.join(root.path, 'folder', 'child', 'page.md'), '# Child');
    await writeFile(path.join(outside.path, 'external.md'), '# External');
    await symlink(path.join(outside.path, 'external.md'), path.join(root.path, 'folder', 'external.md'));
    const app = createServer({ roots: [root] });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/node',
      payload: { rootId: 'root-1', path: 'folder', kind: 'folder' },
    });

    expect(response.statusCode).toBe(204);
    await expect(stat(path.join(root.path, 'folder'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(path.join(outside.path, 'external.md'), 'utf8')).toBe('# External');
    await app.close();
  });

  it('DELETE /api/node rejects traversal and symlink escape targets', async () => {
    const root = await makeVault('root-1');
    const outside = await makeVault('outside');
    await writeFile(path.join(outside.path, 'external.md'), '# External');
    await symlink(path.join(outside.path, 'external.md'), path.join(root.path, 'escape.md'));
    const app = createServer({ roots: [root] });

    const traversal = await app.inject({
      method: 'DELETE',
      url: '/api/node',
      payload: { rootId: 'root-1', path: '../external.md', kind: 'page' },
    });
    const symlinkEscape = await app.inject({
      method: 'DELETE',
      url: '/api/node',
      payload: { rootId: 'root-1', path: 'escape.md', kind: 'page' },
    });

    expect(traversal.statusCode).toBe(400);
    expect(symlinkEscape.statusCode).toBe(400);
    expect(await readFile(path.join(outside.path, 'external.md'), 'utf8')).toBe('# External');
    await app.close();
  });

  it('DELETE /api/node returns 404 for a missing target', async () => {
    const root = await makeVault('root-1');
    const app = createServer({ roots: [root] });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/node',
      payload: { rootId: 'root-1', path: 'missing.md', kind: 'page' },
    });

    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
