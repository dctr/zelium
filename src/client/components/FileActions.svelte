<script lang="ts">
  import type { TreeNode } from '../lib/types';

  type NodeKind = 'folder' | 'page';
  type ActiveAction = 'create-page' | 'create-folder' | 'rename' | 'move' | null;

  export let rootId = '';
  export let containerPath = '';
  export let containerLabel = '';
  export let canCreate = false;
  export let node: TreeNode | null = null;
  export let testId = '';
  export let onCreatePage: (rootId: string, path: string) => Promise<void> | void = () => {};
  export let onCreateFolder: (rootId: string, path: string) => Promise<void> | void = () => {};
  export let onMoveNode: (rootId: string, fromPath: string, toPath: string, kind: NodeKind) => Promise<void> | void = () => {};
  export let onDeleteNode: (rootId: string, path: string, kind: NodeKind) => Promise<void> | void = () => {};

  let activeAction: ActiveAction = null;
  let name = '';
  let destinationFolder = '';
  let error = '';
  let busy = false;

  $: formLabel = formLabelFor(activeAction);

  function begin(action: Exclude<ActiveAction, null>): void {
    activeAction = action;
    error = '';
    busy = false;
    name = action === 'rename' && node ? basename(node.path) : '';
    destinationFolder = '';
  }

  function cancel(): void {
    activeAction = null;
    error = '';
    busy = false;
    name = '';
    destinationFolder = '';
  }

  async function submitCreatePage(): Promise<void> {
    const result = normalizeName(name, 'page');
    if (!result.ok) {
      error = result.error;
      return;
    }
    await runAction(() => onCreatePage(rootId, joinPath(containerPath, result.name)));
  }

  async function submitCreateFolder(): Promise<void> {
    const result = normalizeName(name, 'folder');
    if (!result.ok) {
      error = result.error;
      return;
    }
    await runAction(() => onCreateFolder(rootId, joinPath(containerPath, result.name)));
  }

  async function submitRename(): Promise<void> {
    if (!node) return;
    const result = normalizeName(name, node.kind);
    if (!result.ok) {
      error = result.error;
      return;
    }
    await runAction(() => onMoveNode(rootId, node.path, joinPath(parentPath(node.path), result.name), node.kind));
  }

  async function submitMove(): Promise<void> {
    if (!node) return;
    const result = normalizeFolderPath(destinationFolder);
    if (!result.ok) {
      error = result.error;
      return;
    }
    await runAction(() => onMoveNode(rootId, node.path, joinPath(result.path, basename(node.path)), node.kind));
  }

  async function confirmDelete(): Promise<void> {
    if (!node) return;
    const hasChildren = node.kind === 'folder' && (node.children?.length ?? 0) > 0;
    const message = hasChildren
      ? `Delete folder "${node.name}" and all of its contents? This cannot be undone.`
      : `Delete ${node.kind} "${node.name}"? This cannot be undone.`;
    if (!window.confirm(message)) return;
    await runAction(() => onDeleteNode(rootId, node.path, node.kind));
  }

  async function submitActive(): Promise<void> {
    if (activeAction === 'create-page') await submitCreatePage();
    else if (activeAction === 'create-folder') await submitCreateFolder();
    else if (activeAction === 'rename') await submitRename();
    else if (activeAction === 'move') await submitMove();
  }

  async function runAction(operation: () => Promise<void> | void): Promise<void> {
    busy = true;
    error = '';
    try {
      await operation();
      cancel();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'File operation failed.';
    } finally {
      busy = false;
    }
  }

  function normalizeName(input: string, kind: NodeKind): { ok: true; name: string } | { ok: false; error: string } {
    const trimmed = input.trim();
    if (!trimmed) return { ok: false, error: 'Name is required.' };
    if (trimmed.includes('/') || trimmed.includes('\\') || trimmed === '.' || trimmed === '..' || trimmed.includes('\0') || /^[A-Za-z]:/.test(trimmed)) {
      return { ok: false, error: 'Use a name, not a path.' };
    }
    if (kind === 'folder') {
      if (trimmed.endsWith('.md')) return { ok: false, error: 'Folder names cannot end in .md.' };
      return { ok: true, name: trimmed };
    }
    return { ok: true, name: trimmed.endsWith('.md') ? trimmed : `${trimmed}.md` };
  }

  function normalizeFolderPath(input: string): { ok: true; path: string } | { ok: false; error: string } {
    const trimmed = input.trim();
    if (!trimmed) return { ok: true, path: '' };
    if (trimmed.startsWith('/') || trimmed.includes('\\') || trimmed.includes('\0') || /^[A-Za-z]:/.test(trimmed)) {
      return { ok: false, error: 'Enter a vault-relative folder path.' };
    }
    const segments = trimmed.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return { ok: false, error: 'Enter a vault-relative folder path.' };
    if (segments.at(-1)?.endsWith('.md')) return { ok: false, error: 'Destination must be a folder path.' };
    return { ok: true, path: segments.join('/') };
  }

  function formLabelFor(action: ActiveAction): string {
    if (action === 'create-page') return 'Create page';
    if (action === 'create-folder') return 'Create folder';
    if (action === 'rename') return 'Rename';
    if (action === 'move') return 'Move';
    return '';
  }

  function basename(nodePath: string): string {
    return nodePath.split('/').pop() ?? nodePath;
  }

  function parentPath(nodePath: string): string {
    const parts = nodePath.split('/');
    parts.pop();
    return parts.join('/');
  }

  function joinPath(parent: string, child: string): string {
    return parent ? `${parent}/${child}` : child;
  }
</script>

<div class="file-actions" data-testid={testId} aria-label={containerLabel ? `File actions for ${containerLabel}` : 'File actions'}>
  <div class="file-action-buttons">
    {#if canCreate}
      <button type="button" on:click={() => begin('create-page')} disabled={busy}>New page</button>
      <button type="button" on:click={() => begin('create-folder')} disabled={busy}>New folder</button>
    {/if}
    {#if node}
      <button type="button" on:click={() => begin('rename')} disabled={busy}>Rename</button>
      <button type="button" on:click={() => begin('move')} disabled={busy}>Move</button>
      <button type="button" on:click={confirmDelete} disabled={busy}>Delete</button>
    {/if}
  </div>

  {#if activeAction}
    <form class="file-action-form" data-testid="file-action-form" aria-label={formLabel} on:submit|preventDefault={submitActive}>
      {#if activeAction === 'create-page'}
        <label>Page name <input bind:value={name} autocomplete="off" /></label>
        <button type="submit" disabled={busy}>Create page</button>
      {:else if activeAction === 'create-folder'}
        <label>Folder name <input bind:value={name} autocomplete="off" /></label>
        <button type="submit" disabled={busy}>Create folder</button>
      {:else if activeAction === 'rename'}
        <label>New name <input bind:value={name} autocomplete="off" /></label>
        <button type="submit" disabled={busy}>Rename</button>
      {:else if activeAction === 'move'}
        <label>Destination folder <input bind:value={destinationFolder} autocomplete="off" placeholder="Leave empty for root" /></label>
        <button type="submit" disabled={busy}>Move</button>
      {/if}
      <button type="button" on:click={cancel} disabled={busy}>Cancel</button>
    </form>
  {/if}

  {#if error}
    <p class="file-action-error" role="alert">{error}</p>
  {/if}
</div>
