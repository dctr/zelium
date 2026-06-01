<script lang="ts">
  import { onMount } from 'svelte';

  import PageShell from './components/PageShell.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import { ApiError, vaultApi } from './lib/api';
  import type { PageDocument, TreeNode, VaultRoot } from './lib/types';

  type NodeKind = 'folder' | 'page';

  let roots: VaultRoot[] = [];
  let trees: Record<string, TreeNode[]> = {};
  let selectedPage: TreeNode | null = null;
  let pageDocument: PageDocument | null = null;
  let sidebarError = '';
  let pageError = '';
  let sidebarLoading = true;
  let pageLoading = false;
  let activePageRequest = '';

  onMount(() => {
    void loadSidebar();
  });

  async function loadSidebar(): Promise<void> {
    sidebarLoading = true;
    sidebarError = '';

    try {
      const loadedRoots = await vaultApi.listVaults();
      const loadedTrees = await Promise.all(loadedRoots.map(async (root) => [root.id, await vaultApi.getTree(root.id)] as const));
      roots = loadedRoots;
      trees = Object.fromEntries(loadedTrees);
    } catch (error) {
      sidebarError = error instanceof ApiError ? error.message : 'Failed to load vaults.';
    } finally {
      sidebarLoading = false;
    }
  }

  function selectPage(node: TreeNode): void {
    if (node.kind !== 'page') return;
    selectedPage = node;
    void loadPage(node);
  }

  async function loadPage(node: TreeNode): Promise<void> {
    const requestKey = `${node.rootId}:${node.path}`;
    activePageRequest = requestKey;
    pageDocument = null;
    pageError = '';
    pageLoading = true;

    try {
      const loadedPage = await vaultApi.getPage(node.rootId, node.path);
      if (activePageRequest === requestKey) pageDocument = loadedPage;
    } catch (error) {
      if (activePageRequest === requestKey) pageError = error instanceof ApiError ? error.message : 'Failed to load page.';
    } finally {
      if (activePageRequest === requestKey) pageLoading = false;
    }
  }

  async function createPage(rootId: string, path: string): Promise<void> {
    const created = await vaultApi.createPage({ rootId, path });
    const node = pageNode(rootId, path);
    selectedPage = node;
    pageDocument = created;
    pageError = '';
    pageLoading = false;
    await loadSidebar();
  }

  async function createFolder(rootId: string, path: string): Promise<void> {
    await vaultApi.createFolder({ rootId, path });
    await loadSidebar();
  }

  async function moveNode(rootId: string, fromPath: string, toPath: string, kind: NodeKind): Promise<void> {
    const moved = await vaultApi.moveNode({ rootId, fromPath, toPath, kind });
    const nextSelected = selectedAfterMove(rootId, fromPath, toPath, kind, moved);
    await loadSidebar();
    if (nextSelected) {
      selectedPage = nextSelected;
      await loadPage(nextSelected);
    }
  }

  async function deleteNode(rootId: string, path: string, kind: NodeKind): Promise<void> {
    await vaultApi.deleteNode({ rootId, path, kind });
    if (selectedPage && selectedPage.rootId === rootId && pathContains(kind, path, selectedPage.path)) {
      selectedPage = null;
      pageDocument = null;
      pageError = '';
      pageLoading = false;
    }
    await loadSidebar();
  }

  function selectedAfterMove(rootId: string, fromPath: string, toPath: string, kind: NodeKind, moved: TreeNode): TreeNode | null {
    if (!selectedPage || selectedPage.rootId !== rootId || !pathContains(kind, fromPath, selectedPage.path)) return null;
    if (kind === 'page') return moved;
    const suffix = selectedPage.path.slice(fromPath.length);
    return pageNode(rootId, `${toPath}${suffix}`);
  }

  function pathContains(kind: NodeKind, containerPath: string, candidatePath: string): boolean {
    if (kind === 'page') return candidatePath === containerPath;
    return candidatePath === containerPath || candidatePath.startsWith(`${containerPath}/`);
  }

  function pageNode(rootId: string, path: string): TreeNode {
    return { rootId, path, name: basename(path), kind: 'page' };
  }

  function basename(path: string): string {
    return path.split('/').pop() ?? path;
  }
</script>

<main class="app-shell">
  <Sidebar {roots} {trees} selected={selectedPage} onSelect={selectPage} onCreatePage={createPage} onCreateFolder={createFolder} onMoveNode={moveNode} onDeleteNode={deleteNode} />

  <section class="workspace" aria-label="Workspace">
    {#if sidebarLoading}
      <p role="status">Loading vaults…</p>
    {/if}

    {#if sidebarError}
      <p role="alert">{sidebarError}</p>
    {/if}

    <PageShell selectedPage={selectedPage} document={pageDocument} loading={pageLoading} error={pageError} />
  </section>
</main>
