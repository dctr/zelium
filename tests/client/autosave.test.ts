import { describe, expect, it, vi, afterEach } from 'vitest';

import { ApiError } from '../../src/client/lib/api';
import { createAutosaveController, type AutosaveSnapshot } from '../../src/client/lib/autosave';

const document = {
  rootId: 'root-1',
  path: 'INDEX.md',
  frontmatter: 'title: Home',
  body: '# Welcome',
  etag: 'W/"1-1"',
};

afterEach(() => {
  vi.useRealTimers();
});

describe('createAutosaveController', () => {
  it('debounces edits and transitions saved to dirty to saving to saved', async () => {
    vi.useFakeTimers();
    const states: AutosaveSnapshot['state'][] = [];
    const save = vi.fn(async (payload) => ({ ...payload, markdown: payload.body, etag: 'W/"2-2"' }));
    const controller = createAutosaveController({
      document,
      delayMs: 50,
      save,
      onChange: (snapshot) => states.push(snapshot.state),
    });

    controller.update({ body: 'Edited once' });
    controller.update({ body: 'Edited twice' });

    expect(controller.snapshot.state).toBe('dirty');
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(49);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      rootId: 'root-1',
      path: 'INDEX.md',
      frontmatter: 'title: Home',
      body: 'Edited twice',
      etag: 'W/"1-1"',
    });
    expect(controller.snapshot).toMatchObject({ state: 'saved', etag: 'W/"2-2"' });
    expect(states).toEqual(['dirty', 'saving', 'saved']);
  });

  it('marks invalid frontmatter and does not save until the draft becomes valid', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (payload) => ({ ...payload, markdown: payload.body, etag: 'W/"2-2"' }));
    const controller = createAutosaveController({ document, delayMs: 50, save });

    controller.update({ frontmatterValid: false });
    await vi.advanceTimersByTimeAsync(100);

    expect(controller.snapshot.state).toBe('invalid');
    expect(save).not.toHaveBeenCalled();

    controller.update({ frontmatter: 'title: Edited', frontmatterValid: true });
    await vi.advanceTimersByTimeAsync(50);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ frontmatter: 'title: Edited' }));
    expect(controller.snapshot.state).toBe('saved');
  });

  it('enters conflict state on stale etag and suppresses further saves', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => {
      throw new ApiError(409, 'Page changed on disk.', { error: 'Page changed on disk.' });
    });
    const controller = createAutosaveController({ document, delayMs: 50, save });

    controller.update({ body: 'Conflicting edit' });
    await vi.advanceTimersByTimeAsync(50);

    expect(controller.snapshot).toMatchObject({ state: 'conflict', error: 'Page changed on disk.' });
    expect(save).toHaveBeenCalledTimes(1);

    controller.update({ body: 'Second edit' });
    await vi.advanceTimersByTimeAsync(100);

    expect(controller.snapshot.state).toBe('conflict');
    expect(save).toHaveBeenCalledTimes(1);
  });
});
