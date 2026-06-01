import { describe, expect, it } from 'vitest';

import { joinMarkdown, splitFrontmatter, validateFrontmatter } from '../../src/server/frontmatter';

describe('frontmatter helpers', () => {
  it('splits markdown with opening and closing frontmatter delimiters', () => {
    expect(splitFrontmatter('---\ntitle: Test\n---\n# Body')).toEqual({
      frontmatter: 'title: Test',
      body: '# Body',
    });
  });

  it('returns empty frontmatter and original body when no frontmatter exists', () => {
    const markdown = '# Body\n\n---\nnot frontmatter';

    expect(splitFrontmatter(markdown)).toEqual({ frontmatter: '', body: markdown });
  });

  it('preserves frontmatter comments, key order, and unknown YAML text exactly', () => {
    const rawYaml = '# first comment\nzeta: 1\nalpha:\n  - nested\nunknown: !!str 123';

    expect(splitFrontmatter(`---\n${rawYaml}\n---\nBody`)).toEqual({
      frontmatter: rawYaml,
      body: 'Body',
    });
  });

  it('reports invalid YAML without rewriting it', () => {
    const rawYaml = 'title: [unterminated';

    expect(validateFrontmatter(rawYaml)).toEqual({
      ok: false,
      error: expect.stringContaining('Flow sequence'),
    });
    expect(joinMarkdown(rawYaml, 'Body')).toBe('---\ntitle: [unterminated\n---\n\nBody');
  });

  it('accepts valid YAML frontmatter', () => {
    expect(validateFrontmatter('title: Test\ntags:\n  - one')).toEqual({ ok: true });
  });

  it('joins non-empty frontmatter and body with editable frontmatter delimiters', () => {
    expect(joinMarkdown('title: Test', '# Body')).toBe('---\ntitle: Test\n---\n\n# Body');
  });

  it('joins empty frontmatter as body-only markdown', () => {
    expect(joinMarkdown('', '# Body')).toBe('# Body');
  });
});
