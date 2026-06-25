import { readFile } from 'node:fs/promises';
import path from 'node:path';

import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';

import { registerVaultApi } from './api';
import { loadVaultRoots, type VaultRootConfig } from './config';

export type CreateServerOptions = {
  roots?: VaultRootConfig[];
  staticDir?: string;
};

export function createServer(options: CreateServerOptions = {}) {
  const app = Fastify({ logger: false });
  const roots = options.roots ?? [];

  app.get('/api/health', async () => ({ ok: true }));
  registerVaultApi(app, roots);
  if (options.staticDir) registerStaticRoutes(app, options.staticDir);

  return app;
}

function registerStaticRoutes(app: FastifyInstance, staticDir: string): void {
  const root = path.resolve(staticDir);

  app.get('/*', async (request, reply) => {
    const url = new URL(request.url, 'http://zelium.local');
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Not Found' });
    }

    return sendStaticAsset(root, url.pathname, request.headers.accept, reply);
  });
}

type StaticPathResult =
  | { ok: true; path: string }
  | { ok: false; statusCode: number; error: string };

async function sendStaticAsset(root: string, pathname: string, accept: string | string[] | undefined, reply: FastifyReply) {
  const asset = resolveStaticPath(root, pathname);
  if (!asset.ok) {
    return reply.code(asset.statusCode).send({ error: asset.error });
  }

  const file = await readStaticFile(asset.path);
  if (file.ok) {
    const contentType = contentTypeFor(asset.path);
    return reply.type(contentType).send(serializeStaticBody(file.body, contentType));
  }

  if (file.notFound && shouldServeIndexFallback(pathname, accept)) {
    const index = await readStaticFile(path.join(root, 'index.html'));
    if (index.ok) {
      return reply.type('text/html; charset=utf-8').send(index.body);
    }
  }

  return reply.code(file.notFound ? 404 : 500).send({ error: file.notFound ? 'Not Found' : 'Failed to read static asset' });
}

function resolveStaticPath(root: string, pathname: string): StaticPathResult {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { ok: false, statusCode: 400, error: 'Malformed asset path' };
  }

  const trimmed = decoded.replace(/^\/+/, '');
  const relativePath = path.posix.normalize(trimmed || 'index.html');
  if (relativePath === '..' || relativePath.startsWith('../') || path.posix.isAbsolute(relativePath)) {
    return { ok: false, statusCode: 403, error: 'Asset path escapes static root' };
  }

  const assetPath = path.resolve(root, ...relativePath.split('/'));
  if (!isUnderRoot(root, assetPath)) {
    return { ok: false, statusCode: 403, error: 'Asset path escapes static root' };
  }

  return { ok: true, path: assetPath };
}

type StaticReadResult =
  | { ok: true; body: Buffer }
  | { ok: false; notFound: boolean };

async function readStaticFile(filePath: string): Promise<StaticReadResult> {
  try {
    return { ok: true, body: await readFile(filePath) };
  } catch (error) {
    return { ok: false, notFound: isNotFoundLikeError(error) };
  }
}

function shouldServeIndexFallback(pathname: string, accept: string | string[] | undefined): boolean {
  const decoded = safeDecode(pathname) ?? pathname;
  if (path.posix.extname(decoded)) return false;

  const accepted = Array.isArray(accept) ? accept.join(',') : (accept ?? '');
  return accepted === '' || accepted.includes('text/html') || accepted.includes('*/*');
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function isUnderRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isNotFoundLikeError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && ['ENOENT', 'ENOTDIR', 'EISDIR'].includes(String(error.code));
}

function serializeStaticBody(body: Buffer, contentType: string): Buffer | string {
  return isTextStaticType(contentType) ? body.toString('utf8') : body;
}

function isTextStaticType(contentType: string): boolean {
  return (
    contentType.startsWith('text/') ||
    contentType.includes('json') ||
    contentType.includes('javascript') ||
    contentType.includes('svg+xml')
  );
}

function contentTypeFor(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.webmanifest':
      return 'application/manifest+json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.ico':
      return 'image/x-icon';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    case '.txt':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  const staticDir = path.resolve(process.cwd(), 'dist');

  loadVaultRoots()
    .then((roots) => createServer({ roots, staticDir }).listen({ port, host }))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
