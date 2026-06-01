# Zelium Agent Instructions

- Use strict TDD for all production code: failing test first, verify RED, implement GREEN, refactor only after green.
- Commit after each coherent task.
- Do not write to the user's live Codex during tests. Use temporary fixture vaults.
- Version 1 has no in-app authentication; Caddy or another proxy owns auth.
- Data storage must remain Markdown documents only. Do not introduce SQLite or an app database for vault content.
- Treat path handling as security-sensitive: all filesystem operations must resolve under an allowed vault root and reject traversal/symlink escapes.
- Prefer lean dependencies. If a heavy dependency is proposed, justify it in the commit message or task handoff.
- UI tests are required for any user-visible workflow.
