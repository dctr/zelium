import type { Stats } from 'node:fs';

export function createFileEtag(stats: Pick<Stats, 'mtimeMs' | 'size'>): string {
  return `W/"${stats.size}-${stats.mtimeMs}"`;
}
