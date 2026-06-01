export type VaultRoot = {
  id: string;
  name: string;
};

export type TreeNode = {
  rootId: string;
  path: string;
  name: string;
  kind: 'folder' | 'page';
  children?: TreeNode[];
};

export type PageDocument = {
  rootId: string;
  path: string;
  markdown: string;
  frontmatter: string;
  body: string;
  etag: string;
};

export type SavePageRequest = {
  rootId: string;
  path: string;
  frontmatter: string;
  body: string;
  etag: string;
};

export type CreatePageRequest = {
  rootId: string;
  path: string;
  frontmatter?: string;
  body?: string;
};

export type CreateFolderRequest = {
  rootId: string;
  path: string;
};

export type MoveNodeRequest = {
  rootId: string;
  fromPath: string;
  toPath: string;
  kind: 'folder' | 'page';
};

export type DeleteNodeRequest = {
  rootId: string;
  path: string;
  kind: 'folder' | 'page';
};
