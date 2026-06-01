import type { FastifyInstance, FastifyReply } from 'fastify';

import type { VaultRootConfig } from './config';
import { messageForError, statusCodeForError } from './errors';
import {
  createFolder,
  createPage,
  deleteVaultNode,
  findVaultRoot,
  moveVaultNode,
  publicVaultRoots,
  readPageDocument,
  savePageDocument,
  scanVaultTree,
} from './vault';

export function registerVaultApi(app: FastifyInstance, roots: VaultRootConfig[]): void {
  app.get('/api/vaults', async () => publicVaultRoots(roots));

  app.get('/api/tree', async (request, reply) => {
    const root = getRootById(roots, (request.query as { rootId?: string }).rootId);
    if (!root.ok) {
      return reply.code(root.statusCode).send({ error: root.error });
    }

    return scanVaultTree(root.value);
  });

  app.get('/api/page', async (request, reply) => {
    const root = getRootById(roots, (request.query as { rootId?: string }).rootId);
    if (!root.ok) {
      return reply.code(root.statusCode).send({ error: root.error });
    }

    const { path } = request.query as { path?: string };
    if (!path) {
      return reply.code(400).send({ error: 'path is required' });
    }

    try {
      return await readPageDocument(root.value, path);
    } catch (error) {
      return sendKnownError(reply, error);
    }
  });

  app.put('/api/page', async (request, reply) => {
    const body = request.body as Partial<{
      rootId: string;
      path: string;
      frontmatter: string;
      body: string;
      etag: string;
    }> | null;

    const root = getRootById(roots, body?.rootId);
    if (!root.ok) {
      return reply.code(root.statusCode).send({ error: root.error });
    }

    if (typeof body?.path !== 'string') {
      return reply.code(400).send({ error: 'path is required' });
    }
    if (typeof body.frontmatter !== 'string') {
      return reply.code(400).send({ error: 'frontmatter is required' });
    }
    if (typeof body.body !== 'string') {
      return reply.code(400).send({ error: 'body is required' });
    }
    if (typeof body.etag !== 'string' || body.etag.length === 0) {
      return reply.code(400).send({ error: 'A matching etag is required' });
    }

    try {
      return await savePageDocument(root.value, {
        path: body.path,
        frontmatter: body.frontmatter,
        body: body.body,
        etag: body.etag,
      });
    } catch (error) {
      return sendKnownError(reply, error);
    }
  });

  app.post('/api/page', async (request, reply) => {
    const body = request.body as Partial<{
      rootId: string;
      path: string;
      frontmatter: string;
      body: string;
    }> | null;

    const root = getRootById(roots, body?.rootId);
    if (!root.ok) {
      return reply.code(root.statusCode).send({ error: root.error });
    }

    if (typeof body?.path !== 'string') {
      return reply.code(400).send({ error: 'path is required' });
    }
    if (body.frontmatter !== undefined && typeof body.frontmatter !== 'string') {
      return reply.code(400).send({ error: 'frontmatter must be a string' });
    }
    if (body.body !== undefined && typeof body.body !== 'string') {
      return reply.code(400).send({ error: 'body must be a string' });
    }

    try {
      const created = await createPage(root.value, {
        path: body.path,
        frontmatter: body.frontmatter,
        body: body.body,
      });
      return reply.code(201).send(created);
    } catch (error) {
      return sendKnownError(reply, error);
    }
  });

  app.post('/api/folder', async (request, reply) => {
    const body = request.body as Partial<{
      rootId: string;
      path: string;
    }> | null;

    const root = getRootById(roots, body?.rootId);
    if (!root.ok) {
      return reply.code(root.statusCode).send({ error: root.error });
    }

    if (typeof body?.path !== 'string') {
      return reply.code(400).send({ error: 'path is required' });
    }

    try {
      const created = await createFolder(root.value, { path: body.path });
      return reply.code(201).send(created);
    } catch (error) {
      return sendKnownError(reply, error);
    }
  });

  app.patch('/api/node', async (request, reply) => {
    const body = request.body as Partial<{
      rootId: string;
      toRootId: string;
      fromPath: string;
      toPath: string;
      kind: string;
    }> | null;

    const root = getRootById(roots, body?.rootId);
    if (!root.ok) {
      return reply.code(root.statusCode).send({ error: root.error });
    }

    if (body?.toRootId !== undefined && body.toRootId !== body.rootId) {
      return reply.code(400).send({ error: 'Cross-root moves are not supported' });
    }
    if (typeof body?.fromPath !== 'string') {
      return reply.code(400).send({ error: 'fromPath is required' });
    }
    if (typeof body.toPath !== 'string') {
      return reply.code(400).send({ error: 'toPath is required' });
    }
    if (!isNodeKind(body.kind)) {
      return reply.code(400).send({ error: 'kind must be page or folder' });
    }

    try {
      return await moveVaultNode(root.value, { fromPath: body.fromPath, toPath: body.toPath, kind: body.kind });
    } catch (error) {
      return sendKnownError(reply, error);
    }
  });

  app.delete('/api/node', async (request, reply) => {
    const body = request.body as Partial<{
      rootId: string;
      path: string;
      kind: string;
    }> | null;

    const root = getRootById(roots, body?.rootId);
    if (!root.ok) {
      return reply.code(root.statusCode).send({ error: root.error });
    }

    if (typeof body?.path !== 'string') {
      return reply.code(400).send({ error: 'path is required' });
    }
    if (!isNodeKind(body.kind)) {
      return reply.code(400).send({ error: 'kind must be page or folder' });
    }

    try {
      await deleteVaultNode(root.value, { path: body.path, kind: body.kind });
      return reply.code(204).send();
    } catch (error) {
      return sendKnownError(reply, error);
    }
  });
}

type RootLookup =
  | { ok: true; value: VaultRootConfig }
  | { ok: false; statusCode: number; error: string };

function getRootById(roots: VaultRootConfig[], rootId: string | undefined): RootLookup {
  if (!rootId) {
    return { ok: false, statusCode: 400, error: 'rootId is required' };
  }

  const root = findVaultRoot(roots, rootId);
  if (!root) {
    return { ok: false, statusCode: 404, error: 'Vault root not found' };
  }

  return { ok: true, value: root };
}

function isNodeKind(kind: unknown): kind is 'page' | 'folder' {
  return kind === 'page' || kind === 'folder';
}

function sendKnownError(reply: FastifyReply, error: unknown) {
  const statusCode = statusCodeForError(error) ?? 500;
  return reply.code(statusCode).send({ error: messageForError(error) });
}
