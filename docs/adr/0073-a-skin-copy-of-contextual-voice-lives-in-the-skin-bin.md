# ADR-0073: A skin's copy of contextual voice lives in the skin bin

- **Status:** Accepted (2026-10-30)
- **Date:** 2026-10-30
- **Crates:** none. The frontend sends one `createAndEdit` through `bin_edit`
- **Related:** [ADR-0051](0051-a-bin-document-takes-every-edit-through-one-command.md),
  [ADR-0068](0068-a-read-resolves-a-linked-object-in-the-backend.md), "Shared object" in
  `docs/ux/CONTEXTUAL_VOICE.md`

## Context and problem statement

A skin reaches its voice lines through `SkinCharacterDataProperties.mContextualActionData`, a link
to a `ContextualActionData` object. The game ships 11,568 links to 511 objects, and most skins link
the champion's `*_Base` object, so an edit of `Lux_Base` changes 96 skins. There is no inheritance:
a skin links the base object, or an object of its own that the client reads alone. A modder who
wants lines for one skin needs a copy of the object and a link to it.

## Considered options

- Declare the copy in a bin of its own, as the game ships `*_SkinNN` objects in merged bins
- Declare the copy in the skin bin, beside the skin object that links it
- Edit the shared object only, and leave a copy to the tree

## Decision

**The copy is declared in the skin bin.** Copy for this skin reads the object as clipboard text,
then sends one `createAndEdit` to the skin bin's document: it creates the copy from that text as
`<path>_SkinNN`, sets the copy's `mObjectPath` to its name, and sets the skin's
`mContextualActionData` to the copy. The skin bin is the file the client loads for the skin, so the
copy needs no `linked` entry and no file of its own.

**The three changes are one step of the skin bin's history.** One undo in the skin bin reverts the
copy, the rename and the relink together. The shared object is not changed.

## Consequences

- The copy's tab opens over the skin bin, and the view remembers the skin as the copy's skin.
- A skin bin that is not a `skinN.bin` gives the copy no name, and the view refuses the copy.
- The client is not confirmed to load a `ContextualActionData` object from a skin bin. An in-game
  check of a copied object is open, as the bank checks of #954 were.
