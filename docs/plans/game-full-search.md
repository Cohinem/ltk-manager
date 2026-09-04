# Game Full Search — Implementation Plan

> Status: **implemented** (2026-08-20).
>
> The command bar's game source answers with a ranked page
> ([Project Command Bar](./project-command-bar.md), step 6). This is the other search: every
> hit, filtering the game index document itself. WAD chunk paths only for now — the project's
> own files keep the palette until a content search earns its place.

## 1. What it is

A search box in the game index document's toolbar that filters the tree below it. Empty, the
document is the lazy browse tree it always was. Typed into, the body swaps to the tree the
pattern leaves — every matching file under its real directories — and back without losing
where the browse had gotten to. Regex is a toggle (`.*`), and every match is
case-insensitive — a resolved WAD path is lowercase by construction, so a case toggle would
only teach a pattern to miss. Routes in: `Ctrl+Shift+F`, the magnifier in the sidebar's
project row, and **Search the game files** in the command palette's Game group — each opens
the document and focuses the box.

## 2. The backend

| Piece        | Where                                                                  |
| ------------ | ---------------------------------------------------------------------- |
| The pattern  | `matcher::FindQuery`, a compiled `regex::Regex`, literal input escaped |
| The scan     | `GameIndex::find`, a `FindScan` walking the arena depth first          |
| Cancellation | `FindGeneration`, its own counter apart from the palette's             |
| The command  | `find_in_game_index`, on `spawn_blocking` like every other index read  |
| The frontend | `useGameFind` (200ms debounce), then `GameDocument`                    |

Decisions, and why:

- **One matcher, not two.** A literal is `regex::escape`d and compiled like a regex, so both
  modes ride one code path and the `.*` toggle changes the parser rather than the scan
- **Tree order, no ranking.** The walk is depth first over the same arena the palette scans,
  so hits arrive in the order the game browser lists them and nothing sorts 800k rows. The
  letter-mask pruning stays with the palette — a regex has no letter mask to test
- **Capped at 20,000 rows, counted past it.** `FIND_LIMIT` is the figure VS Code stops at.
  `total` keeps counting, so the count line can say `first 20,000 of 213,456 matches`, and the
  fix past the cap is a narrower pattern
- **A parse error is an answer.** An invalid regex reports `VALIDATION_FAILED` with the
  parser's own message, which the document draws under the box in mono while the last good
  answer stays in the tree. Half-typed patterns are the normal case while typing a regex
- **Empty runs are not hits.** `x*` matches the empty string everywhere. `FindQuery::matches`
  keeps only non-empty runs, and a file with none is no result
- **Unnamed chunks come last, matched by hash**, the same contract as the palette's search,
  and `unnamed` still says when the whole install resolved to nothing
- **A hit is a tree entry.** `GameFindHit` carries the full resolved path (`None` when only
  the hash names the chunk) and the chunk's size, the same shape as a browse listing's file,
  so the frontend pours the hits straight into `buildSourceTree`. The marked runs still
  arrive split at the basename, and `name_ranges` is what the row highlights

## 3. The frontend

The search lives in `GameDocument`, not in a surface of its own. The box sits in the
document's toolbar row, and a non-empty pattern swaps the body from the lazy browse tree to a
filtered one — hidden rather than unmounted, so the browse tree's expanded directories
survive a search and back.

The filtered view is the same `SourceTree` the browse mode renders, built by `buildSourceTree`
over the flat hits, so grouping under common directories, file-kind icons, sizes, the context
menu and the tree's keyboard model all come for free. It starts fully expanded, because the
hits are what the pattern was typed to see, and a directory collapses like any other row.
Matched runs mark the file names through `MarkedText`, carried on the entry as `nameRanges`.

Every route in goes through `useRevealGameSearch`, which opens the document and bumps a
counter the box focuses on. The box remounts on every switch back to the tab — its toolbar is
a portal that only the active document fills — so the counter pairs with an `answered` mark,
and only the reveal a route caused takes the focus. `Enter` or `ArrowDown` in the box hands
the keyboard to the rows, `Escape` clears the pattern, and the count line and spinner ride
the toolbar beside the box.

## 4. What is left

| Item                      | Why it waits                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Project files as a source | "WAD files only for now" is the ask. The content tree is small enough to filter on the frontend                                      |
| Directory rows marking    | A dir row shows one segment of many hits' `path_ranges`. Mapping runs onto folded segment labels is real work for a subtle highlight |
| Open beside from the tree | `SourceTree`'s `onOpen` carries no modifier, so a hit opens over the browse. The palette's `Ctrl+Enter` model is the shape to follow |
| A measurement of the scan | No League install on this machine. The regex crate's literal path is memmem, so the literal mode should beat the palette's own scan  |
| A test over the document  | `useVirtualizer` wants a `ResizeObserver` jsdom does not give. The keyboard model is the tree's, and the scan is covered in Rust     |
