# Zelium deployment

Zelium V1 is a single Fastify process that serves both the built Svelte UI and the vault API.

## Build and run

```bash
npm ci
npm run build
HOST=127.0.0.1 PORT=3000 VAULT_DIR=/srv/zelium/vault npm start
```

Open `http://127.0.0.1:3000` locally, or put a reverse proxy in front of it.

## Vault configuration

Use one root:

```bash
VAULT_DIR=/srv/zelium/vault npm start
```

Use multiple roots with semicolons:

```bash
VAULT_DIRS="/srv/zelium/work;/srv/zelium/personal" npm start
```

If `VAULT_DIRS` is set, it takes precedence over `VAULT_DIR`. Paths are resolved with `realpath`; duplicate roots are de-duplicated after resolution.

## Development commands

```bash
# API/backend on http://127.0.0.1:3000
HOST=127.0.0.1 PORT=3000 VAULT_DIR=tests/fixtures/vault-a npm start

# UI dev server on http://127.0.0.1:5173
npm run dev
```

The Vite dev server proxies `/api` requests to `http://127.0.0.1:3000`.

## Authentication boundary

Zelium V1 has no built-in authentication or authorisation. It trusts any HTTP client that can reach it. Bind the backend to loopback and require authentication at Caddy or another reverse proxy. Do not expose `npm start` directly to the public internet.

Generate a Caddy password hash:

```bash
caddy hash-password
```

Caddy example:

```caddyfile
zelium.example.com {
    basicauth {
        user <caddy-hashed-password>
    }

    reverse_proxy 127.0.0.1:3000
}
```

The `<caddy-hashed-password>` placeholder must be a hash produced by Caddy, not a plaintext password.

## Verification

```bash
npm run test
npm run build
npm run test:e2e:prod
```

The automated tests use fixture vaults under `tests/fixtures`. The final live Codex smoke test described in the V1 plan is explicitly read-only against `~/.hermes/codex`; do not type into the editor or save while using that live vault.
