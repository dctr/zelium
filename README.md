# Zelium

Zelium is a self-hostable personal knowledge base and note-taking app for Markdown vaults.

## Version 1 scope

- Web UI only.
- One or more Markdown root folders passed at startup with `VAULT_DIR` or semicolon-separated `VAULT_DIRS`.
- No in-app authentication. Put Zelium behind Caddy HTTP Basic Auth or another trusted reverse proxy.
- Markdown files remain the only content storage format.
- YAML frontmatter is shown as a collapsed, editable block.
- Page editing autosaves as you type.
- File operations: create, rename, move, delete pages and folders.

## Quick start

```bash
npm install
npm run build
HOST=127.0.0.1 PORT=3000 VAULT_DIR=/path/to/markdown-vault npm start
```

Open `http://127.0.0.1:3000`.

Multiple vault roots:

```bash
HOST=127.0.0.1 PORT=3000 VAULT_DIRS="/path/to/vault-a;/path/to/vault-b" npm start
```

`VAULT_DIRS` wins over `VAULT_DIR` when both are set.

## Development

Run the API/static backend and the Vite UI dev server separately:

```bash
# terminal 1: vault API on http://127.0.0.1:3000
HOST=127.0.0.1 PORT=3000 VAULT_DIR=tests/fixtures/vault-a npm start

# terminal 2: Vite UI on http://127.0.0.1:5173
npm run dev
```

The Vite dev server proxies `/api` to `http://127.0.0.1:3000`.

## Production

`npm run build && npm start` serves the built Svelte UI and the vault API from the Fastify backend. Bind it to loopback and put authentication in front of it:

```bash
npm run build
HOST=127.0.0.1 PORT=3000 VAULT_DIR=/srv/zelium/vault npm start
```

Zelium V1 has no built-in authentication. Never expose it directly to the public internet.

See `docs/deployment.md` for Caddy Basic Auth deployment notes.

## Tests

```bash
npm run test:unit
npm run test:e2e
npm run test
npm run build
npm run test:e2e:prod
```

Tests use fixture vaults under `tests/fixtures`. The final live Codex smoke test, when run, must be read-only against `~/.hermes/codex`.

## Architecture

Version 1 uses a TypeScript/Svelte web client and a small TypeScript Fastify server. The client/server boundary is deliberately thin so a future Tauri mobile/desktop shell can reuse the same UI and replace the HTTP vault adapter with local filesystem commands without Electron.

See `docs/plans/2026-05-31-zelium-v1.md`.
