# ADR-0072: An event bank document steps the bins it edits

- **Status:** Accepted (2026-10-30)
- **Date:** 2026-10-30
- **Crates:** `src-tauri`, where `services::audio::linked` holds the bin documents and the steps
- **Related:** [ADR-0051](0051-a-bin-document-takes-every-edit-through-one-command.md),
  [ADR-0071](0071-an-event-bank-document-holds-its-media-files.md), "Bank unit events" in
  `docs/ux/AUDIO.md`, #958

## Context and problem statement

A created, renamed or deleted event changes the `events` list of the bank units that name its
bank. That is a bin edit that one action of the event bank makes. The bin may have no tab open, and a bin document whose last id closes
drops its unsaved edits.

## Considered options

- The frontend opens each bin as a tab and edits it there, with its own undo
- The bank save writes the bins at once, with no undo
- The event bank document holds the bins open and keeps their steps beside its own

## Decision

**The event bank document holds every bin it edits.** The shell opens the bin through
`BinDocuments::open` on the first edit and closes it with the bank. Each bin edit is one
`EditProperty` through `BinDocuments::apply` (ADR-0051), one step of that bin's history.

**One action is one step of the bank's history.** The shell keeps a list of steps, each naming
whether the bank took a step and which bins did. Undo and redo take the step and step the bank and
each bin. A save of the bank writes the bins with an unsaved step.

**A game bin is copied into the layer first.** If only the game declares the unit, its bin is
written into the project layer before the edit, as a game bank is on its first edit.

## Consequences

- A created event's name survives a reopen of the bank, because a bin of the project lists it.
- A bin tab over the same file reads the same tree, so it shows the edit. Its own undo reverts the
  step too, and an undo in the bank after it reverts the step before.
- A unit that does not take the edit, such as one of a `PTCH` bin, is logged and the bank edit
  stays.
