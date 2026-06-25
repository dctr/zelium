<script lang="ts">
  import type { TreeNode, VaultRoot } from '../lib/types';

  export let roots: VaultRoot[] = [];
  export let trees: Record<string, TreeNode[]> = {};
  export let selected: { rootId: string; path: string } | null = null;
  export let onSelect: (node: TreeNode) => void = () => {};
  export let readOnly = true;
  export let onReadOnlyChange: (readOnly: boolean) => void = () => {};

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

  function updateReadOnly(event: Event): void {
    onReadOnlyChange((event.currentTarget as HTMLInputElement).checked);
  }
</script>

{#snippet renderNode(node: TreeNode)}
  <li data-testid={`node-${node.path}`}>
    <div class="tree-row">
      {#if node.kind === 'folder'}
        <button class="tree-node tree-folder" type="button" aria-expanded={expanded.has(nodeKey(node))} on:click={() => toggleFolder(node)}>
          {node.name}
        </button>
      {:else}
        <button class="tree-node tree-page" type="button" aria-current={selected?.rootId === node.rootId && selected.path === node.path ? 'page' : undefined} on:click={() => onSelect(node)}>
          {node.name}
        </button>
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
  <label class="read-only-toggle">
    <input type="checkbox" checked={readOnly} on:change={updateReadOnly} />
    <span>Read only</span>
  </label>
  {#if roots.length === 0}
    <p class="muted">No vaults loaded.</p>
  {:else}
    {#each roots as root (root.id)}
      <section class="vault-root" aria-labelledby={`vault-${root.id}`} data-testid={`root-${root.id}`}>
        <div class="vault-root-header">
          <h2 id={`vault-${root.id}`}>{root.name}</h2>
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
