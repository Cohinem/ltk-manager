# ADR-0028: An object is a document of its own

- **Status:** Accepted (2026-09-05)
- **Date:** 2026-09-05
- **Crates:** `ltk-manager-core`, `src-tauri`
- **Related:** [ADR-0026](0026-a-saved-bin-is-written-from-the-tree-the-backend-holds.md),
  whose held tree the document reads. [ADR-0027](0027-a-node-is-addressed-by-the-games-property-path.md),
  whose address every row of the document carries. The rule is stated in "The object tab" in
  `docs/ux/BIN_EDITOR.md`. The tree that opens one is "Objects browser" in
  `docs/ux/PROJECT_EDITOR.md`.

## Context and problem statement

The game's content is authored as objects with paths. A `.bin` is the packaging of some of
them. The object index holds every declaration of the install as `(object hash, class hash,
declaring chunk)`, and the project bar answers a path with its declarations. A bin file tab
draws every object of one file as a block. The unit a modder names is the object. The unit the
editor opens is the file.

One object hash has several declarations where files overlap. The install declares
`Characters/Aatrox/Skins/Skin0` in one chunk, and a layer of the project declares it in a
copy of that chunk. The two declarations differ in bytes. A modder diffing them wants both on
screen at once.

An `ObjectLink` names an object and not a file. A file tab resolves a link among the objects
the file holds. The index resolves a link among the objects the install and the project hold.

## Decision

**An object opens as a document of its own, keyed on its declaration: the asset and the object
hash.** Two declarations of one hash are two documents. The tab's title is the last segment of
the object path, its context line the declaring file, its Copy path the full object path.

The document reads the tree ADR-0026 holds for the asset. Its rows are the object's properties
from depth zero, addressed per ADR-0027 with the object as the entry. A file tab and the object
tabs over one asset share one held tree. The bound on held trees counts assets and not tabs.

The header carries the class, the property count, the declaring file, and the other
declarations of the hash as the index holds them. Each other declaration opens as its own
document.

An object tab is a preview document. A single open replaces the previous preview, a double
click pins, and `Ctrl+Enter` opens beside.

**A link to an object resolves through the index and opens an object document.** The order is
a declaration in this file, then one in a file the bin depends on, then the first in archive
order, with the rest in the header. A `hash` value the index declares resolves the same way.
A value nothing declares is text.

## Consequences

- **Positive:** a `$` hit, a link, an Objects browser row and a References row open the same
  kind of tab. Every place an object is named has one target.
- **Positive:** the install's declaration and a layer's sit side by side as two tabs. The
  layout is the diff, and the editor draws none.
- **Positive:** a file tab draws every object of its file, and an object tab draws one. Neither
  changes shape for the other.
- **Negative:** the other declarations and the links of an object tab are answers of the index.
  With the index absent, the header offers the build, and a link outside the file builds the
  index on click.
- **Negative:** a declaration is a file's. An object tab over a layer's bin is bound to that
  layer's copy, and a layer reorder or a copy into another layer opens a second tab rather than
  moving the first.
- **Neutral:** the index is the resolver and not the store. An object tab reads its bytes
  through the asset, and the index answers only where else the hash is declared.
- **Neutral:** the navigation history keys an object tab on its declaration and restores its
  expanded set and scroll, the position rule every document follows.
