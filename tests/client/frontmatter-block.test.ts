// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import FrontmatterBlock from '../../src/client/components/FrontmatterBlock.svelte';

afterEach(() => cleanup());

describe('FrontmatterBlock', () => {
  it('renders collapsed with a disclosure marker by default', () => {
    render(FrontmatterBlock, { props: { value: 'title: Home' } });

    const disclosure = screen.getByRole('button', { name: /frontmatter/i });
    expect(disclosure.textContent).toContain('>');
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('YAML frontmatter')).toBeNull();
  });

  it('expands to a raw YAML textarea when the disclosure is clicked', async () => {
    render(FrontmatterBlock, { props: { value: 'title: Home' } });

    await fireEvent.click(screen.getByRole('button', { name: /frontmatter/i }));

    const textarea = screen.getByLabelText('YAML frontmatter') as HTMLTextAreaElement;
    expect(textarea.value).toBe('title: Home');
  });

  it('reports invalid YAML and does not publish it as a valid change', async () => {
    const onValidChange = vi.fn();
    const onValidityChange = vi.fn();
    render(FrontmatterBlock, { props: { value: 'title: Home', onValidChange, onValidityChange } });

    await fireEvent.click(screen.getByRole('button', { name: /frontmatter/i }));
    await fireEvent.input(screen.getByLabelText('YAML frontmatter'), { target: { value: 'title: [unterminated' } });

    expect(screen.getByRole('alert').textContent).toContain('Invalid YAML');
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
    expect(onValidChange).not.toHaveBeenCalled();
  });

  it('publishes valid YAML changes for pending page state', async () => {
    const onValidChange = vi.fn();
    const onValidityChange = vi.fn();
    render(FrontmatterBlock, { props: { value: 'title: Home', onValidChange, onValidityChange } });

    await fireEvent.click(screen.getByRole('button', { name: /frontmatter/i }));
    await fireEvent.input(screen.getByLabelText('YAML frontmatter'), { target: { value: 'title: Edited' } });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
    expect(onValidChange).toHaveBeenLastCalledWith('title: Edited');
  });
});
