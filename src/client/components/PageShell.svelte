<script lang="ts">
  import { onDestroy } from 'svelte';

  import FrontmatterBlock from './FrontmatterBlock.svelte';
  import { createAutosaveController, type AutosaveController, type AutosaveSnapshot } from '../lib/autosave';
  import { vaultApi } from '../lib/api';
  import MarkdownEditor from '../lib/editor/MarkdownEditor.svelte';
  import type { PageDocument, TreeNode } from '../lib/types';

  export let selectedPage: TreeNode | null = null;
  export let document: PageDocument | null = null;
  export let loading = false;
  export let error = '';

  let loadedDocumentKey = '';
  let pendingFrontmatter = '';
  let pendingBody = '';
  let frontmatterValid = true;
  let autosave: AutosaveController | null = null;
  let autosaveSnapshot: AutosaveSnapshot = { state: 'saved', etag: '', error: '' };

  onDestroy(() => {
    autosave?.dispose();
  });

  $: {
    const nextDocumentKey = document ? `${document.rootId}:${document.path}:${document.etag}` : '';
    if (nextDocumentKey !== loadedDocumentKey) {
      loadedDocumentKey = nextDocumentKey;
      pendingFrontmatter = document?.frontmatter ?? '';
      pendingBody = document?.body ?? '';
      frontmatterValid = true;

      if (document) {
        autosave?.dispose();
        autosave = createAutosaveController({
          document,
          save: vaultApi.savePage,
          onChange: (snapshot) => (autosaveSnapshot = snapshot),
        });
        autosaveSnapshot = autosave.snapshot;
      } else {
        autosave?.dispose();
        autosave = null;
        autosaveSnapshot = { state: 'saved', etag: '', error: '' };
      }
    }
  }

  $: saveStateText = autosaveText(autosaveSnapshot);

  function titleFromPath(path: string): string {
    const filename = path.split('/').pop() ?? path;
    return filename.endsWith('.md') ? filename.slice(0, -3) : filename;
  }

  function updateBody(markdown: string): void {
    pendingBody = markdown;
    autosave?.update({ body: markdown });
  }

  function updateFrontmatter(value: string): void {
    pendingFrontmatter = value;
    autosave?.update({ frontmatter: value, frontmatterValid });
  }

  function updateFrontmatterValidity(valid: boolean): void {
    frontmatterValid = valid;
    autosave?.update({ frontmatterValid: valid });
  }

  function autosaveText(snapshot: AutosaveSnapshot): string {
    if (snapshot.state === 'dirty') {
      return 'Unsaved changes';
    }

    if (snapshot.state === 'saving') {
      return 'Saving…';
    }

    if (snapshot.state === 'invalid') {
      return 'Invalid frontmatter';
    }

    if (snapshot.state === 'conflict') {
      return 'Conflict: page changed on disk. Reload to continue.';
    }

    return 'Saved';
  }
</script>

<section class="page-shell" aria-label="Page">
  {#if !selectedPage}
    <p class="muted">Select a page to begin.</p>
  {:else if loading}
    <p role="status">Loading page…</p>
  {:else if error}
    <p role="alert">{error}</p>
  {:else if document}
    <article class="page-document">
      <h2>{titleFromPath(document.path)}</h2>
      <FrontmatterBlock
        value={pendingFrontmatter}
        onValidChange={updateFrontmatter}
        onValidityChange={updateFrontmatterValidity}
      />
      <div class="page-actions">
        <p class="save-state" role={autosaveSnapshot.state === 'conflict' ? 'alert' : 'status'} aria-live="polite">{saveStateText}</p>
      </div>
      {#key loadedDocumentKey}
        <MarkdownEditor value={pendingBody} onChange={updateBody} />
      {/key}
    </article>
  {:else}
    <p class="muted">No page loaded.</p>
  {/if}
</section>
