import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createServer } from '../../src/server/index';

const tempDirs: string[] = [];

async function makeStaticDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'zelium-static-'));
  tempDirs.push(dir);
  await mkdir(path.join(dir, 'assets'), { recursive: true });
  await writeFile(
    path.join(dir, 'index.html'),
    '<!doctype html><title>Zelium</title><link rel="manifest" href="/manifest.webmanifest"><main id="app">Zelium shell</main><script type="module" src="/assets/app.js"></script>',
  );
  await writeFile(path.join(dir, 'assets', 'app.js'), 'window.__zeliumLoaded = true;');
  await writeFile(path.join(dir, 'manifest.webmanifest'), '{"name":"Zelium","display":"standalone"}');
  await writeFile(path.join(dir, 'sw.js'), 'self.addEventListener("fetch", () => {});');
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createServerWithStatic() {
  return createServer({ roots: [], staticDir: await makeStaticDir() });
}

describe('production static serving', () => {
  it('serves the built client index at / while keeping /api/health as JSON', async () => {
    const app = await createServerWithStatic();

    const home = await app.inject({ method: 'GET', url: '/' });
    const health = await app.inject({ method: 'GET', url: '/api/health' });

    expect(home.statusCode).toBe(200);
    expect(home.headers['content-type']).toContain('text/html');
    expect(home.body).toContain('Zelium shell');
    expect(health.statusCode).toBe(200);
    expect(health.headers['content-type']).toContain('application/json');
    expect(health.json()).toEqual({ ok: true });

    await app.close();
  });

  it('serves built asset files instead of the SPA fallback', async () => {
    const app = await createServerWithStatic();

    const response = await app.inject({ method: 'GET', url: '/assets/app.js' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/javascript');
    expect(response.body).toContain('__zeliumLoaded');

    await app.close();
  });

  it('serves PWA manifest and service worker assets with installable content types', async () => {
    const app = await createServerWithStatic();

    const manifest = await app.inject({ method: 'GET', url: '/manifest.webmanifest' });
    const serviceWorker = await app.inject({ method: 'GET', url: '/sw.js' });

    expect(manifest.statusCode).toBe(200);
    expect(manifest.headers['content-type']).toContain('application/manifest+json');
    expect(JSON.parse(manifest.body)).toMatchObject({ name: 'Zelium', display: 'standalone' });
    expect(serviceWorker.statusCode).toBe(200);
    expect(serviceWorker.headers['content-type']).toContain('text/javascript');
    expect(serviceWorker.body).toContain('fetch');

    await app.close();
  });

  it('falls unknown client routes back to index.html', async () => {
    const app = await createServerWithStatic();

    const response = await app.inject({ method: 'GET', url: '/notes/INDEX', headers: { accept: 'text/html' } });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('Zelium shell');

    await app.close();
  });

  it('does not serve the SPA index for unknown API routes', async () => {
    const app = await createServerWithStatic();

    const response = await app.inject({ method: 'GET', url: '/api/missing' });

    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('Zelium shell');

    await app.close();
  });
});
