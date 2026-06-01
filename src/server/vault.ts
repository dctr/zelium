import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { VaultRootConfig } from './config';
import { BadRequestError, ConflictError, NotFoundError } from './errors';
import { createFileEtag } from './etag';
import { joinMarkdown, splitFrontmatter, validateFrontmatter } from './frontmatter';
import type { VaultPathKind } from './paths';
import { resolveVaultPath } from './paths';

export type PublicVaultRoot = {
  id: string;
  name: string;
};

export type TreeNode = {
  rootId: string;
  path: string;
  name: string;
  kind: 'folder' | 'page';
  children?: TreeNode[];
};

export type PageDocument = {
  rootId: string;
  path: string;
  markdown: string;
  frontmatter: string;
  body: string;
  etag: string;
};

export type SavePageInput = {
  path: string;
  frontmatter: string;
  body: string;
  etag: string;
};

export type CreatePageInput = {
  path: string;
  frontmatter?: string;
  body?: string;
};

export type CreateFolderInput = {
  path: string;
};

export type MoveNodeInput = {
  fromPath: string;
  toPath: string;
  kind: VaultPathKind;
};

export type DeleteNodeInput = {
  path: string;
  kind: VaultPathKind;
};

export function publicVaultRoots(roots: VaultRootConfig[]): PublicVaultRoot[] {
  return roots.map(({ id, name }) => ({ id, name }));
}

export function findVaultRoot(roots: VaultRootConfig[], rootId: string): VaultRootConfig | undefined {
  return roots.find((root) => root.id === rootId);
}

export async function scanVaultTree(root: VaultRootConfig): Promise<TreeNode[]> {
  return scanDirectory(root, root.path, '');
}

export async function readPageDocument(root: VaultRootConfig, pagePath: string): Promise<PageDocument> {
  const absolutePath = await resolveExistingPagePath(root, pagePath);
  return readResolvedPageDocument(root, pagePath, absolutePath);
}

export async function savePageDocument(root: VaultRootConfig, input: SavePageInput): Promise<PageDocument> {
  const validation = validateFrontmatter(input.frontmatter);
  if (!validation.ok) {
    throw new BadRequestError(`Invalid YAML frontmatter: ${validation.error}`);
  }

  const absolutePath = await resolveExistingPagePath(root, input.path);
  return withPageSaveLock(absolutePath, async () => {
    const stats = await stat(absolutePath);
    if (!stats.isFile()) {
      throw new NotFoundError('Page not found.');
    }

    const currentEtag = createFileEtag(stats);
    if (input.etag !== currentEtag) {
      throw new ConflictError('Page has changed since it was loaded.');
    }

    await writeFileAtomically(absolutePath, joinMarkdown(input.frontmatter, input.body));
    return readResolvedPageDocument(root, input.path, absolutePath);
  });
}

