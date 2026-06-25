<script lang="ts">
  import { onMount } from 'svelte';

  import PageShell from './components/PageShell.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import { ApiError, vaultApi } from './lib/api';
  import type { PageDocument, TreeNode, VaultRoot } from './lib/types';

  let roots: VaultRoot[] = [];
  let trees: Record<string, TreeNode[]> = {};
  let selectedPage: TreeNode | null = null;
  let pageDocument: PageDocument | null = null;
  let sidebarError = '';
  let pageError = '';
  let sidebarLoading = true;
  let pageLoading = false;
  let activePageRequest = '';
  let readOnly = true;

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

  function setReadOnly(value: boolean): void {
    readOnly = value;
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

</script>

<main class="app-shell">
  <Sidebar {roots} {trees} selected={selectedPage} onSelect={selectPage} {readOnly} onReadOnlyChange={setReadOnly} />

  <section class="workspace" aria-label="Workspace">
    {#if sidebarLoading}
      <p role="status">Loading vaults…</p>
    {/if}

    {#if sidebarError}
      <p role="alert">{sidebarError}</p>
    {/if}

    <PageShell selectedPage={selectedPage} document={pageDocument} loading={pageLoading} error={pageError} {readOnly} />
  </section>
</main>
