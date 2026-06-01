import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadVaultRoots } from '../../src/server/config';

const tempDirs: string[] = [];

async function makeRoot(name: string) {
  const dir = await mkdtemp(path.join(tmpdir(), `zelium-${name}-`));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('loadVaultRoots', () => {
  it('loads a single VAULT_DIR root', async () => {
    const root = await makeRoot('single');

    await expect(loadVaultRoots({ VAULT_DIR: root })).resolves.toEqual([
      { id: 'root-1', name: path.basename(root), path: await realpath(root) },
    ]);
  });

  it('loads semicolon-separated VAULT_DIRS roots', async () => {
    const first = await makeRoot('first');
    const second = await makeRoot('second');

    const roots = await loadVaultRoots({ VAULT_DIRS: `${first};${second}` });

    expect(roots).toEqual([
      { id: 'root-1', name: path.basename(first), path: await realpath(first) },
      { id: 'root-2', name: path.basename(second), path: await realpath(second) },
    ]);
  });

  it('prefers VAULT_DIRS over VAULT_DIR', async () => {
    const ignored = await makeRoot('ignored');
    const selected = await makeRoot('selected');

    const roots = await loadVaultRoots({ VAULT_DIR: ignored, VAULT_DIRS: selected });

    expect(roots).toHaveLength(1);
    expect(roots[0].path).toBe(await realpath(selected));
  });

  it('throws a clear startup error when no vault root is configured', async () => {
    await expect(loadVaultRoots({})).rejects.toThrow(/VAULT_DIR or VAULT_DIRS/);
  });

  it('de-duplicates roots after realpath resolution', async () => {
    const root = await makeRoot('dedupe');
    const link = path.join(tmpdir(), `zelium-root-link-${Date.now()}`);
    tempDirs.push(link);
    await symlink(root, link, 'dir');

    const roots = await loadVaultRoots({ VAULT_DIRS: `${root};${link}` });

    expect(roots).toEqual([{ id: 'root-1', name: path.basename(root), path: await realpath(root) }]);
  });
});
