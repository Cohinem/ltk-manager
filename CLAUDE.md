# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This file is the primary guidance document for the ltk-manager codebase.

Guidance is scoped so backend work does not carry the frontend's:

- `src-tauri/CLAUDE.md` - workspace crates, the patcher and the Tauri states. Loads under
  `src-tauri/`, and `crates/ltk-manager-core/` imports it.
- `src/CLAUDE.md` - React/TypeScript conventions, loads when working under `src/`.
- `src/styles/CLAUDE.md` - how to author the design tokens, loads only in that directory.
- The `design-system` skill - which token to reach for in a component. Loaded on demand, so it
  costs nothing while you are in `src-tauri/`.

## Commands

All commands run from the repo root. See `package.json` scripts for the full list.

```bash
# Verbose backend logging
RUST_LOG=ltk_manager=trace,tauri=info pnpm tauri dev
```

`pnpm generate:licenses` requires `cargo-about` on PATH, and its config is `about.toml`.

## Code Style

Avoid trivially descriptive comments. Only comment non-obvious business logic, workarounds, edge cases, or a decision the code cannot show. Document all public Rust APIs with `///` doc comments.

**A comment explains the code, not the product.** The test is whether deleting it would let a
reader change this code and break something. An architectural decision - why the state is shaped
this way, why a hook is mounted here - passes. Why the _product_ behaves as it does fails,
however true the sentence is. That belongs in `docs/ux/`, and repeating it here records one
decision in two places that then drift apart.

**No redundant comments.** Do not add inline comments that restate what the code already expresses. If the code is descriptive enough (clear variable names, well-known patterns like temp-file-then-rename, obvious API calls), leave it uncommented. This applies to AI-generated code and suggestions too - strip narration comments before committing. The same goes for what a symbol's own doc expresses: a call site that restates the constant or type it is using is writing that doc twice. Needing the explanation there usually means the code is in the wrong place - move it beside what it explains, and the comment stops being needed.

**Cite a rule, do not restate it.** Code written to satisfy a documented design rule
names that rule by its code and stops - `/* Duotone rather than fill: DS-ICON-WEIGHT. */`,
not a paragraph reproducing the reasoning. `DS-*` codes are defined in the `design-system`
skill. Add a code there before citing a new one.

The same holds for a `docs/ux/` spec: name the section and the file and stop - a comment reading
`per "What an empty box lists" in docs/ux/WORKSHOP.md` and nothing more. A citation sits at a file
header or a module's exported entry point, never on a statement, and only where prose was removed.
It is the receipt for what is no longer written there. Never a relative path, because the code
moves and the doc does not.

**No semicolons splicing sentences,** in comments, doc comments, or markdown. They read as
compressed notes rather than prose. Use a full stop when the halves are two thoughts, or a comma
plus `and` / `so` / `but` when the second half follows from the first:

```
Bad   Dark is the default; light is [data-theme="light"] on <html>.
Good  Dark is the default. Light is [data-theme="light"] on <html>.

Bad   Wallpaper costs the muted rungs contrast; lift them.
Good  Wallpaper costs the muted rungs contrast, so lift them.
```

A bulleted list of fragments takes no terminal punctuation at all. A bullet that is a complete
sentence ends with a full stop, like any other sentence.

## Log Files

- **Windows:** `%APPDATA%\dev.leaguetoolkit.manager\logs\ltk-manager.log`
- **Linux/macOS:** `~/.local/share/dev.leaguetoolkit.manager/logs/ltk-manager.log`

## Agent skills

### Issue tracker

Issues live as GitHub issues in `LeagueToolkit/ltk-manager`, driven through the `gh` CLI. See
`docs/agents/issue-tracker.md`.

### Triage labels

The canonical roles map onto the repo's existing `triage`, `needs-context` and `wontfix`
labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context, with one `CONTEXT.md` and one `docs/adr/` at the repo root. See
`docs/agents/domain.md`.