export async function createPage(root: VaultRootConfig, input: CreatePageInput): Promise<PageDocument> {
  const frontmatter = input.frontmatter ?? '';
  const body = input.body ?? '';
  const validation = validateFrontmatter(frontmatter);
  if (!validation.ok) {
    throw new BadRequestError(`Invalid YAML frontmatter: ${validation.error}`);
  }

  const absolutePath = await resolveNewNodePath(root, input.path, 'page');
  if (await pathExists(absolutePath)) {
    throw new ConflictError('Page already exists.');
  }

  try {
    await writeFile(absolutePath, joinMarkdown(frontmatter, body), { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (isFileAlreadyExistsError(error)) {
      throw new ConflictError('Page already exists.');
    }
    if (isParentNotFoundError(error)) {
      throw new NotFoundError('Parent folder not found.');
    }
    throw error;
  }

  return readResolvedPageDocument(root, input.path, absolutePath);
}

export async function createFolder(root: VaultRootConfig, input: CreateFolderInput): Promise<TreeNode> {
  const absolutePath = await resolveNewNodePath(root, input.path, 'folder');
  if (await pathExists(absolutePath)) {
    throw new ConflictError('Folder already exists.');
  }

  try {
    await mkdir(absolutePath);
  } catch (error) {
    if (isFileAlreadyExistsError(error)) {
      throw new ConflictError('Folder already exists.');
    }
    if (isParentNotFoundError(error)) {
      throw new NotFoundError('Parent folder not found.');
    }
    throw error;
  }

  return folderTreeNode(root, input.path, []);
}

export async function moveVaultNode(root: VaultRootConfig, input: MoveNodeInput): Promise<TreeNode> {
  const sourcePath = await resolveExistingNodePath(root, input.fromPath, input.kind);
  await assertNodeKind(sourcePath, input.kind);

  const destinationPath = await resolveNewNodePath(root, input.toPath, input.kind);
  if (await pathExists(destinationPath)) {
    throw new ConflictError('Destination already exists.');
  }

  if (input.kind === 'folder') {
    assertFolderMoveIsNotSelfNested(sourcePath, destinationPath);
  }

  try {
    await rename(sourcePath, destinationPath);
  } catch (error) {
    if (isFileAlreadyExistsError(error)) {
      throw new ConflictError('Destination already exists.');
    }
    if (isParentNotFoundError(error)) {
      throw new NotFoundError('Destination parent folder not found.');
    }
    throw error;
  }

  if (input.kind === 'folder') {
    return folderTreeNode(root, input.toPath, await scanDirectory(root, destinationPath, input.toPath));
  }

  return pageTreeNode(root, input.toPath);
}

export async function deleteVaultNode(root: VaultRootConfig, input: DeleteNodeInput): Promise<void> {
  const absolutePath = await resolveExistingNodePath(root, input.path, input.kind);
  await assertNodeKind(absolutePath, input.kind);

  try {
    await rm(absolutePath, { recursive: input.kind === 'folder' });
  } catch (error) {
    if (isFileNotFoundError(error)) {
      throw new NotFoundError(`${nodeKindLabel(input.kind)} not found.`);
    }
    throw error;
  }
}

const pageSaveLocks = new Map<string, Promise<void>>();

async function withPageSaveLock<T>(absolutePath: string, operation: () => Promise<T>): Promise<T> {
  const previous = pageSaveLocks.get(absolutePath) ?? Promise.resolve();
  let release: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  pageSaveLocks.set(absolutePath, current);
  await previous;

  try {
    return await operation();
  } finally {
    release!();
    if (pageSaveLocks.get(absolutePath) === current) {
      pageSaveLocks.delete(absolutePath);
    }
  }
}

async function readResolvedPageDocument(root: VaultRootConfig, pagePath: string, absolutePath: string): Promise<PageDocument> {
  const stats = await stat(absolutePath);
  if (!stats.isFile()) {
    throw new NotFoundError('Page not found.');
  }

  const markdown = await readFile(absolutePath, 'utf8');
  const { frontmatter, body } = splitFrontmatter(markdown);

  return {
    rootId: root.id,
    path: pagePath,
    markdown,
    frontmatter,
    body,
    etag: createFileEtag(stats),
  };
}

async function resolveExistingPagePath(root: VaultRootConfig, pagePath: string): Promise<string> {
  try {
    return await resolveVaultPath({ root: root.path, path: pagePath, kind: 'page' });
  } catch (error) {
    if (isFileNotFoundError(error)) {
      throw new NotFoundError('Page not found.');
    }

    throw new BadRequestError(error instanceof Error ? error.message : 'Invalid vault path.');
  }
}

async function resolveExistingNodePath(root: VaultRootConfig, nodePath: string, kind: VaultPathKind): Promise<string> {
  try {
    return await resolveVaultPath({ root: root.path, path: nodePath, kind });
  } catch (error) {
    if (isFileNotFoundError(error)) {
      throw new NotFoundError(`${nodeKindLabel(kind)} not found.`);
    }

    throw new BadRequestError(error instanceof Error ? error.message : 'Invalid vault path.');
  }
}

async function resolveNewNodePath(root: VaultRootConfig, nodePath: string, kind: VaultPathKind): Promise<string> {
  try {
    return await resolveVaultPath({ root: root.path, path: nodePath, kind, mustExist: false });
  } catch (error) {
    if (isFileNotFoundError(error)) {
      throw new NotFoundError('Parent folder not found.');
    }

    throw new BadRequestError(error instanceof Error ? error.message : 'Invalid vault path.');
  }
}

async function writeFileAtomically(targetPath: string, contents: string): Promise<void> {
  const tempPath = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`);

  await writeFile(tempPath, contents, { encoding: 'utf8', flag: 'wx' });
  try {
    await rename(tempPath, targetPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

async function scanDirectory(root: VaultRootConfig, absoluteDir: string, relativeDir: string): Promise<TreeNode[]> {
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const folders: TreeNode[] = [];
  const pages: TreeNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const relativePath = relativeDir ? path.posix.join(relativeDir, entry.name) : entry.name;
    const absolutePath = path.join(absoluteDir, entry.name);

    if (entry.isDirectory()) {
      folders.push({
        rootId: root.id,
        path: relativePath,
        name: entry.name,
        kind: 'folder',
        children: await scanDirectory(root, absolutePath, relativePath),
      });
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      pages.push({ rootId: root.id, path: relativePath, name: entry.name, kind: 'page' });
    }
  }

  return [...sortByName(folders), ...sortByName(pages)];
}

function sortByName<T extends { name: string }>(nodes: T[]): T[] {
  return nodes.sort((left, right) => left.name.localeCompare(right.name));
}

async function pathExists(absolutePath: string): Promise<boolean> {
  try {
    await lstat(absolutePath);
    return true;
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}

async function assertNodeKind(absolutePath: string, kind: VaultPathKind): Promise<void> {
  const stats = await stat(absolutePath);
  if (kind === 'page' && !stats.isFile()) {
    throw new NotFoundError('Page not found.');
  }
  if (kind === 'folder' && !stats.isDirectory()) {
    throw new NotFoundError('Folder not found.');
  }
}

function assertFolderMoveIsNotSelfNested(sourcePath: string, destinationPath: string): void {
  const relative = path.relative(sourcePath, destinationPath);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new BadRequestError('Cannot move a folder into itself.');
  }
}

function pageTreeNode(root: VaultRootConfig, pagePath: string): TreeNode {
  return { rootId: root.id, path: pagePath, name: path.posix.basename(pagePath), kind: 'page' };
}

function folderTreeNode(root: VaultRootConfig, folderPath: string, children: TreeNode[]): TreeNode {
  return { rootId: root.id, path: folderPath, name: path.posix.basename(folderPath), kind: 'folder', children };
}

function nodeKindLabel(kind: VaultPathKind): string {
  return kind === 'page' ? 'Page' : 'Folder';
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function isFileAlreadyExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}

function isParentNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}
