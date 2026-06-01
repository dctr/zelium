import { realpath } from 'node:fs/promises';
import path from 'node:path';

export type VaultPathKind = 'page' | 'folder';

export type ResolveVaultPathOptions = {
  root: string;
  path: string;
  kind: VaultPathKind;
  mustExist?: boolean;
};

export async function resolveVaultPath(options: ResolveVaultPathOptions): Promise<string> {
  const segments = validateRelativePath(options.path, options.kind);
  const root = await realpath(options.root);
  const candidate = path.resolve(root, ...segments);
  const mustExist = options.mustExist ?? true;

  if (mustExist) {
    const resolvedTarget = await realpath(candidate);
    assertInsideRoot(root, resolvedTarget);
    return resolvedTarget;
  }

  const parent = segments.length === 1 ? root : path.resolve(root, ...segments.slice(0, -1));
  const resolvedParent = await realpath(parent);
  assertInsideRoot(root, resolvedParent);
  const resolvedTarget = path.join(resolvedParent, segments.at(-1)!);
  assertInsideRoot(root, resolvedTarget);
  return resolvedTarget;
}

function validateRelativePath(relativePath: string, kind: VaultPathKind): string[] {
  if (!relativePath || relativePath.includes('\0')) {
    throw new Error('Invalid vault path: path must not be empty or contain NUL bytes.');
  }

  if (relativePath.includes('\\') || path.posix.isAbsolute(relativePath) || /^[A-Za-z]:/.test(relativePath)) {
    throw new Error('Invalid vault path: only POSIX-style vault-relative paths are allowed.');
  }

  const segments = relativePath.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error('Invalid vault path: empty, current-directory, and parent-directory segments are forbidden.');
  }

  if (kind === 'page' && !relativePath.endsWith('.md')) {
    throw new Error('Page paths must end in .md.');
  }

  if (kind === 'folder' && relativePath.endsWith('.md')) {
    throw new Error('Folder paths must not end in .md.');
  }

  return segments;
}

function assertInsideRoot(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return;
  }

  throw new Error('Resolved path escapes vault root.');
}
