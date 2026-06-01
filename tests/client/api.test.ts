import { describe, expect, it, vi } from 'vitest';

import { ApiError, createVaultApi, isConflictError } from '../../src/client/lib/api';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('typed vault API client', () => {
  it('encodes root and page path query parameters when loading a page', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        rootId: 'root 1',
        path: 'folder/page name.md',
        markdown: '# Page',
        frontmatter: '',
        body: '# Page',
        etag: 'W/"1-1"',
      }),
    );
    const api = createVaultApi({ fetch: fetchMock });

    await api.getPage('root 1', 'folder/page name.md');

    expect(fetchMock).toHaveBeenCalledWith('/api/page?rootId=root+1&path=folder%2Fpage+name.md', undefined);
  });

  it('throws a typed ApiError with status and server message for non-2xx responses', async () => {
    const api = createVaultApi({ fetch: async () => jsonResponse(400, { error: 'path is required' }) });

    await expect(api.getPage('root-1', '')).rejects.toMatchObject({
      status: 400,
      message: 'path is required',
    });
    await expect(api.getPage('root-1', '')).rejects.toBeInstanceOf(ApiError);
  });

  it('marks 409 ApiError instances as conflicts for conflict UI', async () => {
    const api = createVaultApi({ fetch: async () => jsonResponse(409, { error: 'Page has changed since it was loaded.' }) });

    await expect(
      api.savePage({ rootId: 'root-1', path: 'note.md', frontmatter: '', body: '# Changed', etag: 'stale' }),
    ).rejects.toSatisfy((error: unknown) => error instanceof ApiError && isConflictError(error));
  });
});
