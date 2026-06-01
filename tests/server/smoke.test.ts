import { describe, expect, it } from 'vitest';

import { createServer } from '../../src/server/index';

describe('server bootstrap', () => {
  it('exports a createServer function', () => {
    expect(createServer).toBeTypeOf('function');
  });
});
