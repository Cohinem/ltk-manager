# AGENTS.md

This file provides guidance to coding agents working in this repository.

This file is the primary guidance document for the ltk-manager codebase.

Guidance is scoped by directory:

- `src-tauri/AGENTS.md` - workspace crates, the patcher and the Tauri states. Loads under
  `src-tauri/`, and the `AGENTS.md` of each `crates/ltk-manager-*` crate points to it.
- `src/AGENTS.md` - React/TypeScript conventions, loads when working under `src/`.
- `src/styles/AGENTS.md` - how to author the design tokens, loads only in that directory.
- The `design-system` skill - which token to reach for in a component. Loaded on demand, so it
  is not needed for backend work.

## Writing

These rules apply to all text in the repository and to replies: doc comments, inline comments,
test names, UI copy, log and error messages, docs, issues, commit messages and PR descriptions.
UI copy also follows "UI Copy" in `src/AGENTS.md`. The rules come from the
[ritobin-tools guide](https://github.com/LeagueToolkit/ritobin-tools/blob/main/AGENTS.md).

Use direct, literal language. State the action, the fact or the condition. Do not use metaphor,
personification, decorative phrasing or rhetorical contrast. Write the first draft this way, and
do not copy a figurative style from nearby code. When the user marks one sentence as an example of
a violation, fix every instance in the change, not only the quoted line.

### Sentences

- Put the subject first and the verb next. Write one fact per sentence.
- Name the real actor: "the function returns", "the loader fails", "the edit is skipped". Do not
  give actions to things that do not act. A table does not "name" a hash, a module does not
  "reach" a bin, and a diagnostic does not "say" something.
- State a condition with "if" or "when" and an explicit subject: "Returns `None` if no archive
  contains the chunk."
- State an outcome with a standard verb: returns, fails, skips, reads, writes, resolves, falls
  back to, defaults to.
- Use the established technical term: index, cache, resolve, fallback, missing, stale, lower,
  validate. Do not describe around a term that exists.
- Keep "that" and "which" in relative clauses. Write "the first archive that contains the chunk",
  not "the first archive holding it" or "an entry no chunk declares".
- End a sentence with a specific predicate. Do not end with "is a problem", "says nothing",
  "names nothing" or "is as it was". Say what the code does in that case.
- Do not use literary or idiomatic phrases: "for want of", "came to", "the one that remains",
  "as the game has it".
- Delete phrases that add emphasis without information.

| Do not write                                                                             | Write                                                                                                         |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| The chunks `module` edits, each with its edits. An entry no chunk declares is a problem. | Lowers the `module` representation into a deterministic program.                                              |
| Opens the table of game paths of `store`. A cache without it names nothing.              | Opens the `game` table of `store`. If the table is not installed, returns a `WadPaths` that resolves no hash. |
| The game's copy of `chunk`: the one in the first archive that holds it.                  | Reads `chunk` from the first archive that contains it.                                                        |
| Logs what an application came to.                                                        | Logs a summary of `outcome`.                                                                                  |
| No edit applied to X. It is as the game has it.                                          | No edit was applied to X. It is unchanged.                                                                    |
| Whether a property edit was skipped for want of a type.                                  | `true` if any property edit was skipped with the `untypable` reason.                                          |

### Messages

A log or error message says what happened and to which object, then what the user can do. Help
text for a value says what the value is, then its default.

### Characters and punctuation

- Do not use em dashes or en dashes. Use a hyphen with a space on each side, or restructure the
  sentence. A numeric range uses a bare hyphen (`1-5`).
- Do not use the section sign. Write "section 6".
- Do not splice two sentences with a semicolon, in comments, doc comments or markdown. Use a full
  stop when the halves are two facts, or a comma plus `and`, `so` or `but` when the second half
  follows from the first.
- A bulleted list of fragments takes no terminal punctuation. A bullet that is a complete
  sentence ends with a full stop.

## Task execution

- Complete requested changes and required checks before ending the turn. An assessment request ends
  with findings. Continue authorized, reversible work without another approval.
- Resolve routine ambiguity from repository conventions. Ask when the answer changes the scope
  or safety of the work, and finish independent work while waiting.
- Batch independent reads and searches. Sequence dependent calls and mutations. Prefer targeted
  patches, and report unrelated findings separately.
- Keep tests proportional to changed behavior and local conventions. Run required checks, then
  repeat only when edits, failures or unresolved concerns justify it.
- Give brief progress updates. Close with the outcome, verification and remaining blockers in
  plain language.
- In handoffs or compaction summaries, retain the request, constraints, decisions, rejected
  approaches, changed files, check results and next unfinished step. Preserve exact identifiers
  needed to resume.

Load scoped guidance before editing its files. Read referenced material when its task applies,
and reuse current findings already in context. Repository rules remain authoritative for local
checks and commit permissions.

When changing agent instructions or evaluating agent efficiency, read
[Agent evaluation](docs/agents/agent-evaluation.md).

## Commands

All commands run from the repo root. See `package.json` scripts for the full list.

```bash
# Verbose backend logging, any shell. The optional argument is a RUST_LOG
# filter, defaulting to ltk_manager=trace,ltk_overlay=debug,tauri=info.
pnpm dev:logged [ltk_overlay=debug]
```

`pnpm generate:licenses` requires `cargo-about` on PATH, and its config is `about.toml`.

`pnpm generate:meta-schema` reads the meta wiki's database out of its own repository rather than
from the API that serves the same bytes, because the API challenges a CI runner and cannot be
excepted - see `docs/research/meta-api-reachability-from-ci.md`. It writes nothing when the
embedded snapshot already matches.

## Code Style

**Separate logical steps with blank lines.** In every language, group statements that serve
one purpose and leave a blank line when the context changes: setup, validation, loading,
transformation, side effects, or the final result. Keep a guard beside the value it checks.
Separate function declarations, and give nested loops and branches the same logical spacing.
Expand compound control flow into braced blocks. Apply this to new and changed code, and
review the grouping after formatting, since a formatter cannot identify context boundaries.

Avoid trivially descriptive comments. Only comment non-obvious business logic, workarounds, edge cases, or a decision the code cannot show. Document all public Rust APIs with `///` doc comments.

**A comment explains the code, not the product.** The test is whether deleting it would let a
reader change this code and break something. An architectural decision - why the state is shaped
this way, why a hook is mounted here - passes. Why the _product_ behaves as it does fails,
however true the sentence is. That belongs in `docs/ux/`, and repeating it here records one
decision in two places that then drift apart.

**A comment is smaller than the code it explains.** A doc comment longer than the function under it
is the signal that the reason belongs in `docs/ux/` or an ADR with a citation left behind, or that
the code already shows it. One line is the default and one line is what most symbols get. A second
paragraph is for a decision the code cannot show, and it is a sentence or two rather than the case
for it. Count the lines before committing: on a diff where the prose outweighs the statements, the
prose is what is wrong.

**No redundant comments.** Do not add inline comments that restate what the code already expresses. If the code is descriptive enough (clear variable names, well-known patterns like temp-file-then-rename, obvious API calls), leave it uncommented. This applies to AI-generated code and suggestions too - strip narration comments before committing. The same goes for what a symbol's own doc expresses: a call site that restates the constant or type it is using is writing that doc twice. Needing the explanation there usually means the code is in the wrong place - move it beside what it explains, and the comment stops being needed.

Use clear names, small components and functions, and named constants to make the code understandable without explanatory comments.

- **One rich doc per unit** - document the exported component, hook or function with a single structured doc comment: what it does, its parts, non-obvious behaviour, accessibility, gotchas. Reference, not a story.
- **Inline comments are the exception** - only for the reason behind the code or a fact the code depends on: a hidden constraint, a workaround and its cause, a magic value. One or two lines, with the identifiers they refer to in backticks.
- **Never** narrate history ("used to", "the old X"), argue design or product decisions at length, retell the change, or restate the code. That belongs in the commit or PR.
- If comments outweigh the code around them, cut them.

**Cite a rule, do not restate it.** Code written to satisfy a documented design rule
names that rule by its code and stops - `/* Duotone rather than fill: DS-ICON-WEIGHT. */`,
not a paragraph reproducing the reasoning. `DS-*` codes are defined in the `design-system`
skill. Add a code there before citing a new one.

The same holds for a `docs/ux/` spec: name the section and the file and stop - a comment reading
`per "What an empty box lists" in docs/ux/WORKSHOP.md` and nothing more. A citation sits at a file
header or a module's exported entry point, never on a statement, and only where prose was removed.
It identifies the source of the removed prose. Use a repository-root path so moving the code
does not change the reference.

**Doc comments.**

- Function or hook: the first sentence starts with a third-person present-tense verb and says
  what it does: "Returns", "Reads", "Lowers". Each condition, fallback and failure follows as its
  own sentence: "Returns `None` if ...", "Fails if ...".
- Type, field, constant or React component: a noun phrase that names what it is. Add a sentence
  only for a constraint, a unit or an invariant that the name does not show.
- Module: the first sentence says what the module does or provides.
- Do not restate the signature, and do not describe how the code changed over time.
- Write in the third person and the present tense, never `we` or `you`. Drop `note that`,
  `simply`, `just` and `basically`.

```
Bad   /** This function takes the verdicts and builds a string out of them. */
Good  /** Joins the verdicts of a library into one string that two runs compare. */

Bad   /** The game's copy of `chunk`: the one in the first archive that holds it. */
Good  /** Reads `chunk` from the first archive that contains it. */
```

**Test names.** Name a Rust test `subject_behavior` or `subject_behavior_condition` in snake
case, using identifiers from the code: `chunk_reads_from_first_archive_containing_it`. In Vitest,
`describe` names the subject identifier and `it` states the behavior, then the condition:
`it("returns null if no archive contains the chunk")`.

## Commits and PRs

One conventional-commit subject line. No body, no trailers, no `Co-Authored-By`. A PR takes that
same subject as its title. Never commit or push unasked.

**A PR body declares what the change is.** Terse statements of what the code does, grouped by
area, as a list. No prose paragraphs, no account of how the work went, and no wording bound to a
moment (`now`, `previously`, `no longer`, `new`) unless a reader has to act on the transition, as
with a migration or a breaking change.

```
Bad   Previously a save could race, so this PR now writes through a temp file instead.
Good  A collider save writes through a temporary file of its own.

Bad   I reworked the Physics pane after the split layout turned out not to work.
Good  The Physics pane shows the list or the picked item's fields, never both.
```

**A subject names the change, it does not describe it.** A plain verb and a domain noun phrase,
roughly three to six words, in the codebase's own vocabulary. No contrastive clause, no mechanism,
no narrative verb, and drop articles that carry nothing.

```
Bad   fix(Problems): tell a volume texture from a resource type the repair cannot write
Good  fix(Problems): warn on unwritable texture resource type

Bad   feat(mods): edit a removal into the archive instead of repacking it
Good  feat(mods): support delta target dropping

Bad   fix(mods): rebuild the installed game index when the game build changes
Good  fix(mods): key game content cache on build
```

### The same shape everywhere, on different vocabulary

A title is a terse noun phrase wherever one is written, and what changes between them is only which
words the reader knows.

| What                | Common ground with the reader                |
| ------------------- | -------------------------------------------- |
| Commit and PR title | the codebase's own vocabulary                |
| Issue title         | the same, and the rule id where there is one |
| Rule title, UI copy | whatever the product itself documents        |

**The test for a word is whether the product teaches it, not whether it sounds technical.**
`Meta property type mismatch` is a good user-facing title: `meta` is a word a mod user meets in the
tooling and at <https://meta-wiki.leaguetoolkit.dev/>, so it is shared vocabulary, and the phrase
is four nouns with nothing else in it. A relative clause is what makes a title read badly, not a
domain word - `Texture size the format cannot hold` is worse than `Block-unaligned texture size`
for that reason alone.

Two things keep their own shape. An **ADR title** is a declarative sentence, because the title is
the decision - `A repair rewrites the archive in place`. A **test name** follows "Test names"
under "Code Style".

A rule's `description` is a sentence by contract - one for a reader who has not met the state. It
is the title that is a noun phrase.

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

Single-context, with one `GLOSSARY.md` and one `docs/adr/` at the repo root. See
`docs/agents/domain.md`.

### Worktrees

A fresh worktree has no `node_modules` and no submodule checkout. Before a check, a commit, a
build or an app launch in one, see `docs/agents/worktrees.md`.

### CodeGraph

In a checkout indexed by CodeGraph (`.codegraph/` at the repo root), the index reads the code but
has blind spots:

- The Tauri command boundary has no edge. `api.fooBar` in `src/lib/tauri.ts` calls
  `commands.fooBar` in `src/lib/bindings.ts` or a service's `src/lib/ipc/<service>.ts`, which
  invokes the string `"foo_bar"` or `"plugin:<service>|foo_bar"`, the Rust command of that name
  in `src-tauri/src/ipc.rs` or `src-tauri/src/services/table.rs`. An explore query that names both
  sides (`fooBar foo_bar`) returns the whole flow.
- A cross-language `calls` or `imports` edge is a name collision (Rust `.unwrap()` resolves to
  `src/utils/result.ts`), unless the target is a generated binding type. Qualified Rust names such as
  `GameDir::resolve` keep callers exact.
- `codegraph affected` sees no Rust tests, because they are inline `#[cfg(test)]` modules. Rust
  test impact is `cargo test`, scoped with `-p` to the crate touched.
- `docs/` is outside the index. The reasons in `docs/ux/` and `docs/adr/` are found by grep.
