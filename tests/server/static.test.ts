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
    '<!doctype html><title>Zelium</title><main id="app">Zelium shell</main><script type="module" src="/assets/app.js"></script>',
  );
  await writeFile(path.join(dir, 'assets', 'app.js'), 'window.__zeliumLoaded = true;');
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
