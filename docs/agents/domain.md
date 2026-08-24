# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the
codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence, and don't suggest
creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and
`/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This is a **single-context** repo. The `src/` (React) and `src-tauri/` + `crates/` (Rust) split is a
layer boundary rather than a second bounded context, so one glossary and one ADR directory cover
both.

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-....md
│   └── 0002-....md
├── src/            ← React/TypeScript frontend
├── src-tauri/      ← Tauri backend
└── crates/         ← ltk-manager-core
```

The per-directory `CLAUDE.md` files (`src/`, `src/styles/`, `src-tauri/`, `crates/ltk-manager-core/`)
carry coding conventions, not domain vocabulary. They are not a substitute for `CONTEXT.md` and they
do not make this a multi-context repo.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a
test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly
avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language
the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
