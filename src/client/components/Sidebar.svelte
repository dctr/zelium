<script lang="ts">
  import FileActions from './FileActions.svelte';
  import type { TreeNode, VaultRoot } from '../lib/types';

  type NodeKind = 'folder' | 'page';

  export let roots: VaultRoot[] = [];
  export let trees: Record<string, TreeNode[]> = {};
  export let selected: { rootId: string; path: string } | null = null;
  export let onSelect: (node: TreeNode) => void = () => {};
  export let onCreatePage: (rootId: string, path: string) => Promise<void> | void = () => {};
  export let onCreateFolder: (rootId: string, path: string) => Promise<void> | void = () => {};
  export let onMoveNode: (rootId: string, fromPath: string, toPath: string, kind: NodeKind) => Promise<void> | void = () => {};
  export let onDeleteNode: (rootId: string, path: string, kind: NodeKind) => Promise<void> | void = () => {};

  let expanded = new Set<string>();

  function nodeKey(node: TreeNode): string {
    return `${node.rootId}:${node.path}`;
  }

  function toggleFolder(node: TreeNode): void {
    const next = new Set(expanded);
    const key = nodeKey(node);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expanded = next;
  }
</script>

{#snippet renderNode(node: TreeNode)}
  <li data-testid={`node-${node.path}`}>
    <div class="tree-row">
      {#if node.kind === 'folder'}
        <button class="tree-node tree-folder" type="button" aria-expanded={expanded.has(nodeKey(node))} on:click={() => toggleFolder(node)}>
          {node.name}
        </button>
        <FileActions rootId={node.rootId} containerPath={node.path} containerLabel={node.name} canCreate={true} {node} {onCreatePage} {onCreateFolder} {onMoveNode} {onDeleteNode} testId={`node-actions-${node.path}`} />
      {:else}
        <button class="tree-node tree-page" type="button" aria-current={selected?.rootId === node.rootId && selected.path === node.path ? 'page' : undefined} on:click={() => onSelect(node)}>
          {node.name}
        </button>
        <FileActions rootId={node.rootId} containerLabel={node.name} {node} {onCreatePage} {onCreateFolder} {onMoveNode} {onDeleteNode} testId={`node-actions-${node.path}`} />
      {/if}
    </div>
    {#if node.kind === 'folder' && expanded.has(nodeKey(node))}
      <ul>
        {#each node.children ?? [] as child (child.rootId + child.path)}
          {@render renderNode(child)}
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

<aside class="sidebar" aria-label="Vaults">
  <h1>Zelium</h1>
  {#if roots.length === 0}
    <p class="muted">No vaults loaded.</p>
  {:else}
    {#each roots as root (root.id)}
      <section class="vault-root" aria-labelledby={`vault-${root.id}`} data-testid={`root-${root.id}`}>
        <div class="vault-root-header">
          <h2 id={`vault-${root.id}`}>{root.name}</h2>
          <FileActions rootId={root.id} containerLabel={root.name} canCreate={true} {onCreatePage} {onCreateFolder} {onMoveNode} {onDeleteNode} testId={`root-actions-${root.id}`} />
        </div>
        <ul>
          {#each trees[root.id] ?? [] as node (node.rootId + node.path)}
            {@render renderNode(node)}
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</aside>
