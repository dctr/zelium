<script lang="ts">
  import { validateFrontmatter } from '../lib/editor/frontmatter';

  export let value = '';
  export let readOnly = false;
  export let onValidChange: (value: string) => void = () => {};
  export let onValidityChange: (valid: boolean) => void = () => {};

  let expanded = false;
  let draft = value;
  let lastValue = value;
  let validationError = '';

  $: if (value !== lastValue) {
    draft = value;
    lastValue = value;
    validationError = '';
    onValidityChange(true);
  }

  function toggleExpanded(): void {
    expanded = !expanded;
  }

  function updateDraft(event: Event): void {
    if (readOnly) return;

    draft = (event.currentTarget as HTMLTextAreaElement).value;
    const validation = validateFrontmatter(draft);

    if (validation.ok) {
      validationError = '';
      onValidityChange(true);
      onValidChange(draft);
      return;
    }

    validationError = `Invalid YAML: ${validation.error}`;
    onValidityChange(false);
  }
</script>

<section class="frontmatter-block" aria-label="Frontmatter">
  <button class="frontmatter-disclosure" type="button" aria-expanded={expanded} aria-controls="frontmatter-editor" on:click={toggleExpanded}>
    <span aria-hidden="true">{expanded ? 'v' : '>'}</span>
    <span>Frontmatter</span>
  </button>

  {#if expanded}
    <div class="frontmatter-editor">
      <textarea id="frontmatter-editor" aria-label="YAML frontmatter" spellcheck="false" value={draft} disabled={readOnly} on:input={updateDraft}></textarea>
      {#if validationError}
        <p class="frontmatter-error" role="alert">{validationError}</p>
      {/if}
    </div>
  {/if}
</section>
