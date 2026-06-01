import { realpath } from 'node:fs/promises';
import path from 'node:path';

export type VaultRootConfig = {
  id: string;
  name: string;
  path: string;
};

type VaultEnv = Partial<Pick<NodeJS.ProcessEnv, 'VAULT_DIR' | 'VAULT_DIRS'>>;

export async function loadVaultRoots(env: VaultEnv = process.env): Promise<VaultRootConfig[]> {
  const rawRoots = splitConfiguredRoots(env);
  const seen = new Set<string>();
  const roots: VaultRootConfig[] = [];

  for (const rawRoot of rawRoots) {
    const resolved = await realpath(rawRoot);
    if (seen.has(resolved)) {
      continue;
    }

    seen.add(resolved);
    roots.push({
      id: `root-${roots.length + 1}`,
      name: path.basename(resolved),
      path: resolved,
    });
  }

  return roots;
}

function splitConfiguredRoots(env: VaultEnv): string[] {
  const raw = env.VAULT_DIRS?.trim() ? env.VAULT_DIRS : env.VAULT_DIR;
  const roots = raw
    ?.split(';')
    .map((root) => root.trim())
    .filter((root) => root.length > 0);

  if (!roots?.length) {
    throw new Error('Configure at least one vault root with VAULT_DIR or VAULT_DIRS.');
  }

  return roots;
}
