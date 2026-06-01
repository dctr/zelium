<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Editor, defaultValueCtx, rootCtx } from '@milkdown/kit/core';
  import { commonmark } from '@milkdown/kit/preset/commonmark';
  import { gfm } from '@milkdown/kit/preset/gfm';
  import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';

  export let value = '';
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

  async function mountEditor(): Promise<void> {
    const initialValue = value;
    lastPublishedValue = initialValue;

    const nextEditor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, host);
        ctx.set(defaultValueCtx, initialValue);
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
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
    editable?.setAttribute('aria-label', 'Markdown editor');
    editable?.setAttribute('spellcheck', 'true');
  }
</script>

<div class="markdown-editor" bind:this={host}></div>
