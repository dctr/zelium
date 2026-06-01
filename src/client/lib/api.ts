import type {
  CreateFolderRequest,
  CreatePageRequest,
  DeleteNodeRequest,
  MoveNodeRequest,
  PageDocument,
  SavePageRequest,
  TreeNode,
  VaultRoot,
} from './types';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type CreateVaultApiOptions = {
  baseUrl?: string;
  fetch?: FetchLike;
};

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export function isConflictError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409;
}

export function createVaultApi(options: CreateVaultApiOptions = {}) {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const baseUrl = options.baseUrl ?? '';

  return {
    listVaults: () => request<VaultRoot[]>(fetcher, withBase(baseUrl, '/api/vaults')),
    getTree: (rootId: string) => request<TreeNode[]>(fetcher, withBase(baseUrl, queryPath('/api/tree', { rootId }))),
    getPage: (rootId: string, path: string) =>
      request<PageDocument>(fetcher, withBase(baseUrl, queryPath('/api/page', { rootId, path }))),
    savePage: (payload: SavePageRequest) =>
      request<PageDocument>(fetcher, withBase(baseUrl, '/api/page'), jsonRequest('PUT', payload)),
    createPage: (payload: CreatePageRequest) =>
      request<PageDocument>(fetcher, withBase(baseUrl, '/api/page'), jsonRequest('POST', payload)),
    createFolder: (payload: CreateFolderRequest) =>
      request<TreeNode>(fetcher, withBase(baseUrl, '/api/folder'), jsonRequest('POST', payload)),
    moveNode: (payload: MoveNodeRequest) =>
      request<TreeNode>(fetcher, withBase(baseUrl, '/api/node'), jsonRequest('PATCH', payload)),
    deleteNode: (payload: DeleteNodeRequest) =>
      request<{ ok: true }>(fetcher, withBase(baseUrl, '/api/node'), jsonRequest('DELETE', payload)),
  };
}

export const vaultApi = createVaultApi();

function queryPath(path: string, params: Record<string, string>): string {
  return `${path}?${new URLSearchParams(params).toString()}`;
}

function withBase(baseUrl: string, path: string): string {
  if (!baseUrl) {
    return path;
  }

  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function jsonRequest(method: string, payload: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

async function request<T>(fetcher: FetchLike, url: string, init?: RequestInit): Promise<T> {
  const response = await fetcher(url, init);
  const body = await parseResponseBody(response);

  if (!response.ok) {
    throw new ApiError(response.status, errorMessage(response, body), body);
  }

  return body as T;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(response: Response, body: unknown): string {
  if (isObjectWithString(body, 'error')) {
    return body.error;
  }

  if (isObjectWithString(body, 'message')) {
    return body.message;
  }

  return response.statusText || `HTTP ${response.status}`;
}

function isObjectWithString(value: unknown, key: 'error' | 'message'): value is Record<typeof key, string> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record[key] === 'string';
}
