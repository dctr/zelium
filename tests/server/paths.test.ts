import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveVaultPath } from '../../src/server/paths';

const tempDirs: string[] = [];

async function makeVault() {
  const dir = await mkdtemp(path.join(tmpdir(), 'zelium-paths-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('resolveVaultPath', () => {
  it('accepts a page path under the vault root', async () => {
    const root = await makeVault();
    await mkdir(path.join(root, 'folder'));
    await writeFile(path.join(root, 'folder', 'page.md'), '# Page');

    await expect(resolveVaultPath({ root, path: 'folder/page.md', kind: 'page' })).resolves.toBe(
      await realpath(path.join(root, 'folder', 'page.md')),
    );
  });

  it.each(['/etc/passwd', '../secret.md', 'folder/../../secret.md', 'C:\\secret.md', '', 'folder/\0page.md'])(
    'rejects unsafe relative path %s',
    async (unsafePath) => {
      const root = await makeVault();

      await expect(resolveVaultPath({ root, path: unsafePath, kind: 'page' })).rejects.toThrow(/Invalid vault path/);
    },
  );

  it('rejects existing symlinks that point outside the vault root', async () => {
    const root = await makeVault();
    const outside = await makeVault();
    const externalPage = path.join(outside, 'external.md');
    await writeFile(externalPage, '# External');
    await symlink(externalPage, path.join(root, 'escape.md'));

    await expect(resolveVaultPath({ root, path: 'escape.md', kind: 'page' })).rejects.toThrow(/escapes vault root/);
  });

  it('allows creating a missing page when its existing parent stays inside the root', async () => {
    const root = await makeVault();
    await mkdir(path.join(root, 'folder'));

    await expect(
      resolveVaultPath({ root, path: 'folder/new.md', kind: 'page', mustExist: false }),
    ).resolves.toBe(path.join(await realpath(path.join(root, 'folder')), 'new.md'));
  });

  it('rejects creating a missing page when its parent symlink escapes the root', async () => {
    const root = await makeVault();
    const outside = await makeVault();
    await symlink(outside, path.join(root, 'linked'));

    await expect(
      resolveVaultPath({ root, path: 'linked/new.md', kind: 'page', mustExist: false }),
    ).rejects.toThrow(/escapes vault root/);
  });

  it('requires page paths to end in .md', async () => {
    const root = await makeVault();
    await writeFile(path.join(root, 'note.txt'), 'not markdown');

    await expect(resolveVaultPath({ root, path: 'note.txt', kind: 'page' })).rejects.toThrow(/Page paths must end in \.md/);
  });

  it('rejects folder paths that end in .md', async () => {
    const root = await makeVault();

    await expect(resolveVaultPath({ root, path: 'folder.md', kind: 'folder', mustExist: false })).rejects.toThrow(
      /Folder paths must not end in \.md/,
    );
  });
});
