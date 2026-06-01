import { parseDocument } from 'yaml';

export type FrontmatterParts = {
  frontmatter: string;
  body: string;
};

export type FrontmatterValidation =
  | { ok: true }
  | { ok: false; error: string };

const OPENING_DELIMITER = '---\n';
const CLOSING_DELIMITER = '\n---';

export function splitFrontmatter(markdown: string): FrontmatterParts {
  if (!markdown.startsWith(OPENING_DELIMITER)) {
    return { frontmatter: '', body: markdown };
  }

  const closingIndex = markdown.indexOf(CLOSING_DELIMITER, OPENING_DELIMITER.length);
  if (closingIndex === -1) {
    return { frontmatter: '', body: markdown };
  }

  const frontmatter = markdown.slice(OPENING_DELIMITER.length, closingIndex);
  const bodyStart = closingIndex + CLOSING_DELIMITER.length;
  const separatorLength = markdown.slice(bodyStart, bodyStart + 2) === '\n\n' ? 2 : markdown[bodyStart] === '\n' ? 1 : 0;
  const body = markdown.slice(bodyStart + separatorLength);

  return { frontmatter, body };
}

export function validateFrontmatter(frontmatter: string): FrontmatterValidation {
  if (frontmatter.trim().length === 0) {
    return { ok: true };
  }

  const document = parseDocument(frontmatter, { prettyErrors: false });
  const firstError = document.errors[0];
  if (firstError) {
    return { ok: false, error: firstError.message };
  }

  return { ok: true };
}

export function joinMarkdown(frontmatter: string, body: string): string {
  if (frontmatter.trim().length === 0) {
    return body;
  }

  return `---\n${frontmatter}\n---\n\n${body}`;
}
