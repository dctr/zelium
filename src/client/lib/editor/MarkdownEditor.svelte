<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Editor, defaultValueCtx, editorViewCtx, editorViewOptionsCtx, rootCtx } from '@milkdown/kit/core';
  import { commonmark } from '@milkdown/kit/preset/commonmark';
  import { gfm } from '@milkdown/kit/preset/gfm';
  import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';

  export let value = '';
  export let readOnly = false;
  export let onChange: (markdown: string) => void = () => {};

  let host: HTMLDivElement;
  let editor: Editor | null = null;
  let lastPublishedValue = value;

  onMount(() => {
    void mountEditor();
  });

  onDestroy(() => {
    void editor?.destroy();
  });

  $: if (editor) {
    updateEditableState(readOnly);
  }

  async function mountEditor(): Promise<void> {
    const initialValue = value;
    lastPublishedValue = initialValue;

    const nextEditor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, host);
        ctx.set(defaultValueCtx, initialValue);
        ctx.set(editorViewOptionsCtx, { editable: () => !readOnly });
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          if (readOnly) {
            return;
          }

          if (markdown === lastPublishedValue) {
            return;
          }

          lastPublishedValue = markdown;
          onChange(markdown);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(listener);

    editor = await nextEditor.create();
    const editable = host.querySelector('[contenteditable="true"]');
    labelEditor(editable);
    updateEditableState(readOnly);
  }

  function updateEditableState(isReadOnly: boolean): void {
    editor?.action((ctx) => {
      ctx.update(editorViewOptionsCtx, (options) => ({ ...options, editable: () => !isReadOnly }));
      const view = ctx.get(editorViewCtx);
      view.setProps({ editable: () => !isReadOnly });
      labelEditor(view.dom);
    });
  }

  function labelEditor(editable: Element | null): void {
    editable?.setAttribute('aria-label', 'Markdown editor');
    editable?.setAttribute('spellcheck', 'true');
  }
</script>

<div class="markdown-editor" bind:this={host}></div>
