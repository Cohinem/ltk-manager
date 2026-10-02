# ADR-0061: Layout is a primitive's props, not a class string

- **Status:** Proposed
- **Date:** 2026-10-02
- **Crates:** none, `src/components/Layout.tsx`, `src/components/PageInset.tsx`,
  `src/components/ReadingColumn.tsx`, `src/styles/layout.css`

## Context and problem statement

Of the 3,905 static `className` strings under `src/`, 1,022 hold layout utilities and nothing else,
and another 1,538 mix layout with visual classes. A call site that writes `flex flex-col gap-2`
depends on Tailwind for a decision that has nothing to do with Tailwind.

The utilities also split the spacing scale in two. `--spacing-1` to `--spacing-12` are aliased to
the 4.5px `--space-*` tokens, but Tailwind computes a half step from its own `--spacing` of
`0.25rem`. `gap-2` is 9px, `gap-2.5` is 10px, and `gap-1.5` is 6px, so neighbouring steps are not
on one scale.

The frames repeat as well. The inset panel under the toolbar was pasted into Home and Library, and
five scrolling pages each chose their own maximum width and padding.

## Considered options

1. **Keep utilities, add a lint rule.** It stops `space-*` and catches nothing else, and every call
   site still depends on Tailwind.
2. **A 12-column Row and Col grid.** The grids in the app are column templates such as
   `max-content minmax(0,1fr) 3.5rem auto`, which twelve equal tracks cannot express.
3. **A small set of layout primitives with typed props, and named frames over them.**

## Decision

Option 3.

`Stack`, `Inline`, `Grid` and `Fill` take a `gap` from the `Space` union, alignment as a keyword,
and an `as` element. They set custom properties inline, and `src/styles/layout.css` reads them, so
the primitives do not depend on Tailwind. Each one sets every property it reads, so a nested
primitive inherits nothing from its parent. A whole step resolves to its `--space-*` token and a
half step to a multiple of `--space-001`, so every gap is on the zoomed 4.5px scale.

The primitives take no `className`. A box that needs a fill, a border or padding is a named
component rather than a layout primitive with classes on it.

`Grid` takes a column count, a template, or a minimum column width, and `collapseBelow` drops it to
one column under a breakpoint.

`PageInset` and `ReadingColumn` are the first frames. `Dialog.Body` stacks its children with a gap,
and `Tabs.Panel` no longer sets a margin, so the parent decides the spacing in both, per DS-GAP.

## Consequences

Module code lays out with the primitives, and a file is converted when it is touched for something
else. Settings, Home, Library and the Diagnostics System tab are converted in this change.

A half step converted to a primitive grows by a quarter: `gap-1.5` is 6px and `gap={1.5}` is
6.75px.

A grid that reorders its children at a breakpoint stays on utilities until `Grid` can express that.
Home's two columns are the one case so far.

Visual classes - type tiers, fills, borders, radius - are not covered. `Text` and `Surface`
components are the next step, after which Tailwind is an implementation detail of
`src/components`.
